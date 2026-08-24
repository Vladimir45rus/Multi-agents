import "server-only";

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import pathModule from "node:path";
import { promisify } from "node:util";
import { db, runMigrations } from "@/db";
import {
  agents,
  analysisFindings,
  chatMessages,
  fileHistory,
  projectFiles,
  terminalEntries,
  systemEvents,
  workspaceSettings,
} from "@/db/schema";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getProviderPreset, normalizeProviderModel } from "@/lib/providers";
import {
  completeProviderResponse,
  providerRequestFromAgent,
  streamProviderResponse,
  ProviderGatewayError,
  type GatewayMessage,
  type ProviderGatewayOptions,
} from "@/lib/provider-gateway";
import { decryptSecret, hasElectronVault } from "@/lib/secret-vault";
import { createAgentIdentity, type AgentIdentity } from "@/lib/agent-identity";
import { buildProjectContext, type ProjectContextInput } from "@/lib/project-context";
import { recordSystemEvent } from "@/lib/system-events";
import { resolveWithinRoot } from "@/lib/workspace-paths";
import { executeToolCall, getToolDefinitions, parseToolCall, toolResultMessage } from "@/lib/agent-tools";

const execFileAsync = promisify(execFile);

const ROLE_COLORS: Record<string, string> = {
  main: "#8b5cf6",
  architect: "#10b981",
  reviewer: "#f97316",
  tester: "#ef4444",
  uiux: "#ec4899",
};

export type UiLocale = "ru" | "en";
export type ChatChannel = "group" | "lead";

export type ChatAttachment = {
  type: "image" | "link";
  url?: string;
  name?: string;
  title?: string;
  previewText?: string;
};

export type ChatMessageMetadata = {
  attachments?: ChatAttachment[];
  identity?: AgentIdentity;
};

export type ChatStreamEvent =
  | { type: "agent_start"; channel: ChatChannel; identity: AgentIdentity }
  | { type: "delta"; channel: ChatChannel; identity: AgentIdentity; text: string }
  | { type: "agent_done"; channel: ChatChannel; identity: AgentIdentity; content: string }
  | { type: "agent_error"; channel: ChatChannel; identity: AgentIdentity; message: string; status?: number; rateLimited?: boolean }
  | { type: "done"; channel: ChatChannel }
  | { type: "error"; channel: ChatChannel; message: string };

type WorkspaceSnapshot = {
  settings: {
    id: number;
    workspaceName: string;
    projectRoot: string;
    mainCoderAgentId: number | null;
    apiKeys: Record<string, string>;
    apiKeysConfigured: Record<string, boolean>;
    githubToken: string;
    githubTokenConfigured: boolean;
    githubRepo: string;
    githubAutoPush: boolean;
    autoApprove: boolean;
    mobileAuthToken: string;
    localtunnelEnabled: boolean;
    localtunnelUrl: string;
    telegramTokenConfigured: boolean;
    telegramChatId: string;
    fallbackModels: string[];
    previewCommand: string;
    previewPort: number;
    previewUrl: string;
    projectTemplate: string;
    projectTemplatePrompt: string;
    vaultAvailable: boolean;
  };
  agents: Array<{
    id: number;
    name: string;
    provider: string;
    baseUrl: string;
    model: string;
    role: string;
    description: string;
    skill: string;
    systemPrompt: string;
    color: string;
    isActive: boolean;
  }>;
  files: Array<{
    id: number;
    path: string;
    language: string;
    content: string;
    updatedAt: string;
  }>;
  history: Array<{
    id: number;
    fileId: number;
    filePath: string;
    actorAgentId: number;
    createdAt: string;
  }>;
  messages: Array<{
    id: number;
    chatChannel: ChatChannel;
    senderType: string;
    agentName: string | null;
    content: string;
    metadata: ChatMessageMetadata;
    createdAt: string;
  }>;
  terminal: Array<{
    id: number;
    command: string;
    output: string;
    status: string;
    createdAt: string;
  }>;
  systemEvents: Array<{
    id: number;
    level: string;
    source: string;
    message: string;
    details: string;
    createdAt: string;
  }>;
  findings: Array<{
    id: number;
    filePath: string;
    severity: string;
    message: string;
    line: number | null;
    createdAt: string;
  }>;
};

const ROLE_PROMPT_TEMPLATES: Record<string, { description: string; skill: string; systemPrompt: string }> = {
  main: { description: "Главный кодер: принимает решения и пишет рабочий код.", skill: "Fullstack-разработка, декомпозиция задач, тестирование и безопасные изменения.", systemPrompt: "Ты Главный агент IDE. Анализируй контекст проекта, вноси минимальные проверяемые изменения и запускай подходящие проверки." },
  advisor: { description: "Советник: исследует задачу и предлагает конкретные решения.", skill: "Анализ требований, поиск рисков и ясные технические рекомендации.", systemPrompt: "Ты Советник. Не изменяй код самостоятельно; изучай контекст и формулируй конкретные рекомендации Главному агенту." },
  architect: { description: "Архитектор: отвечает за структуру и границы системы.", skill: "Проектирование модулей, API, потоков данных и масштабируемости.", systemPrompt: "Ты Архитектор. Оценивай структуру проекта, зависимости и долгосрочные риски; предлагай простые устойчивые решения." },
  reviewer: { description: "Ревьюер: находит дефекты и регрессии.", skill: "Code review, типизация, корректность, безопасность и поддерживаемость.", systemPrompt: "Ты Ревьюер. Ищи реальные ошибки и регрессии, указывай файл, строку и способ исправления." },
  tester: { description: "QA: проверяет поведение и крайние случаи.", skill: "Тест-дизайн, регрессии, интеграционные и негативные сценарии.", systemPrompt: "Ты QA-инженер. Проверяй требования, крайние случаи и тестируемость; предлагай воспроизводимые проверки." },
  uiux: { description: "UI/UX: отвечает за удобство и визуальную целостность.", skill: "Адаптивная верстка, доступность, UX-потоки и дизайн-системы.", systemPrompt: "Ты UI/UX дизайнер. Анализируй интерфейс, responsive-поведение, доступность и ясность пользовательских сценариев." },
  security: { description: "Security: ищет уязвимости и утечки данных.", skill: "Моделирование угроз, валидация входных данных и безопасное хранение секретов.", systemPrompt: "Ты Security-аналитик. Ищи уязвимости, утечки секретов и опасные границы доверия; предлагай практичные исправления." },
  observer: { description: "Наблюдатель: следит за состоянием процесса и результатами.", skill: "Мониторинг прогресса, диагностика сбоев и контроль критериев готовности.", systemPrompt: "Ты Наблюдатель. Сверяй прогресс с задачей, фиксируй блокеры и критерии готовности." },
  auto: { description: "AUTO: автономно контролирует цикл выполнения.", skill: "Контроль прогресса, критериев готовности и безопасного завершения цикла.", systemPrompt: "Ты AUTO-агент. Контролируй автономный цикл, фиксируй блокеры и проверяй критерии RELEASE_READY." },
};

const defaultAgents = [
  {
    name: "Главный агент",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    role: "main",
    description: ROLE_PROMPT_TEMPLATES.main.description,
    skill: ROLE_PROMPT_TEMPLATES.main.skill,
    systemPrompt: ROLE_PROMPT_TEMPLATES.main.systemPrompt,
    color: "#8b5cf6",
  },
] as const;

const defaultFiles = [
  {
    path: "src/app/page.tsx",
    language: "tsx",
    content: `export default function HomePage() {\n  return <main>Hello Multi-Agent IDE</main>;\n}`,
  },
] as const;

const nowIso = (value: Date | string) => new Date(value).toISOString();
const normalizeLocale = (locale?: string): UiLocale => (locale === "en" ? "en" : "ru");

function t(locale: UiLocale, ru: string, en: string) {
  return locale === "ru" ? ru : en;
}

function compact(value: string | null | undefined) {
  return (value ?? "").trim();
}

