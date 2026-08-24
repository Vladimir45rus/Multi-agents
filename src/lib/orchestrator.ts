import "server-only";

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@/db";
import { agentEvents, agents, orchestratorReports } from "@/db/schema";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { completeProviderResponse, providerRequestFromAgent, type GatewayMessage } from "@/lib/provider-gateway";
import { getProviderPreset } from "@/lib/providers";
import { parsePatchInstruction } from "@/lib/patch-parser";
import { ensureWorkspaceBootstrap, getStoredProviderApiKey, getWorkspaceSettingsRow } from "@/lib/workspace";
import { buildProjectContext, type ProjectContextInput } from "@/lib/project-context";
import { recordSystemEvent } from "@/lib/system-events";
import { saveActiveTaskState, clearActiveTaskState } from "@/lib/orchestrator-state";
import { applyWorkspacePatch, getWorkspaceRoot, type WorkspacePatchFile } from "@/lib/workspace-files";
import { runSandboxCommand } from "@/lib/terminal-sandbox";
import type {
  AgentEvent,
  AgentEventType,
  CheckResult,
  CheckStatus,
  EventStatus,
  OrchestratorMode,
  OrchestratorRole,
  OrchestratorStep,
  OrchestratorStreamEvent,
  ReleaseReport,
  ReleaseStatus,
} from "@/lib/orchestrator-types";

type Locale = "ru" | "en";
type AdviceStance = "approve" | "change" | "blocker" | "unknown";

type AdviceResult = {
  agent: typeof agents.$inferSelect;
  role: OrchestratorRole;
  advice?: string;
  stance?: AdviceStance;
  error?: string;
};

type CheckSpec = {
  name: string;
  command: string;
  run: boolean;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const DEFAULT_MAX_ITERATIONS = 5;
const MIN_MAX_ITERATIONS = 5;
const MAX_MAX_ITERATIONS = 10;

// In-process registry of active tasks so the cancel endpoint can abort a running stream.
const taskControllers = new Map<string, AbortController>();

// Pending user confirmations (controlled mode), keyed by confirmation id.
const pendingConfirmations = new Map<string, (approved: boolean) => void>();

const ADVISOR_INSTRUCTIONS: Record<OrchestratorRole, { ru: string; en: string }> = {
  architect: {
    ru: "Оценивай структуру, модули, потоки данных и масштабируемость.",
    en: "Evaluate structure, modules, data flow and scalability.",
  },
  reviewer: {
    ru: "Оценивай читаемость, корректность, API-дизайн и поддерживаемость.",
    en: "Evaluate readability, correctness, API design and maintainability.",
  },
  tester: {
    ru: "Оценивай крайние случаи, покрытие тестами и риски регрессий.",
    en: "Evaluate edge cases, test coverage and regression risks.",
  },
  security: {
    ru: "Оценивай уязвимости, инъекции, секреты и контроль доступа.",
    en: "Evaluate vulnerabilities, injection, secrets and access control.",
  },
  advisor: {
    ru: "Дай аргументированную рекомендацию по задаче.",
    en: "Give a reasoned recommendation for the task.",
  },
  main: {
    ru: "Фиксируй единое итоговое решение.",
    en: "Record a single final decision.",
  },
  observer: {
    ru: "Наблюдай, не вмешиваясь.",
    en: "Observe without intervening.",
  },
  orchestrator: {
    ru: "Координируй агентов.",
    en: "Coordinate the agents.",
  },
};

const PATCH_JSON_INSTRUCTION: Record<Locale, string> = {
  ru: `Отвечай СТРОГО одним JSON-объектом (без markdown):\n{"decision": "краткое единое решение", "patches": [{"path": "src/foo.ts", "operation": "modify", "content": "..."}]}\noperation — одно из: create | modify | delete. Для create/modify "content" обязателен, для delete отсутствует. Если код менять не нужно — "patches": [].`,
  en: `Respond with a SINGLE JSON object only (no markdown):\n{"decision": "concise unified decision", "patches": [{"path": "src/foo.ts", "operation": "modify", "content": "..."}]}\noperation is one of: create | modify | delete. For create/modify "content" is required, for delete omit it. If no code change is needed, use "patches": [].`,
};

export class OrchestratorCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorCancelledError";
  }
}

function t(locale: Locale, ru: string, en: string) {
  return locale === "en" ? en : ru;
}

function compact(value: string | null | undefined) {
  return (value ?? "").trim();
}

function normalizeLocale(locale?: string): Locale {
  return locale === "en" ? "en" : "ru";
}

function normalizeMode(mode?: string): OrchestratorMode {
  return mode === "controlled" ? "controlled" : "autonomous";
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.round(value), max));
}

