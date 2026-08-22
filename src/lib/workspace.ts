import "server-only";

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
import { executeToolCall, getToolDefinitions, parseToolCall, toolResultMessage } from "@/lib/agent-tools";

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

const defaultAgents = [
  {
    name: "Главный агент",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    role: "main",
    description: "Главный кодер: проектирует архитектуру и пишет основной код.",
    skill: "Сильный fullstack-инженер с акцентом на чистую архитектуру и практичность.",
    systemPrompt: "Ты главный разработчик. Вноси только безопасные и проверяемые изменения.",
    color: "#4fc1ff",
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

async function pushMessage(payload: {
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

async function getWorkspaceSettingsRow() {
  const [row] = await db.select().from(workspaceSettings).limit(1);
  return row;
}

async function githubRequest<T>(url: string, init: RequestInit, token: string): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

async function getGitHubDefaultBranch(repo: string, token: string) {
  const payload = await githubRequest<{ default_branch?: string }>(`https://api.github.com/repos/${repo}`, { method: "GET" }, token);
  return payload.default_branch || "main";
}

async function pushSingleFileToGitHub(repo: string, token: string, branch: string, path: string, content: string, message: string) {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
  const endpoint = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;

  let sha: string | undefined;
  try {
    const existing = await githubRequest<{ sha?: string }>(`${endpoint}?ref=${encodeURIComponent(branch)}`, { method: "GET" }, token);
    sha = existing.sha;
  } catch {
    sha = undefined;
  }

  await githubRequest(
    endpoint,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch,
        sha,
      }),
    },
    token,
  );
}

export async function pushWorkspaceToGitHub(locale?: string) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  const settings = await getWorkspaceSettingsRow();
  const storedToken = compact(settings.githubToken);
  const token = storedToken ? await decryptSecret(storedToken) : "";
  const repo = compact(settings.githubRepo);

  if (!token || !repo) {
    throw new Error(t(activeLocale, "Заполните GitHub Token и Repository в настройках.", "Set GitHub Token and Repository in settings."));
  }

  const branch = await getGitHubDefaultBranch(repo, token);
  const files = await db.select().from(projectFiles).orderBy(asc(projectFiles.path));

  let pushed = 0;
  for (const file of files) {
    await pushSingleFileToGitHub(repo, token, branch, file.path, file.content, `chore(ai): sync ${file.path}`);
    pushed += 1;
  }

  await pushMessage({
    chatChannel: "group",
    senderType: "system",
    agentName: "System",
    content: t(activeLocale, `GitHub push выполнен. Файлов отправлено: ${pushed}.`, `GitHub push completed. Files pushed: ${pushed}.`),
  });

  return { pushed, branch };
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
    const branch = await getGitHubDefaultBranch(repo, token);
    await pushSingleFileToGitHub(repo, token, branch, path, content, `chore(ai-auto): update ${path}`);
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
    if (model !== agent.model || systemPrompt !== agent.systemPrompt || name !== agent.name) {
      await db.update(agents).set({ model, systemPrompt, name }).where(eq(agents.id, agent.id));
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
  if (existingMessages.length === 0) {
    await pushMessage({
      chatChannel: "group",
      senderType: "system",
      agentName: "System",
      content: "Workspace готов. Можно загружать свои файлы кода и отправлять ссылки/картинки в чат.",
    });
  }

  const existingTerminal = await db.select().from(terminalEntries).limit(1);
  if (existingTerminal.length === 0) {
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
  const fileRows = await db.select().from(projectFiles).orderBy(asc(projectFiles.path));
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
  removeApiKeys?: string[];
}) {
  await ensureWorkspaceBootstrap();
  const current = await getWorkspaceSettingsRow();
  const githubToken = compact(payload.githubToken) || current.githubToken;
  const githubRepo = payload.githubRepo === undefined ? current.githubRepo : compact(payload.githubRepo);

  await db
    .update(workspaceSettings)
    .set({
      projectRoot: payload.projectRoot === undefined ? current.projectRoot : compact(payload.projectRoot),
      apiKeys: mergeApiKeys(current.apiKeys ?? {}, payload.apiKeys, payload.removeApiKeys),
      githubToken,
      githubRepo,
      githubAutoPush: payload.githubAutoPush === undefined ? current.githubAutoPush : Boolean(payload.githubAutoPush),
      updatedAt: new Date(),
    });
  await recordSystemEvent("success", "settings", "Workspace settings saved");
}

export async function importProjectFiles(files: Array<{ path: string; content: string }>, locale?: string) {
  const activeLocale = normalizeLocale(locale);
  await ensureWorkspaceBootstrap();

  let imported = 0;

  for (const file of files) {
    const path = compact(file.path);
    if (!path) continue;

    const content = file.content ?? "";

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

  if (!name) throw new Error(t(activeLocale, "Имя агента обязательно", "Agent name is required"));

  const [created] = await db
    .insert(agents)
    .values({
      name,
      provider,
      baseUrl,
      model,
      role: role === "main" ? "advisor" : role,
      description: payload.description ?? "",
      skill: payload.skill ?? "",
      systemPrompt: cleanAgentSystemPrompt(payload.systemPrompt ?? ""),
      color: compact(payload.color) || "#4fc1ff",
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
      color: payload.color !== undefined ? compact(payload.color) || agent.color : agent.color,
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
  for (const helper of helpers) {
    try {
      const apiKey = await getStoredProviderApiKey(helper.provider);
      const response = await completeProviderResponse(
        providerRequestFromAgent(helper, apiKey),
        [
          {
            role: "system",
            content: agentSystemPrompt(activeLocale, helper, findings.length, false),
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

  const compacted: GatewayMessage[] = [];
  for (const message of messages) {
    const previous = compacted[compacted.length - 1];
    if (previous?.role === message.role) previous.content += `\\n\\n${message.content}`;
    else compacted.push({ ...message });
  }
  return compacted.slice(-16);
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

function agentSystemPrompt(locale: UiLocale, agent: typeof agents.$inferSelect, findingsCount: number, isMultiAgent: boolean) {
  const persona = promptPersona(locale, { skill: agent.skill, systemPrompt: agent.systemPrompt });
  const configuredModel = normalizeProviderModel(agent.provider, agent.model);
  const configuredProvider = getProviderPreset(agent.provider).label;
  const identity = t(
    locale,
    `Твоя реальная конфигурация: роль «${agent.role}», провайдер «${configuredProvider}», модель «${configuredModel}». Не выдумывай себе другое имя и не заявляй, что работаешь на другой модели.`,
    `Your actual configuration: role "${agent.role}", provider "${configuredProvider}", model "${configuredModel}". Do not invent another name or claim to run on a different model.`,
  );

  const collaboration = isMultiAgent
    ? t(
        locale,
        `Ты работаешь в команде агентов. Сначала советники изучают код и дают рекомендации. Главный агент потом применяет правки в код. Твоя роль: высказать своё мнение, проанализировать код, предложить решение. НЕ кодируй — только дай совет.

ПОРЯДОК РАБОТЫ:
1. Прочитай нужные файлы через read_file
2. Найди проблему через search_code
3. Выскажи своё мнение и предложи решение
4. Главный агент применит правки после общего обсуждения

НЕ ПИШИ КОД. Только анализ и рекомендации.`,
        `You work in a team of agents. First, advisors study the code and give recommendations. Then the Lead agent applies code changes. Your role: speak up, analyze code, propose a solution. DO NOT code — only advise.

WORKFLOW:
1. Read relevant files via read_file
2. Find issues via search_code
3. Voice your opinion and propose a solution
4. The Lead agent will apply changes after the team discussion

DO NOT WRITE CODE. Only analysis and recommendations.`,
      )
    : t(
        locale,
        `Ты — Главный агент. Это твоя очередь кодить. Все советники уже высказались в общем чате. Теперь:
1. Прочитай нужные файлы через read_file
2. Напиши код через write_file
3. Проверь работу через run_command (npm test, npx tsc --noEmit)
4. Если тесты упали — найди ошибку, исправь, проверь снова

У тебя есть ВСЕ инструменты: read_file, write_file, create_file, delete_file, search_code, run_command. Используй их чтобы довести задачу до конца.`,
        `You are the Lead Agent. It is your turn to code. All advisors have shared their analysis in the group chat. Now:
1. Read relevant files via read_file
2. Write code via write_file
3. Verify with run_command (npm test, npx tsc --noEmit)
4. If tests fail — debug, fix, re-verify

You have ALL tools: read_file, write_file, create_file, delete_file, search_code, run_command. Use them to get the task done.`,
      );

  const fileContext = t(
    locale,
    "Используй переданный PROJECT CONTEXT и инструменты вместо гадания. Не говори «нет доступа к файлам» — используй read_file.",
    "Use the provided PROJECT CONTEXT and your tools instead of guessing. Do not claim 'no file access' — use read_file.");

  return `${identity} ${persona}. ${collaboration} ${fileContext} ${t(locale, `Текущих находок стат. анализа: ${findingsCount}.`, `Current static findings: ${findingsCount}.`)}`;
}

async function* streamAgentReply(
  agent: typeof agents.$inferSelect,
  channel: ChatChannel,
  userText: string,
  locale: UiLocale,
  attachments: ChatAttachment[],
  findingsCount: number,
  options: ProviderGatewayOptions & { projectContext?: ProjectContextInput; isMultiAgent?: boolean },
): AsyncGenerator<ChatStreamEvent> {
  const apiKey = await getStoredProviderApiKey(agent.provider);
  const history = await gatewayHistory(channel);
  const projectContext = await buildProjectContext(options.projectContext);
  const prompt = `${userText}${attachmentContext(locale, attachments)}\n\n${projectContext}`;
  const isMulti = Boolean(options.isMultiAgent);

  const gatewayMessages: GatewayMessage[] = [
    { role: "system", content: agentSystemPrompt(locale, agent, findingsCount, isMulti) },
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
    for await (const chunk of streamProviderResponse(request, gatewayMessages, { ...options, tools: tools.length ? tools : undefined })) {
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

  const [mainAgent] = await db.select().from(agents).where(eq(agents.role, "main")).limit(1);
  if (!mainAgent) throw new Error(t(activeLocale, "Главный агент не назначен.", "No Lead agent is assigned."));

  const findingsCount = (await db.select().from(analysisFindings)).length;
  const agentRows = channel === "lead"
    ? [mainAgent]
    : [mainAgent, ...(await db.select().from(agents).where(and(ne(agents.role, "main"), eq(agents.isActive, true))))];

  const isMultiAgent = agentRows.length > 1;

  for (let agentIndex = 0; agentIndex < agentRows.length; agentIndex++) {
    const agent = agentRows[agentIndex];
    if (options?.signal?.aborted) throw new Error("Chat request cancelled");

    try {
      // Advisors speak first (read-only mode), main agent codes last (with full tools)
      const ctxIsMulti = isMultiAgent && agent.role !== "main"; // true for advisors in multi-agent mode

      for await (const event of streamAgentReply(agent, channel, userText, activeLocale, attachments, findingsCount, {
        signal: options?.signal,
        isMultiAgent: ctxIsMulti,
      })) {
        yield event;
      }

      if (agent.role === "main" && channel === "group" && duplicateToLead) {
        const [latest] = await db.select().from(chatMessages).where(and(eq(chatMessages.chatChannel, "group"), eq(chatMessages.agentName, agent.name))).orderBy(desc(chatMessages.id)).limit(1);
        if (latest) {
          await pushMessage({
            chatChannel: "lead",
            senderType: "main",
            agentName: agent.name,
            content: latest.content,
            metadata: { identity: createAgentIdentity({
              agentId: agent.id,
              displayName: agent.name,
              role: agent.role,
              provider: agent.provider,
              model: agent.model,
            }) },
          });
        }
      }
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      const message = agentFailureMessage(activeLocale, agent, error);
      try {
        await pushMessage({
          chatChannel: channel,
          senderType: "system",
          agentName: "System",
          content: message,
        });
      } catch {
        // Persisting the notification is best-effort; never stop other agents.
      }
      yield {
        type: "agent_error",
        channel,
        identity: createAgentIdentity({
          agentId: agent.id,
          displayName: agent.name,
          role: agent.role,
          provider: agent.provider,
          model: agent.model,
        }),
        message,
        status: error instanceof ProviderGatewayError ? error.status : undefined,
        rateLimited: error instanceof ProviderGatewayError && error.status === 429,
      };
    }
  }

  if (options?.signal?.aborted) throw new Error("Chat request cancelled");
  yield { type: "done", channel };
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