function providerModelLabel(provider: string, model: string) {
  return `${getProviderPreset(provider).label} / ${normalizeProviderModel(provider, model)}`;
}

function agentFailureMessage(locale: UiLocale, agent: typeof agents.$inferSelect, error: unknown) {
  if (error instanceof ProviderGatewayError && !error.retryable) {
    return t(locale, `Ошибка подключения к модели ${getProviderPreset(agent.provider).label}. Повторите попытку`, `Connection error for model ${getProviderPreset(agent.provider).label}. Please try again`);
  }
  const message = error instanceof Error ? error.message : t(locale, "неизвестная ошибка", "unknown error");
  return t(
    locale,
    `Агент ${agent.name} (${providerModelLabel(agent.provider, agent.model)}) недоступен: ${message}. Остальные агенты продолжат работу.`,
    `Agent ${agent.name} (${providerModelLabel(agent.provider, agent.model)}) is unavailable: ${message}. Other agents will continue.`,
  );
}

function normalizeRole(role: string | undefined) {
  const cleaned = compact(role).toLowerCase();
  return cleaned || "advisor";
}

function languageFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return "plaintext";
  if (["ts", "tsx", "js", "jsx", "json"].includes(ext)) return ext;
  if (["md", "css", "html", "sql", "py", "go", "rs", "java", "kt", "yaml", "yml"].includes(ext)) return ext;
  return "plaintext";
}

function findLine(content: string, needle: string): number | null {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line.includes(needle));
  return index >= 0 ? index + 1 : null;
}