function roleLabel(locale: Locale, role: OrchestratorRole) {
  const labels: Record<OrchestratorRole, string> = {
    main: t(locale, "Главный", "Lead"),
    architect: t(locale, "Архитектор", "Architect"),
    reviewer: t(locale, "Ревьюер", "Reviewer"),
    tester: t(locale, "Тестировщик", "Tester"),
    security: t(locale, "Секурити", "Security"),
    advisor: t(locale, "Советник", "Advisor"),
    observer: t(locale, "Наблюдатель", "Observer"),
    orchestrator: t(locale, "Оркестратор", "Orchestrator"),
  };
  return labels[role] ?? role;
}

function summarize(text: string) {
  const clean = compact(text).replace(/\s+/g, " ");
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean;
}

function assertNotAborted(signal: AbortSignal | undefined, locale: Locale) {
  if (signal?.aborted) {
    throw new OrchestratorCancelledError(t(locale, "Оркестратор остановлен.", "Orchestrator stopped."));
  }
}

function toAgentEvent(row: typeof agentEvents.$inferSelect): AgentEvent {
  return {
    id: row.id,
    taskId: row.taskId,
    type: row.type as AgentEventType,
    agentId: row.agentId,
    agent: row.agentName,
    role: row.role as OrchestratorRole,
    filePath: row.filePath,
    line: row.line,
    status: row.status as EventStatus,
    arguments: row.arguments,
    proposal: row.proposal,
    iteration: row.iteration,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function toReport(row: typeof orchestratorReports.$inferSelect): ReleaseReport {
  return {
    id: row.id,
    taskId: row.taskId,
    task: row.task,
    status: row.status as ReleaseStatus,
    changedFiles: row.changedFiles ?? [],
    checkResults: (row.checkResults ?? []).map((result) => ({
      name: result.name,
      command: result.command,
      status: result.status as CheckStatus,
      output: result.output,
    })),
    summary: row.summary,
    iterations: row.iterations,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

async function recordEvent(payload: {
  taskId: string;
  type: AgentEventType;
  agent: string;
  role: OrchestratorRole;
  agentId?: number | null;
  filePath?: string | null;
  line?: number | null;
  status?: EventStatus;
  arguments?: string;
  proposal?: string;
  iteration: number;
}): Promise<AgentEvent> {
  const [row] = await db
    .insert(agentEvents)
    .values({
      taskId: payload.taskId,
      type: payload.type,
      agentId: payload.agentId ?? null,
      agentName: payload.agent,
      role: payload.role,
      filePath: payload.filePath ?? null,
      line: payload.line ?? null,
      status: payload.status ?? "open",
      arguments: payload.arguments ?? "",
      proposal: payload.proposal ?? "",
      iteration: payload.iteration,
    })
    .returning();

  return toAgentEvent(row);
}

async function finalizeReport(payload: {
  taskId: string;
  task: string;
  status: ReleaseStatus;
  changedFiles: string[];
  checkResults: CheckResult[];
  summary: string;
  iterations: number;
}): Promise<ReleaseReport> {
  const [row] = await db
    .insert(orchestratorReports)
    .values({
      taskId: payload.taskId,
      task: payload.task,
      status: payload.status,
      changedFiles: payload.changedFiles,
      checkResults: payload.checkResults,
      summary: payload.summary,
      iterations: payload.iterations,
    })
    .returning();

  return toReport(row);
}

export async function listOrchestratorEvents(limit = 100) {
  const rows = await db.select().from(agentEvents).orderBy(desc(agentEvents.id)).limit(limit);
  return rows.reverse().map(toAgentEvent);
}

export async function listOrchestratorReports(limit = 20) {
  const rows = await db.select().from(orchestratorReports).orderBy(desc(orchestratorReports.id)).limit(limit);
  return rows.reverse().map(toReport);
}

export function registerTaskController(taskId: string) {
  const existing = taskControllers.get(taskId);
  if (existing) return existing;
  const controller = new AbortController();
  taskControllers.set(taskId, controller);
  return controller;
}

export function abortTask(taskId: string) {
  const controller = taskControllers.get(taskId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function releaseTaskController(taskId: string) {
  taskControllers.delete(taskId);
}

export function resolveConfirmation(confirmationId: string, approved: boolean) {
  const resolver = pendingConfirmations.get(confirmationId);
  if (!resolver) return false;
  pendingConfirmations.delete(confirmationId);
  resolver(approved);
  return true;
}

function waitForConfirmation(confirmationId: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OrchestratorCancelledError("cancelled"));
      return;
    }

    const onAbort = () => {
      pendingConfirmations.delete(confirmationId);
      reject(new OrchestratorCancelledError("cancelled"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    pendingConfirmations.set(confirmationId, (approved) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(approved);
    });
  });
}

function agentFailureMessage(locale: Locale, agent: typeof agents.$inferSelect, error: unknown) {
  const message = error instanceof Error ? error.message : t(locale, "неизвестная ошибка", "unknown error");
  return t(
    locale,
    `Агент ${agent.name} (${getProviderPreset(agent.provider).label} / ${agent.model}) недоступен: ${message}. Остальные агенты продолжат работу.`,
    `Agent ${agent.name} (${getProviderPreset(agent.provider).label} / ${agent.model}) is unavailable: ${message}. Other agents will continue.`,
  );
}

function sanitizeAgentPrompt(value: string) {
  return compact(value)
    .replace(/(?:\b(?:you are|you're|i am|i'm|identify as|call yourself|present yourself as)\b|\b(?:ты|я|представляйся|называй себя)\b)[^.!?\n]*(?:gpt|claude|liquid|lfm|foundation model)[^.!?\n]*[.!?]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function basePersona(locale: Locale, agent: typeof agents.$inferSelect) {
  const skill = compact(agent.skill);
  const prompt = sanitizeAgentPrompt(agent.systemPrompt);
  if (skill && prompt) return `${skill}. ${prompt}`;
  if (skill) return skill;
  if (prompt) return prompt;
  return t(locale, "Ты агент в мультиагентной IDE.", "You are an agent in a multi-agent IDE.");
}

function ideIdentityInstruction(locale: Locale, agent: typeof agents.$inferSelect) {
  return t(
    locale,
    `Твоя реальная роль: ${agent.role}. Провайдер: ${getProviderPreset(agent.provider).label}. Модель: ${agent.model}. Не выдумывай другое имя и не утверждай, что у тебя нет доступа к локальным файлам: используй переданный IDE PROJECT CONTEXT.`,
    `Your actual role is ${agent.role}. Provider: ${getProviderPreset(agent.provider).label}. Model: ${agent.model}. Do not invent another name or claim that you lack access to local files: use the provided IDE PROJECT CONTEXT.`,
  );
}

function mainSystemPrompt(locale: Locale, agent: typeof agents.$inferSelect) {
  const persona = basePersona(locale, agent);
  const instruction = t(
    locale,
    "Ты Главный агент — единственный, кто фиксирует итоговое решение и применяет изменения. Отвечай конкретно и проверяемо.",
    "You are the Lead agent — the only one who fixes the final decision and applies changes. Be concrete and verifiable.",
  );
  return `${ideIdentityInstruction(locale, agent)} ${persona} ${instruction}`;
}

function advisorSystemPrompt(locale: Locale, agent: typeof agents.$inferSelect, role: OrchestratorRole) {
  const persona = basePersona(locale, agent);
  const scope = ADVISOR_INSTRUCTIONS[role] ?? ADVISOR_INSTRUCTIONS.advisor;
  const instruction = t(
    locale,
    "Ты советник. Не редактируй код и не выдавай себя за Главного. Анализируй и передавай рекомендации.",
    "You are an advisor. Do not edit code or impersonate the Lead. Analyze and send recommendations.",
  );
  return `${ideIdentityInstruction(locale, agent)} ${persona} ${instruction} ${locale === "en" ? scope.en : scope.ru}`;
}

function planPrompt(locale: Locale, task: string) {
  return t(
    locale,
    `Задача: ${task}\n\nСоставь краткий план решения: шаги, ключевые файлы и риски.`,
    `Task: ${task}\n\nProduce a concise solution plan: steps, key files and risks.`,
  );
}

function advicePrompt(locale: Locale, task: string, plan: string, iteration: number, lastTestFailure: string, role: OrchestratorRole) {
  const testNote = lastTestFailure
    ? t(locale, `Предыдущая проверка завершилась ошибкой:\n${lastTestFailure}`, `The previous check failed:\n${lastTestFailure}`)
    : "";
  return t(
    locale,
    `Задача: ${task}\n\nПлан Главного:\n${plan || "(нет)"}\n${testNote ? `\n${testNote}` : ""}\n\nДай конкретную рекомендацию как ${roleLabel(locale, role)} (итерация ${iteration}).`,
    `Task: ${task}\n\nLead plan:\n${plan || "(none)"}\n${testNote ? `\n${testNote}` : ""}\n\nGive a concrete recommendation as ${roleLabel(locale, role)} (iteration ${iteration}).`,
  );
}

function consolidationPrompt(
  locale: Locale,
  task: string,
  plan: string,
  adviceResults: AdviceResult[],
  conflicts: Array<{ a: string; b: string; reason: string }>,
  lastTestFailure: string,
) {
  const adviceText = adviceResults
    .filter((result) => result.advice)
    .map((result) => `[${roleLabel(locale, result.role)} — ${result.agent.name}]\n${result.advice}`)
    .join("\n\n");

  const conflictText = conflicts.length
    ? `${t(locale, "Выявленные конфликты:", "Detected conflicts:")}\n${conflicts
        .map((conflict) => `- ${conflict.a} ↔ ${conflict.b} (${conflict.reason})`)
        .join("\n")}`
    : "";

  const testNote = lastTestFailure
    ? t(locale, `Предыдущая проверка завершилась ошибкой:\n${lastTestFailure}`, `The previous check failed:\n${lastTestFailure}`)
    : "";

  return t(
    locale,
    `Задача: ${task}\n\nПлан:\n${plan || "(нет)"}\n\nРекомендации советников:\n${adviceText || "(нет)"}\n${conflictText ? `\n${conflictText}` : ""}${testNote ? `\n${testNote}` : ""}\n\nРазреши конфликты и зафиксируй ЕДИНОЕ решение.`,
    `Task: ${task}\n\nPlan:\n${plan || "(none)"}\n\nAdvisor recommendations:\n${adviceText || "(none)"}\n${conflictText ? `\n${conflictText}` : ""}${testNote ? `\n${testNote}` : ""}\n\nResolve conflicts and record a SINGLE decision.`,
  ) + `\n\n${PATCH_JSON_INSTRUCTION[locale]}`;
}

function fixPrompt(locale: Locale, task: string, failureLog: string) {
  return t(
    locale,
    `Задача: ${task}\n\nПроверки завершились с ошибкой:\n${failureLog}\n\nПроанализируй ошибку/стек-трейс и сформируй исправляющий патч.`,
    `Task: ${task}\n\nChecks failed:\n${failureLog}\n\nAnalyze the error/stack trace and produce a fixing patch.`,
  ) + `\n\n${PATCH_JSON_INSTRUCTION[locale]}`;
}

function toAdvisorRole(role: string): OrchestratorRole {
  const cleaned = compact(role).toLowerCase();
  if (["architect", "reviewer", "tester", "security"].includes(cleaned)) return cleaned as OrchestratorRole;
  return "advisor";
}

function resolveAdvisors(rows: typeof agents.$inferSelect[]) {
  return rows
    .filter((agent) => compact(agent.role).toLowerCase() !== "observer")
    .map((agent) => ({ agent, role: toAdvisorRole(agent.role) }));
}

function findAdvisor(rows: typeof agents.$inferSelect[], role: string) {
  return rows.find((agent) => compact(agent.role).toLowerCase() === role);
}

function classifyStance(text: string): AdviceStance {
  const lower = text.toLowerCase();
  const blockerRu = /(уязвим|критич|небезопасн|ошибк|нельзя|запрещ|утечк|инъекц|опасн|блокирую)/;
  const blockerEn = /(critical|vulnerab|insecure|error|must not|blocker|dangerous|injection|leak|exploit|do not|never)/;
  const approveRu = /(одобр|хорошо|вс[её] ок|все ок|норм|готов|проблем нет|\bок\b)/;
  const approveEn = /(looks good|approve|approved|no issue|no problem|lgtm|fine|\bok\b|good to go)/;

  if (blockerRu.test(lower) || blockerEn.test(lower)) return "blocker";
  if (approveRu.test(lower) || approveEn.test(lower)) return "approve";
  return "change";
}

function detectConflicts(locale: Locale, results: AdviceResult[]) {
  const conflicts: Array<{ a: string; b: string; reason: string }> = [];
  const withAdvice = results.filter((result) => result.advice);

  for (let i = 0; i < withAdvice.length; i += 1) {
    for (let j = i + 1; j < withAdvice.length; j += 1) {
      const left = withAdvice[i];
      const right = withAdvice[j];
      if (!left.stance || !right.stance) continue;
      const opposite =
        (left.stance === "blocker" && right.stance === "approve") || (left.stance === "approve" && right.stance === "blocker");
      if (opposite) {
        conflicts.push({
          a: `${left.agent.name} (${roleLabel(locale, left.role)})`,
          b: `${right.agent.name} (${roleLabel(locale, right.role)})`,
          reason: t(locale, "противоположные оценки", "opposite assessments"),
        });
      }
    }
  }

  return conflicts;
}

async function completeAgent(
  agent: typeof agents.$inferSelect,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  jsonMode = false,
  locale: Locale = "ru",
  projectContext?: ProjectContextInput,
) {
  try {
    const apiKey = await getStoredProviderApiKey(agent.provider);
    const request = providerRequestFromAgent(agent, apiKey);
    const settings = await getWorkspaceSettingsRow();
    const fallbackModels = Array.isArray(settings.fallbackModels) ? settings.fallbackModels : [];
    const context = await buildProjectContext(projectContext);
    const templatePrompt = compact(settings.projectTemplatePrompt);
    const refreshedSystemPrompt = `${systemPrompt}\n\n=== CURRENT PROJECT CONTEXT (REFRESHED) ===\n${context}`;
    const messages: GatewayMessage[] = [
      { role: "system", content: templatePrompt ? `${refreshedSystemPrompt}\n\nPROJECT TEMPLATE SPECIALIZATION:\n${templatePrompt}` : refreshedSystemPrompt },
      { role: "user", content: `${userPrompt}\n\n${context}` },
    ];
    return await completeProviderResponse(request, messages, {
      signal,
      jsonMode,
      fallbackModels,
      onFallback: async (model, error) => {
        await recordSystemEvent("warning", "fallback", `${agent.name}: ${agent.model} failed (${error.status ?? "timeout"}); switched to ${model}`);
      },
    });
  } catch (error) {
    throw new Error(agentFailureMessage(locale, agent, error), { cause: error });
  }
}

function summarizePatches(locale: Locale, patches: WorkspacePatchFile[]) {
  if (patches.length === 0) return t(locale, "Изменений кода не требуется.", "No code changes required.");
  return patches.map((patch) => `${patch.operation} ${patch.path}`).join(", ");
}

async function applyStructuredPatches(actorAgentId: number, patches: WorkspacePatchFile[]) {
  if (patches.length === 0) return { applied: false, files: [] as string[] };
  try {
    const result = await applyWorkspacePatch(actorAgentId, patches);
    return { applied: true, files: result.applied };
  } catch (error) {
    return { applied: false, files: [] as string[], error: error instanceof Error ? error.message : "patch failed" };
  }
}

async function readPackageJson(root: string): Promise<PackageJson | null> {
  try {
    const raw = await readFile(path.join(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as PackageJson;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function hasEslintDep(pkg: PackageJson | null) {
  return Boolean(pkg?.devDependencies?.eslint || pkg?.dependencies?.eslint);
}

async function resolveChecks(): Promise<CheckSpec[]> {
  let root: string | null = null;
  try {
    root = await getWorkspaceRoot();
  } catch {
    root = null;
  }

  if (!root) {
    return [{ name: "checks", command: "", run: false }];
  }

  const pkg = await readPackageJson(root);
  const scripts = pkg?.scripts ?? {};

  const typecheck: CheckSpec = scripts.typecheck
    ? { name: "typecheck", command: "npm run typecheck", run: true }
    : { name: "typecheck", command: "npx tsc --noEmit", run: true };

  const lint: CheckSpec = scripts.lint
    ? { name: "lint", command: "npm run lint", run: true }
    : hasEslintDep(pkg)
      ? { name: "lint", command: "npx eslint .", run: true }
      : { name: "lint", command: "npx eslint .", run: false };

  const tests: CheckSpec = scripts.test
    ? { name: "tests", command: "npm test", run: true }
    : { name: "tests", command: "npm test", run: false };

  return [typecheck, lint, tests];
}

async function runVerificationChecks(locale: Locale, signal?: AbortSignal): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const checks = await resolveChecks();

  for (const check of checks) {
    assertNotAborted(signal, locale);
    if (!check.run) {
      results.push({ name: check.name, command: check.command, status: "skipped", output: "" });
      continue;
    }

    try {
      const result = await runSandboxCommand(check.command, locale, { timeoutMs: 180_000 });
      results.push({
        name: check.name,
        command: check.command,
        status: result.status === "success" ? "success" : "failed",
        output: result.output,
      });
    } catch (error) {
      results.push({
        name: check.name,
        command: check.command,
        status: "failed",
        output: error instanceof Error ? error.message : "failed",
      });
    }
  }

  return results;
}

export async function* runOrchestrator(options: {
  task: string;
  locale?: string;
  taskId?: string;
  maxIterations?: number;
  mode?: string;
  signal?: AbortSignal;
  projectContext?: ProjectContextInput;
}): AsyncGenerator<OrchestratorStreamEvent> {
  const locale = normalizeLocale(options.locale);
  const signal = options.signal;
  const mode = normalizeMode(options.mode);
  const task = compact(options.task);
  const taskId = compact(options.taskId) || randomUUID();
  const maxIterations = clamp(options.maxIterations ?? DEFAULT_MAX_ITERATIONS, MIN_MAX_ITERATIONS, MAX_MAX_ITERATIONS);

  const changedFiles = new Set<string>();
  const checkHistory: CheckResult[] = [];
  let lastDecision = "";

  try {
    if (!task) throw new Error(t(locale, "Введите задачу для оркестратора.", "Enter a task for the orchestrator."));
    assertNotAborted(signal, locale);

    await ensureWorkspaceBootstrap();
    assertNotAborted(signal, locale);

    const [mainAgent] = await db.select().from(agents).where(eq(agents.role, "main")).limit(1);
    if (!mainAgent) throw new Error(t(locale, "Главный агент не назначен.", "No Lead agent is assigned."));

    // Persist active task state for crash recovery.
    const taskStartedAt = new Date().toISOString();
    void saveActiveTaskState({ taskId, task, mode, iteration: 0, maxIterations, step: "planning", startedAt: taskStartedAt, lastSavedAt: taskStartedAt });

    const advisorRows = await db
      .select()
      .from(agents)
      .where(and(eq(agents.isActive, true), ne(agents.role, "main")))
      .orderBy(asc(agents.id));

    yield { type: "task_started", taskId, task, maxIterations, mode };
    yield { type: "step", step: "planning" };
    void saveActiveTaskState({ taskId, task, mode, iteration: 0, maxIterations, step: "planning", startedAt: taskStartedAt, lastSavedAt: new Date().toISOString() });
    yield {
      type: "event",
      event: await recordEvent({
        taskId,
        type: "TASK_CREATED",
        agent: "Orchestrator",
        role: "orchestrator",
        iteration: 0,
        arguments: task,
        proposal: task,
      }),
    };

    yield { type: "agent_status", agent: mainAgent.name, role: "main", status: "started" };
    const plan = await completeAgent(mainAgent, mainSystemPrompt(locale, mainAgent), planPrompt(locale, task), signal, false, locale, options.projectContext);
    yield { type: "agent_status", agent: mainAgent.name, role: "main", status: "done" };
    yield {
      type: "event",
      event: await recordEvent({
        taskId,
        type: "PLAN_CREATED",
        agent: mainAgent.name,
        role: "main",
        agentId: mainAgent.id,
        iteration: 0,
        proposal: plan,
      }),
    };
    assertNotAborted(signal, locale);

    let lastCheckFailure = "";
    let lastPatches: WorkspacePatchFile[] = [];

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      assertNotAborted(signal, locale);
      yield { type: "iteration", iteration, total: maxIterations };
      void saveActiveTaskState({ taskId, task, mode, iteration, maxIterations, step: iteration === 1 ? "analysis" : "fix", startedAt: taskStartedAt, lastSavedAt: new Date().toISOString() });

      if (iteration === 1) {
      yield { type: "step", step: "analysis" };
      void saveActiveTaskState({ taskId, task, mode, iteration, maxIterations, step: "analysis", startedAt: taskStartedAt, lastSavedAt: new Date().toISOString() });

      const activeAdvisors = resolveAdvisors(advisorRows);

        for (const entry of activeAdvisors) {
          yield { type: "agent_status", agent: entry.agent.name, role: entry.role, status: "started" };
        }

        const adviceResults: AdviceResult[] = await Promise.all(
          activeAdvisors.map(async (entry): Promise<AdviceResult> => {
            if (signal?.aborted) return { agent: entry.agent, role: entry.role, error: t(locale, "остановлено", "cancelled") };
            try {
              const advice = await completeAgent(
                entry.agent,
                advisorSystemPrompt(locale, entry.agent, entry.role),
                advicePrompt(locale, task, plan, iteration, lastCheckFailure, entry.role),
                signal,
                false,
                locale,
                options.projectContext,
              );
              return { agent: entry.agent, role: entry.role, advice, stance: classifyStance(advice) };
            } catch (error) {
              return { agent: entry.agent, role: entry.role, error: error instanceof Error ? error.message : agentFailureMessage(locale, entry.agent, error) };
            }
          }),
        );

        for (const result of adviceResults) {
          if (result.error) {
            yield { type: "agent_status", agent: result.agent.name, role: result.role, status: "error", message: result.error };
            continue;
          }
          yield { type: "agent_status", agent: result.agent.name, role: result.role, status: "done" };
          yield {
            type: "event",
            event: await recordEvent({
              taskId,
              type: "ADVICE_POSTED",
              agent: result.agent.name,
              role: result.role,
              agentId: result.agent.id,
              iteration,
              arguments: result.advice ?? "",
              proposal: summarize(result.advice ?? ""),
            }),
          };
        }

        const conflicts = detectConflicts(locale, adviceResults);
        if (conflicts.length > 0) {
          yield {
            type: "event",
            event: await recordEvent({
              taskId,
              type: "CONFLICT_DETECTED",
              agent: "Orchestrator",
              role: "orchestrator",
              iteration,
              arguments: conflicts.map((conflict) => `${conflict.a} ↔ ${conflict.b}: ${conflict.reason}`).join("\n"),
              proposal: t(locale, "Найдены разногласия советников — требуется решение Главного.", "Advisor disagreement found — Lead resolution required."),
            }),
          };
        }

        yield { type: "agent_status", agent: mainAgent.name, role: "main", status: "started" };
        const rawDecision = await completeAgent(
          mainAgent,
          mainSystemPrompt(locale, mainAgent),
          consolidationPrompt(locale, task, plan, adviceResults, conflicts, lastCheckFailure),
          signal,
          true,
          locale,
          options.projectContext,
        );
        yield { type: "agent_status", agent: mainAgent.name, role: "main", status: "done" };
        const decisionInstruction = parsePatchInstruction(rawDecision);
        lastDecision = decisionInstruction.decision || rawDecision.trim();
        lastPatches = decisionInstruction.patches;
        yield {
          type: "event",
          event: await recordEvent({
            taskId,
            type: "DECISION_MADE",
            agent: mainAgent.name,
            role: "main",
            agentId: mainAgent.id,
            iteration,
            arguments: lastDecision,
            proposal: summarize(lastDecision),
            status: "accepted",
          }),
        };
      } else {
        yield { type: "step", step: "fix" };

        yield { type: "agent_status", agent: mainAgent.name, role: "main", status: "started" };
        const rawFix = await completeAgent(mainAgent, mainSystemPrompt(locale, mainAgent), fixPrompt(locale, task, lastCheckFailure), signal, true, locale, options.projectContext);
        yield { type: "agent_status", agent: mainAgent.name, role: "main", status: "done" };
        const fixInstruction = parsePatchInstruction(rawFix);
        lastDecision = fixInstruction.decision || rawFix.trim();
        lastPatches = fixInstruction.patches;
        yield {
          type: "event",
          event: await recordEvent({
            taskId,
            type: "DECISION_MADE",
            agent: mainAgent.name,
            role: "main",
            agentId: mainAgent.id,
            iteration,
            arguments: lastDecision,
            proposal: summarize(lastDecision),
            status: "accepted",
          }),
        };
      }

      yield { type: "step", step: "patch" };
      void saveActiveTaskState({ taskId, task, mode, iteration, maxIterations, step: "patch", startedAt: taskStartedAt, lastSavedAt: new Date().toISOString() });
      yield {
        type: "event",
        event: await recordEvent({
          taskId,
          type: "PATCH_PROPOSED",
          agent: mainAgent.name,
          role: "main",
          agentId: mainAgent.id,
          iteration,
          arguments: lastDecision,
          proposal: summarizePatches(locale, lastPatches),
        }),
      };

      let patchApproved = true;
      if (mode === "controlled") {
        const confirmationId = randomUUID();
        const patchPrompt =
          t(locale, "Применить предложенный патч к файлам рабочей папки?", "Apply the proposed patch to the workspace files?") +
          (lastPatches.length > 0 ? `\n${summarizePatches(locale, lastPatches)}` : "");
        yield {
          type: "confirmation_request",
          taskId,
          confirmationId,
          kind: "patch",
          prompt: patchPrompt,
        };
        void import("@/lib/telegram").then(({ ensureTelegramPolling, notifyTelegramRelease }) => {
          ensureTelegramPolling();
          return notifyTelegramRelease("WAITING", patchPrompt, confirmationId);
        }).catch(() => undefined);
        patchApproved = await waitForConfirmation(confirmationId, signal);
      }

      if (patchApproved) {
        const applyResult = await applyStructuredPatches(mainAgent.id, lastPatches);
        if (lastPatches.length > 0 && !applyResult.applied) {
          throw new Error(applyResult.error ?? t(locale, "Патч не применён.", "Patch was not applied."));
        }
        for (const file of applyResult.files) changedFiles.add(file);
        yield {
          type: "event",
          event: await recordEvent({
            taskId,
            type: "PATCH_APPLIED",
            agent: mainAgent.name,
            role: "main",
            agentId: mainAgent.id,
            filePath: applyResult.files.length > 0 ? applyResult.files.join(", ") : null,
            iteration,
            proposal: applyResult.applied
              ? t(locale, `Патч применён: ${summarizePatches(locale, lastPatches)}.`, `Patch applied: ${summarizePatches(locale, lastPatches)}.`)
              : applyResult.error
                ? t(locale, `Патч не применён: ${applyResult.error}`, `Patch not applied: ${applyResult.error}`)
                : t(locale, "Изменений кода не требуется или рабочая папка не подключена.", "No code changes required or no workspace folder connected."),
            status: "resolved",
          }),
        };
      } else {
        yield {
          type: "event",
          event: await recordEvent({
            taskId,
            type: "PATCH_APPLIED",
            agent: mainAgent.name,
            role: "main",
            agentId: mainAgent.id,
            iteration,
            proposal: t(locale, "Патч отклонён пользователем (контролируемый режим).", "Patch rejected by the user (controlled mode)."),
            status: "rejected",
          }),
        };
        void clearActiveTaskState();
        const report = await finalizeReport({
          taskId,
          task,
          status: "FAILED",
          changedFiles: [...changedFiles],
          checkResults: checkHistory,
          summary: t(locale, "Патч отклонён пользователем; проверки не запускались.", "Patch was rejected by the user; checks were not run."),
          iterations: iteration,
        });
        yield { type: "report", report };
        yield { type: "task_completed", taskId, iterations: iteration, decision: lastDecision };
        return;
      }

      yield { type: "step", step: "checks" };
      void saveActiveTaskState({ taskId, task, mode, iteration, maxIterations, step: "checks", startedAt: taskStartedAt, lastSavedAt: new Date().toISOString() });

      const tester = findAdvisor(advisorRows, "tester");
      yield {
        type: "event",
        event: await recordEvent({
          taskId,
          type: "TEST_STARTED",
          agent: tester?.name ?? "Tester",
          role: "tester",
          agentId: tester?.id ?? null,
          iteration,
        }),
      };

      let checksDenied = false;
      let checkResults: CheckResult[] = [];

      if (mode === "controlled") {
        const confirmationId = randomUUID();
        yield {
          type: "confirmation_request",
          taskId,
          confirmationId,
          kind: "command",
          prompt: t(locale, "Выполнить команды проверок (typecheck/lint/tests) в терминале?", "Run the verification commands (typecheck/lint/tests) in the terminal?"),
        };
        void import("@/lib/telegram").then(({ ensureTelegramPolling, notifyTelegramRelease }) => {
          ensureTelegramPolling();
          return notifyTelegramRelease("WAITING", t(locale, "Выполнить команды проверок (typecheck/lint/tests) в терминале?", "Run the verification commands (typecheck/lint/tests) in the terminal?"), confirmationId);
        }).catch(() => undefined);
        const approved = await waitForConfirmation(confirmationId, signal);
        if (approved) {
          checkResults = await runVerificationChecks(locale, signal);
        } else {
          checksDenied = true;
        }
      } else {
        checkResults = await runVerificationChecks(locale, signal);
      }

      checkHistory.push(...checkResults);

      if (checksDenied) {
        yield { type: "step", step: "done" };
        const summary = t(locale, "Проверки пропущены пользователем в контролируемом режиме.", "Checks were skipped by the user in controlled mode.");
        const report = await finalizeReport({
          taskId,
          task,
          status: "FAILED",
          changedFiles: [...changedFiles],
          checkResults: checkHistory,
          summary,
          iterations: iteration,
        });
        yield { type: "report", report };
        yield { type: "task_completed", taskId, iterations: iteration, decision: lastDecision };
        return;
      }

      const failedChecks = checkResults.filter((result) => result.status === "failed");
      if (failedChecks.length > 0) {
        lastCheckFailure = failedChecks
          .map((result) => `${result.name} (${result.command}):\n${result.output}`)
          .join("\n\n");
        yield {
          type: "event",
          event: await recordEvent({
            taskId,
            type: "TEST_FAILED",
            agent: tester?.name ?? "Tester",
            role: "tester",
            agentId: tester?.id ?? null,
            iteration,
            arguments: lastCheckFailure,
            status: "open",
          }),
        };
        continue;
      }

      yield { type: "step", step: "done" };
      void clearActiveTaskState();

      const reviewer = findAdvisor(advisorRows, "reviewer") ?? findAdvisor(advisorRows, "advisor");
      yield {
        type: "event",
        event: await recordEvent({
          taskId,
          type: "REVIEW_APPROVED",
          agent: reviewer?.name ?? "Reviewer",
          role: "reviewer",
          agentId: reviewer?.id ?? null,
          iteration,
          proposal: t(locale, "Все проверки пройдены.", "All checks passed."),
          status: "resolved",
        }),
      };

      const hasWorkspace = changedFiles.size > 0 || checkResults.some((result) => result.status !== "skipped");
      const releaseStatus: ReleaseStatus = hasWorkspace ? "RELEASE_READY" : "FAILED";
      const report = await finalizeReport({
        taskId,
        task,
        status: releaseStatus,
        changedFiles: [...changedFiles],
        checkResults: checkHistory,
        summary: releaseStatus === "RELEASE_READY"
          ? t(locale, "Все проверки пройдены, проект готов к релизу.", "All checks passed; the project is ready for release.")
          : t(locale, "Нет подключённой рабочей папки — проверки и применение патчей недоступны.", "No workspace folder connected — checks and patch application are unavailable."),
        iterations: iteration,
      });
      yield { type: "report", report };
      void import("@/lib/telegram").then(({ ensureTelegramPolling, notifyTelegramRelease }) => {
        ensureTelegramPolling();
        return notifyTelegramRelease("RELEASE_READY", report.summary);
      }).catch(() => undefined);
      yield { type: "task_completed", taskId, iterations: iteration, decision: lastDecision };
      return;
    }

    yield { type: "step", step: "done" };
    void clearActiveTaskState();
    const report = await finalizeReport({
      taskId,
      task,
      status: "FAILED",
      changedFiles: [...changedFiles],
      checkResults: checkHistory,
      summary: t(locale, "Лимит итераций исчерпан, проверки так и не прошли.", "Iteration limit reached; checks did not pass."),
      iterations: maxIterations,
    });
    yield { type: "report", report };
    yield { type: "task_completed", taskId, iterations: maxIterations, decision: lastDecision };
  } catch (error) {
    if (signal?.aborted || error instanceof OrchestratorCancelledError) {
      void clearActiveTaskState();
      yield { type: "cancelled", taskId };
    } else {
      void clearActiveTaskState();
      const message = error instanceof Error ? error.message : t(locale, "Оркестратор завершился с ошибкой.", "Orchestrator failed.");
      yield { type: "error", message };

      try {
        const report = await finalizeReport({
          taskId,
          task,
          status: "FAILED",
          changedFiles: [...changedFiles],
          checkResults: checkHistory,
          summary: message,
          iterations: 0,
        });
        yield { type: "report", report };
      } catch {
        // Report persistence is best-effort.
      }
    }
  }
}