function runStaticAnalysis(filePath: string, content: string, locale: UiLocale) {
  const findings: Array<{ severity: string; message: string; line: number | null }> = [];

  if (/\bany\b/.test(content)) {
    findings.push({
      severity: "warning",
      message: t(locale, "Обнаружен тип 'any': стоит заменить на конкретный тип.", "Found 'any' type: use a specific type."),
      line: findLine(content, "any"),
    });
  }

  if (/console\.log\(/.test(content)) {
    findings.push({
      severity: "info",
      message: t(locale, "Найден console.log: проверьте, что он не уйдёт в production.", "Found console.log: ensure it won't ship to production."),
      line: findLine(content, "console.log"),
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "success",
      message: t(locale, `Быстрый анализ: критичных проблем в ${filePath} не найдено.`, `No critical issues found in ${filePath}.`),
      line: null,
    });
  }

  return findings;
}

type AgentPromptContext = { skill: string; systemPrompt: string };

function cleanAgentSystemPrompt(value: string) {
  return compact(value)
    .replace(/(?:\b(?:you are|you're|i am|i'm|identify as|call yourself|present yourself as)\b|\b(?:ты|я|представляйся|называй себя)\b)[^.!?\n]*(?:gpt|claude|liquid|lfm|foundation model)[^.!?\n]*[.!?]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function promptPersona(locale: UiLocale, context: AgentPromptContext) {
  const skill = compact(context.skill);
  const systemPrompt = cleanAgentSystemPrompt(context.systemPrompt);

  if (skill && systemPrompt) return t(locale, `Скилл: ${skill}. Инструкция: ${systemPrompt}`, `Skill: ${skill}. Prompt: ${systemPrompt}`);
  if (skill) return t(locale, `Скилл: ${skill}`, `Skill: ${skill}`);
  if (systemPrompt) return t(locale, `Инструкция: ${systemPrompt}`, `Prompt: ${systemPrompt}`);
  return t(locale, "Базовый режим", "Base mode");
}

function cleanHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function enrichLinkAttachment(attachment: ChatAttachment): Promise<ChatAttachment> {
  if (attachment.type !== "link" || !attachment.url) return attachment;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(attachment.url, {
      signal: controller.signal,
      headers: { "User-Agent": "MultiAgentCodeStudio/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ...attachment, title: attachment.title ?? "Link", previewText: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || attachment.title || "Link";
    const previewText = cleanHtml(html).slice(0, 700);

    return { ...attachment, title, previewText };
  } catch {
    return { ...attachment, title: attachment.title ?? "Link", previewText: "Failed to fetch URL preview" };
  }
}

async function enrichAttachments(attachments: ChatAttachment[]) {
  const resolved: ChatAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.type === "link") {
      resolved.push(await enrichLinkAttachment(attachment));
    } else {
      resolved.push(attachment);
    }
  }
  return resolved;
}

export async function pushMessage(payload: {
  chatChannel: ChatChannel;
  senderType: string;
  agentName: string | null;
  content: string;
  metadata?: ChatMessageMetadata;
}) {
  if (payload.senderType === "system") {
    await db.insert(systemEvents).values({ level: "info", source: "workspace", message: payload.content, details: "" });
    return;
  }
  await db.insert(chatMessages).values({
    chatChannel: payload.chatChannel,
    senderType: payload.senderType,
    agentName: payload.agentName,
    content: payload.content,
    metadata: payload.metadata ?? {},
  });
}

export async function getWorkspaceSettingsRow() {
  const [row] = await db.select().from(workspaceSettings).limit(1);
  return row;
}

async function getGitHubDefaultBranch(repo: string, token: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  const payload = (await res.json()) as { default_branch?: string };
  return payload.default_branch || "main";
}

async function runGit(args: string[], cwd: string, env?: Record<string, string>) {
  const result = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 2_000_000,
    windowsHide: true,
  });
  return `${result.stdout}${result.stderr}`.trim();
}

function githubRepoName(value: string) {
  const repo = compact(value).replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error("Repository must use owner/repo format");
  return repo;
}

function gitAuthEnv(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

export async function pushWorkspaceToGitHub(
  locale?: string,
  credentials?: { token?: string; repo?: string },
) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const settings = await getWorkspaceSettingsRow();
  const inputToken = compact(credentials?.token);
  const storedToken = inputToken || compact(settings.githubToken);
  const token = storedToken ? await decryptSecret(storedToken) : "";
  const repoInput = credentials?.repo === undefined ? settings.githubRepo : credentials.repo;

  if (!token || !compact(repoInput)) {
    const error = new Error("GitHub credentials are required");
    (error as Error & { code?: string }).code = "GITHUB_CREDENTIALS_REQUIRED";
    throw error;
  }

  const repo = githubRepoName(repoInput);
  if (inputToken || credentials?.repo !== undefined) {
    await updateWorkspaceSettings({ githubToken: inputToken || settings.githubToken, githubRepo: repo });
  }

  const root = compact(settings.projectRoot);
  if (!root) throw new Error(t(activeLocale, "Сначала подключите папку проекта.", "Connect a project folder first."));

  await recordSystemEvent("info", "github", t(activeLocale, "Инициализация git и подготовка push...", "Initializing git and preparing push..."));
  await runGit(["init"], root);
  await runGit(["config", "user.name", "Multi-Agent Code Studio"], root);
  await runGit(["config", "user.email", "multi-agent-code-studio@users.noreply.github.com"], root);

  const branch = await getGitHubDefaultBranch(repo, token);
  const remoteUrl = `https://github.com/${repo}.git`;
  const remoteOutput = await runGit(["remote"], root).catch(() => "");
  if (remoteOutput.split(/\r?\n/).includes("origin")) await runGit(["remote", "set-url", "origin", remoteUrl], root);
  else await runGit(["remote", "add", "origin", remoteUrl], root);

  await runGit(["add", "-A"], root);
  const changes = await runGit(["status", "--porcelain"], root);
  if (changes) {
    await runGit(["commit", "-m", "chore: sync workspace"], root);
    await recordSystemEvent("success", "github", t(activeLocale, "Локальный git-коммит создан.", "Local git commit created."));
  } else {
    await recordSystemEvent("info", "github", t(activeLocale, "Изменений для нового коммита нет.", "No changes for a new commit."));
  }

  await recordSystemEvent("info", "github", t(activeLocale, `Отправка в ${repo}/${branch}...`, `Pushing to ${repo}/${branch}...`));
  await runGit(["push", "-u", "origin", `HEAD:${branch}`], root, await gitAuthEnv(token));
  await recordSystemEvent("success", "github", t(activeLocale, `GitHub push выполнен: ${repo}/${branch}.`, `GitHub push completed: ${repo}/${branch}.`));
  return { branch, repo };
}

async function maybeAutoPushSingleFile(path: string, content: string, locale?: string) {
  const activeLocale = normalizeLocale(locale);
  const settings = await getWorkspaceSettingsRow();

  if (!settings.githubAutoPush) return;
  const storedToken = compact(settings.githubToken);
  const token = storedToken ? await decryptSecret(storedToken) : "";
  const repo = compact(settings.githubRepo);
  if (!token || !repo) return;

  try {
    await pushWorkspaceToGitHub(activeLocale);
    await pushMessage({
      chatChannel: "group",
      senderType: "system",
      agentName: "System",
      content: t(activeLocale, `Автопуш в GitHub: ${path}.`, `GitHub auto-push: ${path}.`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto push failed";
    await pushMessage({
      chatChannel: "group",
      senderType: "system",
      agentName: "System",
      content: t(activeLocale, `Ошибка автопуша GitHub: ${message}`, `GitHub auto-push error: ${message}`),
    });
  }
}

export async function ensureWorkspaceBootstrap() {
  await runMigrations();

  const existingSettings = await db.select().from(workspaceSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(workspaceSettings).values({ workspaceName: "Multi-Agent Code Studio", apiKeys: {} });
  }

  const existingAgents = await db.select().from(agents).limit(1);
  if (existingAgents.length === 0) {
    const inserted = await db
      .insert(agents)
      .values(defaultAgents.map((agent) => ({ ...agent, isActive: true })))
      .returning({ id: agents.id, role: agents.role });

    const main = inserted.find((item) => item.role === "main");
    if (main) await db.update(workspaceSettings).set({ mainCoderAgentId: main.id, updatedAt: new Date() });
  }

  // Migrate model ids and legacy model-based slot names before they are used.
  const agentRows = await db.select().from(agents);
  for (const agent of agentRows) {
    const model = normalizeProviderModel(agent.provider, agent.model);
    const systemPrompt = cleanAgentSystemPrompt(agent.systemPrompt);
    const name = agent.name === "GPT-4.1 Lead" || agent.name === "Claude Sonnet Reviewer"
      ? agent.role === "main" ? "Главный агент" : "Советник"
      : agent.name;
    const roleColor = ROLE_COLORS[agent.role];
    const roleTemplate = ROLE_PROMPT_TEMPLATES[agent.role] ?? ROLE_PROMPT_TEMPLATES.advisor;
    const migratedDescription = compact(agent.description) || roleTemplate.description;
    const migratedSkill = compact(agent.skill) || roleTemplate.skill;
    const migratedPrompt = systemPrompt || roleTemplate.systemPrompt;
    if (model !== agent.model || migratedPrompt !== agent.systemPrompt || migratedDescription !== agent.description || migratedSkill !== agent.skill || name !== agent.name || (roleColor && roleColor !== agent.color)) {
      await db.update(agents).set({ model, systemPrompt: migratedPrompt, description: migratedDescription, skill: migratedSkill, name, ...(roleColor ? { color: roleColor } : {}) }).where(eq(agents.id, agent.id));
    }
  }

  const existingFiles = await db.select().from(projectFiles).limit(1);
  if (existingFiles.length === 0) {
    await db.insert(projectFiles).values(defaultFiles.map((file) => ({ ...file, updatedAt: new Date() })));
  }

  const currentAgentRows = await db.select().from(agents);
  const messageRowsForIdentity = await db.select().from(chatMessages);
  for (const message of messageRowsForIdentity) {
    if (message.senderType === "user" || message.senderType === "system" || message.metadata?.identity) continue;
    const matchingAgent = currentAgentRows.find((agent) =>
      agent.name === message.agentName ||
      (agent.role === "main" && message.agentName === "GPT-4.1 Lead") ||
      (agent.role !== "main" && message.agentName === "Claude Sonnet Reviewer"),
    );
    if (matchingAgent) {
      await db.update(chatMessages).set({
        metadata: {
          ...(message.metadata ?? {}),
          identity: createAgentIdentity({
            agentId: matchingAgent.id,
            displayName: matchingAgent.name,
            role: matchingAgent.role,
            provider: matchingAgent.provider,
            model: matchingAgent.model,
          }),
        },
      }).where(eq(chatMessages.id, message.id));
    }
  }

  const existingMessages = await db.select().from(chatMessages).limit(1);
  const isFreshWorkspace = existingMessages.length === 0;
  if (isFreshWorkspace) {
    await pushMessage({
      chatChannel: "group",
      senderType: "system",
      agentName: "System",
      content: "Workspace готов. Можно загружать свои файлы кода и отправлять ссылки/картинки в чат.",
    });
  }

  const existingTerminal = await db.select().from(terminalEntries).limit(1);
  if (existingTerminal.length === 0 && isFreshWorkspace) {
    await db.insert(terminalEntries).values({
      command: "boot",
      output: "IDE runtime initialized.",
      status: "success",
    });
  }
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  await ensureWorkspaceBootstrap();

  const settingsRow = await getWorkspaceSettingsRow();
  const agentRows = await db.select().from(agents).orderBy(asc(agents.id));
  const fileRows = (await db.select().from(projectFiles).orderBy(asc(projectFiles.path)))
    .filter((row) => row.language !== "directory" && !row.path.startsWith(".multi-agent-virtual-dirs/"));
  const historyRows = await db.select().from(fileHistory).orderBy(desc(fileHistory.id)).limit(100);
  const messageRows = await db.select().from(chatMessages).orderBy(asc(chatMessages.id));
  const terminalRows = await db.select().from(terminalEntries).orderBy(desc(terminalEntries.id)).limit(30);
  const systemEventRows = await db.select().from(systemEvents).orderBy(desc(systemEvents.id)).limit(100);
  const findingRows = await db.select().from(analysisFindings).orderBy(desc(analysisFindings.id)).limit(80);

  return {
    settings: {
      id: settingsRow.id,
      workspaceName: settingsRow.workspaceName,
      projectRoot: settingsRow.projectRoot,
      mainCoderAgentId: settingsRow.mainCoderAgentId,
      apiKeys: Object.fromEntries(Object.keys(settingsRow.apiKeys ?? {}).map((provider) => [provider, ""])),
      apiKeysConfigured: Object.fromEntries(Object.keys(settingsRow.apiKeys ?? {}).map((provider) => [provider, true])),
      githubToken: "",
      githubTokenConfigured: Boolean(compact(settingsRow.githubToken)),
      githubRepo: settingsRow.githubRepo,
      githubAutoPush: settingsRow.githubAutoPush,
      autoApprove: Boolean(settingsRow.autoApprove),
      mobileAuthToken: settingsRow.mobileAuthToken ?? "",
      localtunnelEnabled: Boolean(settingsRow.localtunnelEnabled),
      localtunnelUrl: settingsRow.localtunnelUrl ?? "",
      telegramTokenConfigured: Boolean(compact(settingsRow.telegramToken)),
      telegramChatId: settingsRow.telegramChatId ?? "",
      fallbackModels: Array.isArray(settingsRow.fallbackModels) ? settingsRow.fallbackModels : [],
      previewCommand: settingsRow.previewCommand ?? "npm run dev",
      previewPort: settingsRow.previewPort ?? 4173,
      previewUrl: settingsRow.previewUrl ?? "",
      projectTemplate: settingsRow.projectTemplate ?? "",
      projectTemplatePrompt: settingsRow.projectTemplatePrompt ?? "",
      vaultAvailable: hasElectronVault(),
    },
    agents: agentRows,
    files: fileRows.map((row) => ({ ...row, updatedAt: nowIso(row.updatedAt) })),
    history: historyRows
      .reverse()
      .map((row) => ({ id: row.id, fileId: row.fileId, filePath: row.filePath, actorAgentId: row.actorAgentId, createdAt: nowIso(row.createdAt) })),
    messages: messageRows.map((row) => ({
      ...row,
      chatChannel: row.chatChannel as ChatChannel,
      metadata: row.metadata ?? {},
      createdAt: nowIso(row.createdAt),
    })),
    terminal: terminalRows.reverse().map((row) => ({ ...row, createdAt: nowIso(row.createdAt) })),
    systemEvents: systemEventRows.map((row) => ({ ...row, createdAt: nowIso(row.createdAt) })),
    findings: findingRows.reverse().map((row) => ({ ...row, createdAt: nowIso(row.createdAt) })),
  };
}

export async function getStoredProviderApiKey(provider: string) {
  await ensureWorkspaceBootstrap();
  const settings = await getWorkspaceSettingsRow();
  const stored = compact(settings.apiKeys?.[provider]);
  if (!stored) return stored;
  return decryptSecret(stored);
}

function mergeApiKeys(current: Record<string, string>, incoming?: Record<string, string>, remove?: string[]) {
  const next = { ...current };
  for (const provider of remove ?? []) delete next[compact(provider).toLowerCase()];
  for (const [provider, value] of Object.entries(incoming ?? {})) {
    const normalizedProvider = compact(provider).toLowerCase();
    const normalizedValue = compact(value);
    if (!normalizedProvider || !normalizedValue) continue;
    const hasControlCharacters = [...normalizedValue].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
    if (normalizedProvider.length > 80 || normalizedValue.length > 2048 || hasControlCharacters) {
      throw new Error(`Invalid API key for provider ${normalizedProvider}`);
    }
    next[normalizedProvider] = normalizedValue;
  }
  return next;
}

export async function updateWorkspaceSettings(payload: {
  projectRoot?: string;
  apiKeys?: Record<string, string>;
  githubToken?: string;
  githubRepo?: string;
  githubAutoPush?: boolean;
  autoApprove?: boolean;
  mobileAuthToken?: string;
  localtunnelEnabled?: boolean;
  localtunnelUrl?: string;
  telegramToken?: string;
  telegramChatId?: string;
  fallbackModels?: string[];
  previewCommand?: string;
  previewPort?: number;
  previewUrl?: string;
  projectTemplate?: string;
  projectTemplatePrompt?: string;
  removeApiKeys?: string[];
}) {
  await ensureWorkspaceBootstrap();
  const current = await getWorkspaceSettingsRow();
  const githubToken = compact(payload.githubToken) || current.githubToken;
  const githubRepo = payload.githubRepo === undefined ? current.githubRepo : compact(payload.githubRepo);
  const telegramToken = compact(payload.telegramToken) || current.telegramToken;
  const fallbackModels = (payload.fallbackModels ?? current.fallbackModels ?? []).map((model) => compact(model)).filter(Boolean).slice(0, 12);

  await db
    .update(workspaceSettings)
    .set({
      projectRoot: payload.projectRoot === undefined ? current.projectRoot : compact(payload.projectRoot),
      apiKeys: mergeApiKeys(current.apiKeys ?? {}, payload.apiKeys, payload.removeApiKeys),
      githubToken,
      githubRepo,
      githubAutoPush: payload.githubAutoPush === undefined ? current.githubAutoPush : Boolean(payload.githubAutoPush),
      autoApprove: payload.autoApprove === undefined ? current.autoApprove : Boolean(payload.autoApprove),
      mobileAuthToken: payload.mobileAuthToken === undefined ? current.mobileAuthToken : compact(payload.mobileAuthToken),
      localtunnelEnabled: payload.localtunnelEnabled === undefined ? current.localtunnelEnabled : Boolean(payload.localtunnelEnabled),
      localtunnelUrl: payload.localtunnelUrl === undefined ? current.localtunnelUrl : compact(payload.localtunnelUrl),
      telegramToken,
      telegramChatId: payload.telegramChatId === undefined ? current.telegramChatId : compact(payload.telegramChatId),
      fallbackModels,
      previewCommand: payload.previewCommand === undefined ? current.previewCommand : compact(payload.previewCommand) || "npm run dev",
      previewPort: payload.previewPort === undefined ? current.previewPort : Math.max(1, Math.min(65535, Math.round(payload.previewPort))),
      previewUrl: payload.previewUrl === undefined ? current.previewUrl : compact(payload.previewUrl),
      projectTemplate: payload.projectTemplate === undefined ? current.projectTemplate : compact(payload.projectTemplate),
      projectTemplatePrompt: payload.projectTemplatePrompt === undefined ? current.projectTemplatePrompt : compact(payload.projectTemplatePrompt),
      updatedAt: new Date(),
    });
  await recordSystemEvent("success", "settings", "Workspace settings saved");
}

export async function clearChatHistory(channel?: ChatChannel) {
  await ensureWorkspaceBootstrap();
  if (channel) await db.delete(chatMessages).where(eq(chatMessages.chatChannel, channel));
  else await db.delete(chatMessages);
  await recordSystemEvent("info", "chat", channel ? `Chat history cleared: ${channel}` : "All chat history cleared");
}

export async function clearTerminalHistory() {
  await ensureWorkspaceBootstrap();
  await db.delete(terminalEntries);
  await recordSystemEvent("info", "terminal", "Terminal history cleared");
}

export async function importProjectFiles(files: Array<{ path: string; content: string }>, locale?: string) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  let imported = 0;

  for (const file of files) {
    const path = compact(file.path).replace(/\\/g, "/");
    if (!path || path.startsWith("/") || /^[A-Za-z]:\//.test(path) || path.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error(`Invalid imported file path: ${file.path}`);
    }

    const content = file.content ?? "";
    if (Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) {
      throw new Error(`Imported file is too large: ${path}`);
    }

    const settings = await getWorkspaceSettingsRow();
    if (settings.projectRoot) {
      const target = resolveWithinRoot(settings.projectRoot, path);
      await mkdir(pathModule.dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, content, { encoding: "utf8" });
    }

    await db
      .insert(projectFiles)
      .values({ path, content, language: languageFromPath(path), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: projectFiles.path,
        set: { content, language: languageFromPath(path), updatedAt: new Date() },
      });

    imported += 1;
  }

  await recordSystemEvent("success", "files", t(activeLocale, `Импортировано файлов: ${imported}.`, `Imported files: ${imported}.`));

  return { imported };
}

export async function createAgent(
  payload: {
    name: string;
    provider: string;
    baseUrl?: string;
    model?: string;
    description?: string;
    role?: string;
    skill?: string;
    systemPrompt?: string;
    color?: string;
  },
  locale?: string,
) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const name = compact(payload.name);
  const preset = getProviderPreset(payload.provider);
  const provider = preset.id;
  const model = normalizeProviderModel(provider, compact(payload.model) || preset.defaultModel);
  const baseUrl = compact(payload.baseUrl) || preset.baseUrl;
  const role = normalizeRole(payload.role);
  const roleTemplate = ROLE_PROMPT_TEMPLATES[role] ?? ROLE_PROMPT_TEMPLATES.advisor;

  if (!name) throw new Error(t(activeLocale, "Имя агента обязательно", "Agent name is required"));

  const [created] = await db
    .insert(agents)
    .values({
      name,
      provider,
      baseUrl,
      model,
      role: role === "main" ? "advisor" : role,
      description: compact(payload.description) || roleTemplate.description,
      skill: compact(payload.skill) || roleTemplate.skill,
      systemPrompt: cleanAgentSystemPrompt(payload.systemPrompt ?? "") || roleTemplate.systemPrompt,
      color: ROLE_COLORS[role === "main" ? "main" : role] ?? (compact(payload.color) || "#4fc1ff"),
      isActive: true,
    })
    .returning({ id: agents.id, name: agents.name });

  if (role === "main") {
    await assignMainCoder(created.id, activeLocale);
  } else {
    await pushMessage({
      chatChannel: "group",
      senderType: "system",
      agentName: "System",
      content: t(activeLocale, `Добавлен агент: ${created.name}.`, `Agent added: ${created.name}.`),
    });
  }
}

export async function updateAgentProfile(
  agentId: number,
  payload: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    skill: string;
    systemPrompt: string;
    description?: string;
    role?: string;
    color?: string;
  },
  locale?: string,
) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) throw new Error(t(activeLocale, "Агент не найден", "Agent not found"));

  const preset = getProviderPreset(payload.provider ?? agent.provider);
  const provider = preset.id;
  const model = normalizeProviderModel(provider, compact(payload.model) || preset.defaultModel);
  const baseUrl = compact(payload.baseUrl) || preset.baseUrl;
  const nextRole = normalizeRole(payload.role ?? agent.role);

  if (agent.role === "main" && nextRole !== "main") {
    throw new Error(
      t(
        activeLocale,
        "Нельзя снять роль главного напрямую. Сначала назначьте другого главного.",
        "You cannot demote the lead directly. Assign another lead first.",
      ),
    );
  }

  await db
    .update(agents)
    .set({
      provider,
      baseUrl,
      model,
      role: nextRole === "main" ? "main" : nextRole,
      skill: payload.skill,
      systemPrompt: cleanAgentSystemPrompt(payload.systemPrompt),
      description: payload.description ?? agent.description,
      color: ROLE_COLORS[nextRole] ?? (payload.color !== undefined ? compact(payload.color) || agent.color : agent.color),
    })
    .where(eq(agents.id, agentId));

  if (nextRole === "main" && agent.role !== "main") {
    await assignMainCoder(agentId, activeLocale);
  } else {
    await pushMessage({
      chatChannel: "group",
      senderType: "system",
      agentName: "System",
      content: t(
        activeLocale,
        `Профиль агента ${agent.name} (${providerModelLabel(provider, model)}) обновлён.`,
        `Agent profile for ${agent.name} (${providerModelLabel(provider, model)}) updated.`,
      ),
    });
  }
}

export async function assignMainCoder(agentId: number, locale?: string) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const candidate = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (candidate.length === 0) throw new Error(t(activeLocale, "Агент не найден", "Agent not found"));

  await db.update(agents).set({ role: "advisor" }).where(eq(agents.role, "main"));
  await db.update(agents).set({ role: "main" }).where(eq(agents.id, agentId));
  await db.update(workspaceSettings).set({ mainCoderAgentId: agentId, updatedAt: new Date() });

  await pushMessage({
    chatChannel: "group",
    senderType: "system",
    agentName: "System",
    content: t(activeLocale, `Главный Кодер назначен: ${candidate[0].name}.`, `Lead Coder assigned: ${candidate[0].name}.`),
  });
}

export async function saveFileContent(fileId: number, content: string, actorAgentId: number, locale?: string) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, fileId)).limit(1);
  if (!file) throw new Error(t(activeLocale, "Файл не найден", "File not found"));

  const [actor] = await db.select().from(agents).where(eq(agents.id, actorAgentId)).limit(1);
  if (!actor) throw new Error(t(activeLocale, "Агент-редактор не найден", "Editor agent not found"));

  if (actor.role !== "main") {
    throw new Error(
      t(
        activeLocale,
        "Редактирование запрещено: изменения в код вносит только Главный Кодер.",
        "Editing is blocked: only the Lead Coder can apply code changes.",
      ),
    );
  }

  await db.insert(fileHistory).values({
    fileId: file.id,
    filePath: file.path,
    previousContent: file.content,
    actorAgentId,
  });

  await db.update(projectFiles).set({ content, updatedAt: new Date() }).where(eq(projectFiles.id, fileId));

  await db.delete(analysisFindings).where(eq(analysisFindings.filePath, file.path));
  const findings = runStaticAnalysis(file.path, content, activeLocale);
  if (findings.length > 0) {
    await db.insert(analysisFindings).values(
      findings.map((finding) => ({
        filePath: file.path,
        severity: finding.severity,
        message: finding.message,
        line: finding.line,
      })),
    );
  }

  await maybeAutoPushSingleFile(file.path, content, activeLocale);

  const helpers = await db.select().from(agents).where(and(ne(agents.role, "main"), eq(agents.isActive, true)));
  const allAgentRows = await db.select({ name: agents.name, role: agents.role, color: agents.color }).from(agents).where(eq(agents.isActive, true));
  const allAgentNamesReview = allAgentRows.map((a) => ({ name: a.name, role: a.role, color: a.color ?? "" }));
  for (const helper of helpers) {
    try {
      const apiKey = await getStoredProviderApiKey(helper.provider);
      const response = await completeProviderResponse(
        providerRequestFromAgent(helper, apiKey),
        [
          {
            role: "system",
            content: agentSystemPrompt(activeLocale, helper, findings.length, false, allAgentNamesReview, false, false),
          },
          {
            role: "user",
            content: t(
              activeLocale,
              `Проверь изменения в файле ${file.path}. Дай Главному конкретные замечания и рекомендации.`,
              `Review the changes in ${file.path}. Give the Lead concrete findings and recommendations.`,
            ),
          },
        ],
      );

      await pushMessage({
        chatChannel: "group",
        senderType: "advisor",
        agentName: helper.name,
        content: response,
      });
    } catch (error) {
      await pushMessage({
        chatChannel: "group",
        senderType: "system",
        agentName: "System",
        content: agentFailureMessage(activeLocale, helper, error),
      });
    }
  }
}

export async function rollbackFileContent(fileId: number, actorAgentId: number, locale?: string) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const [actor] = await db.select().from(agents).where(eq(agents.id, actorAgentId)).limit(1);
  if (!actor) throw new Error(t(activeLocale, "Агент не найден", "Agent not found"));
  if (actor.role !== "main") {
    throw new Error(
      t(
        activeLocale,
        "Откат может выполнять только Главный Кодер.",
        "Only the Lead Coder can perform rollback.",
      ),
    );
  }

  const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, fileId)).limit(1);
  if (!file) throw new Error(t(activeLocale, "Файл не найден", "File not found"));

  const [lastState] = await db
    .select()
    .from(fileHistory)
    .where(eq(fileHistory.fileId, fileId))
    .orderBy(desc(fileHistory.id))
    .limit(1);

  if (!lastState) {
    throw new Error(t(activeLocale, "Нет истории для отката", "No history found for rollback"));
  }

  await db.update(projectFiles).set({ content: lastState.previousContent, updatedAt: new Date() }).where(eq(projectFiles.id, fileId));
  await db.delete(fileHistory).where(eq(fileHistory.id, lastState.id));

  await db.delete(analysisFindings).where(eq(analysisFindings.filePath, file.path));
  const findings = runStaticAnalysis(file.path, lastState.previousContent, activeLocale);
  if (findings.length > 0) {
    await db.insert(analysisFindings).values(
      findings.map((finding) => ({
        filePath: file.path,
        severity: finding.severity,
        message: finding.message,
        line: finding.line,
      })),
    );
  }

  await maybeAutoPushSingleFile(file.path, lastState.previousContent, activeLocale);

  await pushMessage({
    chatChannel: "lead",
    senderType: "system",
    agentName: "System",
    content: t(activeLocale, `Откат выполнен для ${file.path}.`, `Rollback completed for ${file.path}.`),
  });
}

async function gatewayHistory(channel: ChatChannel) {
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.chatChannel, channel)).orderBy(desc(chatMessages.id)).limit(24);
  const messages: GatewayMessage[] = rows.reverse().map((row) => ({
    role: row.senderType === "user" ? "user" : "assistant",
    content: row.content,
  }));

  return messages.slice(-16).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function attachmentContext(locale: UiLocale, attachments: ChatAttachment[]) {
  const details = attachments
    .map((attachment) => {
      if (attachment.type === "image") return t(locale, `Изображение: ${attachment.name ?? "без имени"}`, `Image: ${attachment.name ?? "unnamed"}`);
      return [attachment.title || attachment.url || "Link", attachment.previewText].filter(Boolean).join(" — ");
    })
    .filter(Boolean);

  return details.length > 0 ? `\\n\\n${t(locale, "Вложения:", "Attachments:")}\\n${details.join("\\n")}` : "";
}

function agentSystemPrompt(
  locale: UiLocale,
  agent: typeof agents.$inferSelect,
  findingsCount: number,
  isMultiAgent: boolean,
  allAgents: Array<{ name: string; role: string; color: string }>,
  isReview = false,
  isFix = false,
) {
  const persona = promptPersona(locale, { skill: agent.skill, systemPrompt: agent.systemPrompt });
  const configuredModel = normalizeProviderModel(agent.provider, agent.model);
  const configuredProvider = getProviderPreset(agent.provider).label;
  const identity = t(
    locale,
    `Твоя реальная конфигурация: имя «${agent.name}», роль «${agent.role}», провайдер «${configuredProvider}», модель «${configuredModel}». Не выдумывай себе другое имя и не заявляй, что работаешь на другой модели.`,
    `Your actual configuration: name "${agent.name}", role "${agent.role}", provider "${configuredProvider}", model "${configuredModel}". Do not invent another name or claim to run on a different model.`,
  );

  // Build team roster
  const teamList = allAgents
    .map((a) => {
      const isSelf = a.name === agent.name;
      const roleLabel = t(locale,
        roleDisplay(a.role, "ru"),
        roleDisplay(a.role, "en"));
      return isSelf
        ? `  • ${a.name} (${roleLabel}) — ЭТО ТЫ`
        : `  • ${a.name} (${roleLabel})`;
    })
    .join("\n");

  const teamRoster = t(
    locale,
    `\n\n=== СОСТАВ ТВОЕЙ КОМАНДЫ ===\n${teamList}\n\nТы — часть этой команды. Все видят общий чат. Ты должен читать сообщения других агентов, ссылаться на них и строить диалог.`,
    `\n\n=== YOUR TEAM ===\n${teamList}\n\nYou are part of this team. Everyone sees the shared chat. Read other agents' messages, reference them, and build a dialogue.`,
  );

  const collaboration = isMultiAgent
    ? t(
        locale,
        `` + teamRoster + `

=== ТВОЯ РОЛЬ: СОВЕТНИК ===
Ты — ${agent.name}, твоя специализация — ${roleDisplay(agent.role, "ru")}.

ПРОТОКОЛ ДИАЛОГА:
1. Прочитай сообщения других агентов (они уже высказались до тебя)
2. Прочитай нужные файлы через read_file
3. Найди проблемы через search_code
4. ОБРАТИСЬ К ДРУГИМ АГЕНТАМ ПО ИМЕНИ — согласись, возрази или дополни
5. Выскажи своё мнение, аргументируй
6. Предложи конкретное решение

ВАЖНО: Ты не кодируешь! Ты анализируешь и советуешь. Главный агент применит код.
ФОРМАТ: Начинай с обращения к тому, на чьё сообщение отвечаешь.
Пример: "@Советник, согласен насчёт рефакторинга. @Ревьюер, ты прав про типизацию..."`,
        `` + teamRoster + `

=== YOUR ROLE: ADVISOR ===
You are ${agent.name}, your specialty is ${roleDisplay(agent.role, "en")}.

DIALOGUE PROTOCOL:
1. Read other agents' messages (they already spoke before you)
2. Read relevant files via read_file
3. Find issues via search_code
4. ADDRESS OTHER AGENTS BY NAME — agree, disagree, or add
5. Voice your opinion with reasoning
6. Propose a concrete solution

IMPORTANT: You do NOT code! You analyze and advise. The Lead agent applies code.
FORMAT: Start by addressing the agent you're responding to.
Example: "@Advisor, I agree about the refactoring. @Reviewer, you're right about typing..."`,
      )
    : t(
        locale,
        `` + teamRoster + `

=== ТВОЯ РОЛЬ: ГЛАВНЫЙ АГЕНТ ===
Ты — ${agent.name}. Все советники уже высказались в общем чате (ты видишь их сообщения).

ПРОТОКОЛ КОДИНГА:
1. Прочитай сообщения советников — они дали тебе анализ и рекомендации
2. ОБЯЗАТЕЛЬНО укажи чьи советы ты принял, а чьи отклонил и почему
3. Прочитай нужные файлы через read_file
4. Напиши код через write_file
5. ЕСЛИ файл новый — используй create_file
6. Проверь через run_command (npm test, npx tsc --noEmit)
7. Если тесты упали — исправляй и перепроверяй

У тебя ВСЕ инструменты: read_file, write_file, create_file, delete_file, search_code, run_command.
Ты должен довести задачу до работающего результата.

Формат ответа: "Принял совет от @Архитектора по структуре. @Ревьюер предложил улучшить типы — сделал. @Тестировщик был прав про крайний случай — добавил проверку."`,
        `` + teamRoster + `

=== YOUR ROLE: LEAD AGENT ===
You are ${agent.name}. All advisors have spoken in the group chat (you see their messages).

CODING PROTOCOL:
1. Read advisors' messages — they gave you analysis and recommendations
2. ALWAYS mention whose advice you accepted, whose you rejected and why
3. Read relevant files via read_file
4. Write code via write_file
5. IF the file is new — use create_file
6. Verify via run_command (npm test, npx tsc --noEmit)
7. If tests fail — fix and re-verify

You have ALL tools: read_file, write_file, create_file, delete_file, search_code, run_command.
Get the task to a working result.

Response format: "Accepted @Architect's structural advice. @Reviewer suggested type improvements — done. @Tester was right about edge case — added guard."`,
      );

  const fileContext = t(
    locale,
    "Ты работаешь ВНУТРИ IDE. Дерево проекта и код открытых файлов УЖЕ переданы тебе в PROJECT CONTEXT ниже. Используй инструменты read_file для чтения любых файлов. НИКОГДА не говори «у меня нет доступа к файлам» или «я не вижу код» — это ложь, доступ есть. Если нужен файл — вызови read_file.",
    "You are INSIDE an IDE. The project tree and open file contents are ALREADY provided in PROJECT CONTEXT below. Use read_file tool to read any file. NEVER say 'I don't have file access' or 'I can't see the code' — that's false, you have access. If you need a file — call read_file.");

  const reviewMode = isReview
    ? t(locale,
        `\n\n=== РЕЖИМ РЕВЬЮ ===\nЭто цикл проверки. Прочитай последние изменения в коде. Найди ошибки, баги, проблемы с типами, версткой, дизайном. Если всё идеально — ответь ТОЛЬКО: "[STATUS: RELEASE_READY] Проверка пройдена." Если есть проблемы — укажи файл, строку и конкретное описание что не так. Будь строгим и внимательным.`,
        `\n\n=== REVIEW MODE ===\nThis is a review cycle. Check latest code changes. Find bugs, type issues, UI problems. If perfect — reply ONLY: "[STATUS: RELEASE_READY] Review passed." If issues found — specify file, line, and exact problem. Be strict and thorough.`)
    : "";

  const fixModePrompt = isFix
    ? t(locale,
        `\n\n=== РЕЖИМ ИСПРАВЛЕНИЯ ===\nСоветники нашли ошибки (читай их сообщения выше). Исправь ВСЕ найденные проблемы. Проверь тестами. Если всё исправлено — ответь: "[STATUS: RELEASE_READY] Все ошибки исправлены."`,
        `\n\n=== FIX MODE ===\nAdvisors found issues (read their messages above). Fix ALL found problems. Verify with tests. If fixed — reply: "[STATUS: RELEASE_READY] All issues fixed."`)
    : "";

  const releaseProtocol = isReview || isFix
    ? t(locale,
        `\n\n=== ПРОТОКОЛ RELEASE_READY ===\nЕсли ты считаешь что код готов к релизу, ответь СТРОГО: "[STATUS: RELEASE_READY] <твой комментарий>." Только так система поймёт что цикл завершён. Без этого флага цикл будет продолжаться.`,
        `\n\n=== RELEASE_READY PROTOCOL ===\nIf you believe code is release-ready, reply EXACTLY: "[STATUS: RELEASE_READY] <your comment>." Only this flag tells the system to stop. Without it the cycle continues.`)
    : "";

  return `${identity} ${persona}.${collaboration} ${fileContext}${reviewMode}${fixModePrompt}${releaseProtocol} ${t(locale, `Текущих находок стат. анализа: ${findingsCount}.`, `Current static findings: ${findingsCount}.`)}`;
}

function roleDisplay(role: string, lang: "ru" | "en"): string {
  if (lang === "ru") {
    const map: Record<string, string> = { main: "Главный", advisor: "Советник", reviewer: "Ревьюер", tester: "Тестировщик", architect: "Архитектор", uiux: "UI/UX Дизайнер", security: "Секурити", observer: "Наблюдатель" };
    return map[role] ?? role;
  }
  const map: Record<string, string> = { main: "Lead", advisor: "Advisor", reviewer: "Reviewer", tester: "Tester", architect: "Architect", uiux: "UI/UX Designer", security: "Security", observer: "Observer" };
  return map[role] ?? role;
}

async function* streamAgentReply(
  agent: typeof agents.$inferSelect,
  channel: ChatChannel,
  userText: string,
  locale: UiLocale,
  attachments: ChatAttachment[],
  findingsCount: number,
  options: ProviderGatewayOptions & { projectContext?: ProjectContextInput; isMultiAgent?: boolean; reviewOnly?: boolean; fixMode?: boolean },
): AsyncGenerator<ChatStreamEvent> {
  const apiKey = await getStoredProviderApiKey(agent.provider);
  const history = await gatewayHistory(channel);
  const projectContext = await buildProjectContext(options.projectContext);
  const prompt = `${userText}${attachmentContext(locale, attachments)}\n\n${projectContext}`;
  const isMulti = Boolean(options.isMultiAgent);
  const isReview = Boolean(options.reviewOnly);
  const isFix = Boolean(options.fixMode);

  const agentRows = await db.select({ name: agents.name, role: agents.role, color: agents.color }).from(agents).where(eq(agents.isActive, true));
  const allAgentNames = agentRows.map((a) => ({ name: a.name, role: a.role, color: a.color ?? "" }));

  const [workspaceSettingsRow] = await db.select({ projectTemplatePrompt: workspaceSettings.projectTemplatePrompt, fallbackModels: workspaceSettings.fallbackModels }).from(workspaceSettings).limit(1);
  const templatePrompt = compact(workspaceSettingsRow?.projectTemplatePrompt);
  const baseSystemPrompt = agentSystemPrompt(locale, agent, findingsCount, isMulti, allAgentNames, isReview, isFix);
  const refreshedSystemPrompt = `${baseSystemPrompt}\n\n=== CURRENT PROJECT CONTEXT (REFRESHED) ===\n${projectContext}`;
  const gatewayMessages: GatewayMessage[] = [
    { role: "system", content: templatePrompt ? `${refreshedSystemPrompt}\n\nPROJECT TEMPLATE SPECIALIZATION:\n${templatePrompt}` : refreshedSystemPrompt },
    ...history,
  ];

  const latest = gatewayMessages[gatewayMessages.length - 1];
  if (!latest || latest.role !== "user" || latest.content !== prompt) {
    gatewayMessages.push({ role: "user", content: prompt });
  }

  const request = providerRequestFromAgent(agent, apiKey);
  const identity = createAgentIdentity({
    agentId: agent.id,
    displayName: agent.name,
    role: agent.role,
    provider: agent.provider,
    model: agent.model,
  });
  const tools = getToolDefinitions(agent.role);
  const mainAgentId = (await db.select({ id: agents.id }).from(agents).where(eq(agents.role, "main")).limit(1))[0]?.id ?? agent.id;

  yield { type: "agent_start", channel, identity };

  let fullResponse = "";
  const MAX_TOOL_ROUNDS = agent.role === "main" ? 10 : 3;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    if (options.signal?.aborted) throw new Error("Chat request cancelled");

    let chunkText = "";
    for await (const chunk of streamProviderResponse(request, gatewayMessages, {
      ...options,
      tools: tools.length ? tools : undefined,
      fallbackModels: Array.isArray(workspaceSettingsRow?.fallbackModels) ? workspaceSettingsRow.fallbackModels : [],
      onFallback: async (model, error) => {
        await recordSystemEvent("warning", "fallback", `${agent.name}: ${agent.model} failed (${error.status ?? "timeout"}); switched to ${model}`);
      },
    })) {
      chunkText += chunk;
      yield { type: "delta", channel, identity, text: chunk };
    }

    fullResponse += chunkText;

    // Check for tool calls
    const toolCall = parseToolCall(chunkText);
    if (!toolCall) break; // No tool call — agent is done talking

    // Execute tool
    const toolResult = await executeToolCall(toolCall.name, toolCall.arguments, agent.role, mainAgentId);

    // Feed result back and continue loop
    gatewayMessages.push({ role: "assistant", content: chunkText });
    gatewayMessages.push(toolResultMessage(toolCall.name, toolResult));

    if (round >= MAX_TOOL_ROUNDS) {
      fullResponse += `\n\n[Max tool rounds reached (${MAX_TOOL_ROUNDS}).]`;
      break;
    }
  }

  if (!fullResponse.trim()) throw new Error(`${agent.name} returned an empty response`);

  await pushMessage({
    chatChannel: channel,
    senderType: agent.role === "main" ? "main" : "advisor",
    agentName: agent.name,
    content: fullResponse,
    metadata: { identity },
  });

  yield { type: "agent_done", channel, identity, content: fullResponse };
}

export async function* streamWorkspaceMessage(
  content: string,
  locale?: string,
  options?: { channel?: ChatChannel; duplicateToLead?: boolean; attachments?: ChatAttachment[]; signal?: AbortSignal; projectContext?: ProjectContextInput },
): AsyncGenerator<ChatStreamEvent> {
  const activeLocale = normalizeLocale(locale);
  const channel: ChatChannel = options?.channel === "lead" ? "lead" : "group";
  const duplicateToLead = Boolean(options?.duplicateToLead);
  const attachments = await enrichAttachments((options?.attachments ?? []).slice(0, 6));

  await ensureWorkspaceBootstrap();
  const trimmed = content.trim();
  if (!trimmed && attachments.length === 0) throw new Error(t(activeLocale, "Введите сообщение или добавьте вложение.", "Enter a message or add an attachment."));

  const userText = trimmed || t(activeLocale, "[прикреплены материалы]", "[materials attached]");
  const metadata = attachments.length > 0 ? { attachments } : {};

  await pushMessage({
    chatChannel: channel,
    senderType: "user",
    agentName: t(activeLocale, "Пользователь", "User"),
    content: userText,
    metadata,
  });

  if (channel === "group" && duplicateToLead) {
    await pushMessage({
      chatChannel: "lead",
      senderType: "user",
      agentName: t(activeLocale, "Пользователь", "User"),
      content: userText,
      metadata,
    });
  }

  // Run initial agent round
  for await (const event of runAgentRound(channel, userText, activeLocale, attachments, {
    signal: options?.signal,
    projectContext: options?.projectContext,
  })) {
    yield event;
  }

  // Check if auto-approve mode is enabled for autonomous self-correction
  const [settingsRow] = await db.select({ autoApprove: workspaceSettings.autoApprove }).from(workspaceSettings).limit(1);
  const autoApprove = Boolean(settingsRow?.autoApprove);

  if (channel === "group" && autoApprove && !options?.signal?.aborted) {
    for (let iteration = 0; iteration < 15; iteration += 1) {
      if (options?.signal?.aborted) break;

      // Check if all agents voted RELEASE_READY
      const recentMessages = await db.select().from(chatMessages)
        .where(eq(chatMessages.chatChannel, "group"))
        .orderBy(desc(chatMessages.id))
        .limit(20);

      const activeAgents = await db.select().from(agents).where(eq(agents.isActive, true));
      const readyVotes = recentMessages.filter((m) =>
        m.senderType !== "user" && m.senderType !== "system" && m.content.includes("[STATUS: RELEASE_READY]"),
      );

      // Require ALL active agents to signal ready (or at least 3 if single-agent)
      const requiredVotes = Math.min(activeAgents.length, 4);
      if (readyVotes.length >= requiredVotes) {
        const finalIdentity = createAgentIdentity({
          agentId: activeAgents[0]?.id ?? 0,
          displayName: activeAgents[0]?.name ?? "Main",
          role: "main",
          provider: activeAgents[0]?.provider ?? "",
          model: activeAgents[0]?.model ?? "",
        });
        const doneMsg = t(activeLocale,
          `[STATUS: RELEASE_READY] ✅ Все ${readyVotes.length} агентов подтвердили готовность. Цикл завершён.`,
          `[STATUS: RELEASE_READY] ✅ All ${readyVotes.length} agents confirmed readiness. Cycle complete.`);
        yield { type: "delta", channel, identity: finalIdentity, text: doneMsg };
        yield { type: "agent_done", channel, identity: finalIdentity, content: doneMsg };
        break;
      }

      // Run review cycle: ask reviewer + tester to check latest code
      const reviewText = t(activeLocale,
        `Проверь текущий код после последних правок. Найди ошибки, баги, проблемы. Если всё идеально — ответь "[STATUS: RELEASE_READY] Код готов." Если есть проблемы — укажи конкретный файл, строку и что исправить.`,
        `Review the current code after latest changes. Find bugs, errors, issues. If perfect — reply "[STATUS: RELEASE_READY] Code ready." If issues — specify file, line, and fix needed.`);

      try {
        for await (const event of runAgentRound(channel, reviewText, activeLocale, [], {
          signal: options?.signal,
          projectContext: options?.projectContext,
          reviewOnly: true,
        })) {
          yield event;
        }
      } catch {
        // Continue to next iteration even if review round fails
      }

      // Check if main needs to fix something (messages contain error mentions)
      const lastRoundMessages = await db.select().from(chatMessages)
        .where(eq(chatMessages.chatChannel, "group"))
        .orderBy(desc(chatMessages.id))
        .limit(10);
      const hasIssues = lastRoundMessages.some((m) =>
        m.content.includes("ошибка") || m.content.includes("баг") || m.content.includes("error") || m.content.includes("bug"),
      );

      if (hasIssues) {
        const fixText = t(activeLocale,
          `Исправь найденные ошибки. Выше в чате — конкретные замечания от советников. Примени исправления и проверь тестами. Если всё работает — ответь "[STATUS: RELEASE_READY] Исправлено."`,
          `Fix the issues found. Above in chat — specific feedback from advisors. Apply fixes and verify with tests. If everything works — reply "[STATUS: RELEASE_READY] Fixed."`);

        try {
          for await (const event of runAgentRound(channel, fixText, activeLocale, [], {
            signal: options?.signal,
            projectContext: options?.projectContext,
            fixMode: true,
          })) {
            yield event;
          }
        } catch {
          // Continue
        }
      }

      // Prevent infinite loops
      if (iteration >= 14) {
        const limitMsg = t(activeLocale,
          `[STATUS: MAX_ITERATIONS] Достигнут лимит итераций автономного цикла.`,
          `[STATUS: MAX_ITERATIONS] Autonomous cycle iteration limit reached.`);
        yield { type: "delta", channel, identity: createAgentIdentity({ agentId: 0, displayName: "System", role: "system", provider: "", model: "" }), text: limitMsg };
        break;
      }
    }
  }

  // Post clean summary to lead chat
  if (channel === "group" && !options?.signal?.aborted) {
    const allGroupMessages = await db.select().from(chatMessages).where(eq(chatMessages.chatChannel, "group")).orderBy(desc(chatMessages.id)).limit(30);
    const [mainAgent] = await db.select().from(agents).where(eq(agents.role, "main")).limit(1);
    const summary = allGroupMessages
      .filter((m) => m.senderType !== "user" && m.senderType !== "system")
      .slice(0, 8)
      .reverse()
      .map((m) => `${m.agentName ?? m.senderType}: ${m.content.slice(0, 200)}`)
      .join("\n\n");

    if (mainAgent && summary) {
      await pushMessage({
        chatChannel: "lead",
        senderType: "main",
        agentName: mainAgent.name,
        content: t(activeLocale,
          `📋 ИТОГОВЫЙ ОТЧЁТ\n\n${summary}\n\n=== КОНЕЦ ОТЧЁТА ===`,
          `📋 FINAL REPORT\n\n${summary}\n\n=== END OF REPORT ===`),
        metadata: { identity: createAgentIdentity({ agentId: mainAgent.id, displayName: mainAgent.name, role: "main", provider: mainAgent.provider, model: mainAgent.model }) },
      });
    }
  }

  if (options?.signal?.aborted) throw new Error("Chat request cancelled");
  yield { type: "done", channel };
}

async function* runAgentRound(
  channel: ChatChannel,
  userText: string,
  activeLocale: UiLocale,
  attachments: ChatAttachment[],
  options: { signal?: AbortSignal; projectContext?: ProjectContextInput; reviewOnly?: boolean; fixMode?: boolean },
): AsyncGenerator<ChatStreamEvent> {
  const [mainAgent] = await db.select().from(agents).where(eq(agents.role, "main")).limit(1);
  if (!mainAgent) throw new Error(t(activeLocale, "Главный агент не назначен.", "No Lead agent is assigned."));

  const findingsCount = (await db.select().from(analysisFindings)).length;
  const activeAgents = await db.select().from(agents).where(eq(agents.isActive, true));
  const agentRows = channel === "lead" && !options.reviewOnly
    ? [mainAgent]
    : options.fixMode
      ? [mainAgent]
      : options.reviewOnly
        ? activeAgents.filter((a) => a.role !== "main")
        : [mainAgent, ...activeAgents.filter((a) => a.role !== "main")];

  const uniqueAgents = agentRows.filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);
  const isMultiAgent = uniqueAgents.length > 1;

  for (const agent of uniqueAgents) {
    if (options.signal?.aborted) throw new Error("Chat request cancelled");
    try {
      const ctxIsMulti = isMultiAgent && agent.role !== "main";
      for await (const event of streamAgentReply(agent, channel, userText, activeLocale, attachments, findingsCount, {
        signal: options.signal,
        isMultiAgent: ctxIsMulti,
        reviewOnly: Boolean(options.reviewOnly),
        fixMode: Boolean(options.fixMode),
        projectContext: options.projectContext,
      })) {
        yield event;
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const message = agentFailureMessage(activeLocale, agent, error);
      try {
        await recordSystemEvent(
          error instanceof ProviderGatewayError && error.status === 429 ? "warning" : "error",
          "provider",
          message,
          error instanceof Error ? error.stack ?? "" : "",
        );
      } catch { /* best-effort */ }
      yield {
        type: "agent_error", channel,
        identity: createAgentIdentity({ agentId: agent.id, displayName: agent.name, role: agent.role, provider: agent.provider, model: agent.model }),
        message,
        status: error instanceof ProviderGatewayError ? error.status : undefined,
        rateLimited: error instanceof ProviderGatewayError && error.status === 429,
      };
    }
  }
}

export async function postGroupMessage(
  content: string,
  locale?: string,
  options?: { channel?: ChatChannel; duplicateToLead?: boolean; attachments?: ChatAttachment[] },
) {
  for await (const _event of streamWorkspaceMessage(content, locale, options)) {
    // Consume the stream for the non-streaming compatibility endpoint.
  }
}

