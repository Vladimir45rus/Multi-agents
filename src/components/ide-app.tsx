"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PROVIDER_PRESETS, getProviderPreset, normalizeProviderModel } from "@/lib/providers";
import { OrchestratorPanel } from "@/components/orchestrator-panel";
import { hasSseData, parseSseJson } from "@/lib/sse-json";
import type { AgentIdentity } from "@/lib/agent-identity";
import { appendStreamDelta, finishStream, type ChatStreamState } from "@/lib/chat-state";

type ChatMessageStatus = "sending" | "sent" | "error" | "cancelled";
type ChatRetryRequest = {
  channel: ChatChannel;
  message: string;
  duplicate: boolean;
  attachments: ChatAttachment[];
  optimisticIds: number[];
};

type UiLocale = "ru" | "en";
type ChatChannel = "group" | "lead";

type ChatAttachment = {
  type: "image" | "link";
  url?: string;
  name?: string;
  title?: string;
  previewText?: string;
};

type WorkspaceMessage = {
  id: number;
  chatChannel: ChatChannel;
  senderType: string;
  agentName: string | null;
  content: string;
  metadata: {
    attachments?: ChatAttachment[];
    identity?: AgentIdentity;
  };
  createdAt: string;
  status?: ChatMessageStatus;
};

type ChatStreamEvent =
  | { type: "agent_start"; channel: ChatChannel; identity: AgentIdentity }
  | { type: "delta"; channel: ChatChannel; identity: AgentIdentity; text: string }
  | { type: "agent_done"; channel: ChatChannel; identity: AgentIdentity; content: string }
  | { type: "agent_error"; channel: ChatChannel; identity: AgentIdentity; message: string; status?: number; rateLimited?: boolean }
  | { type: "done"; channel: ChatChannel }
  | { type: "error"; channel: ChatChannel; message: string };

type Agent = {
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
};

type WorkspaceTreeEntry = {
  path: string;
  language: string;
  size: number;
  updatedAt: string;
  kind: "file" | "directory";
};

type WorkspaceData = {
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
  agents: Agent[];
  files: Array<{ id: number; path: string; language: string; content: string; updatedAt: string }>;
  messages: WorkspaceMessage[];
  terminal: Array<{ id: number; command: string; output: string; status: string; createdAt: string }>;
  systemEvents: Array<{ id: number; level: string; source: string; message: string; details: string; createdAt: string }>;
  findings: Array<{ id: number; filePath: string; severity: string; message: string; line: number | null; createdAt: string }>;
};

type AgentDraft = {
  provider: string;
  baseUrl: string;
  model: string;
  role: string;
  description: string;
  skill: string;
  systemPrompt: string;
  color: string;
  manualModel: boolean;
};

type NewAgentDraft = {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  role: string;
  description: string;
  skill: string;
  systemPrompt: string;
  color: string;
  manualModel: boolean;
};

type DesktopBridge = {
  selectDirectory: () => Promise<string | null>;
  safeStorage?: {
    isAvailable: () => Promise<boolean>;
    encryptString: (plaintext: string) => Promise<string>;
    decryptString: (encrypted: string) => Promise<string>;
  };
  wasRecoveredFromCrash?: () => Promise<boolean>;
};

const roleOptions = ["main", "advisor", "reviewer", "tester", "architect", "security", "observer"];

const ROLE_COLORS: Record<string, string> = {
  main: "#4fc1ff",
  advisor: "#6a9955",
  reviewer: "#ce9178",
  tester: "#dcdcaa",
  architect: "#c586c0",
  security: "#f48771",
  observer: "#9da3b2",
};

const ROLE_PRIORITY: Record<string, number> = {
  main: 0,
  architect: 1,
  advisor: 2,
  reviewer: 3,
  tester: 4,
  security: 5,
  observer: 6,
};

function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.role] ?? 99;
    const pb = ROLE_PRIORITY[b.role] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

const COLLAPSED_SIDE = 38;
const COLLAPSED_BOTTOM = 38;

type PanelName = "explorer" | "editor" | "lead" | "group" | "terminal" | "logs";

type ContextMenuState = {
  x: number;
  y: number;
  entry: WorkspaceTreeEntry;
};

const dict = {
  ru: {
    loading: "Загрузка рабочей среды...",
    synced: "Синхронизировано",
    errLoad: "Не удалось загрузить рабочую среду",
    recovered: "Восстановлено после сбоя",
    settings: "Настройки",
    openSettings: "Открыть настройки",
    close: "Закрыть",
    lang: "Язык",
    explorer: "ДЕРЕВО ПРОЕКТА",
    editor: "РЕДАКТОР",
    noFile: "Файл не выбран",
    saveMain: "Сохранить от Главного",
    rollback: "Откатить изменения",
    pushGithub: "Пуш в GitHub",
    donateBtn: "💛 Поддержать / Донат",
    supportTitle: "Поддержка и связь",
    supportDonateTitle: "Донаты",
    supportDonateDesc: "Если проект полезен — поддержите разработку. Донаты помогают делать инструмент лучше.",
    supportProjectBtn: "Поддержать проект ❤️",
    emailTitle: "Почта для связи",
    emailLabel: "Email",
    emailDesc: "Для багрепортов, предложений и техподдержки",
    supportThanks: "Спасибо за поддержку!",
    github: "GitHub",
    githubToken: "GitHub Token",
    githubRepo: "Репозиторий (username/repo)",
    githubAutoPush: "Автосохранение в GitHub после правок ИИ",
    leadChat: "ЧАТ С ГЛАВНЫМ",
    allChat: "ОБЩИЙ ЧАТ АГЕНТОВ",
    send: "Отправить",
    duplicate: "Дублировать в чат с главным",
    terminal: "ТЕРМИНАЛ",
    checks: "ПРОВЕРКИ",
    importCode: "Импорт кода",
    projectFolder: "Папка проекта",
    folderPath: "Путь к локальной папке",
    connectFolder: "Подключить папку",
    browseFolder: "Выбрать папку",
    folderConnected: "Папка подключена",
    importHint: "Загрузите .ts/.tsx/.js/.py/.md и другие текстовые файлы",
    importBtn: "Импортировать файлы",
    attachLink: "Ссылка",
    attachImage: "Картинка",
    addLink: "Добавить ссылку",
    clearAttach: "Очистить вложения",
    apiKeys: "API-ключи",
    saveKeys: "Сохранить ключи",
    freeOpenRouter: "Получить бесплатный ключ OpenRouter",
    provider: "Провайдер",
    baseUrl: "Base URL",
    defaultModel: "Модель по умолчанию",
    agents: "Агенты",
    createAgent: "Создать агента",
    role: "Роль",
    name: "Имя",
    model: "Модель",
    loadModels: "Обновить модели",
    manualModel: "Ввести вручную...",
    profile: "Профиль",
    skill: "Скилл",
    prompt: "Системный промпт",
    saveProfile: "Сохранить профиль",
    setMain: "Назначить главным",
    mockHint: "Для реального ответа агенту нужен API-ключ выбранного провайдера.",
    ready: "✅ Готово",
    busy: "⏳ Выполняется...",
    stop: "Остановить",
    retry: "Повторить",
    copy: "Копировать",
    copied: "Скопировано",
    sending: "Отправляется",
    streaming: "Генерация",
    sent: "Готово",
    cancelled: "Остановлено",
    errorStatus: "Ошибка",
    unsaved: "● Не сохранено",
    collapse: "Свернуть",
    expand: "Развернуть",
    newFile: "Создать файл",
    newFolder: "Создать папку",
    rename: "Переименовать",
    delete: "Удалить",
    create: "Создать",
    error429: "⚠️ Ошибка 429 (Превышен лимит запросов). Смените модель или провайдера.",
    errorDefault: "⚠️ Произошла ошибка. Попробуйте ещё раз или смените модель.",
    logsTitle: "ЛОГИ / СИСТЕМНЫЕ СОБЫТИЯ",
  },
  en: {
    loading: "Loading workspace...",
    synced: "Synchronized",
    errLoad: "Failed to load workspace",
    recovered: "Recovered after a crash",
    settings: "Settings",
    openSettings: "Open settings",
    close: "Close",
    lang: "Language",
    explorer: "PROJECT TREE",
    editor: "EDITOR",
    noFile: "No file selected",
    saveMain: "Save as Lead",
    rollback: "Rollback changes",
    pushGithub: "Push to GitHub",
    donateBtn: "💛 Support / Donate",
    supportTitle: "Support & Contact",
    supportDonateTitle: "Donations",
    supportDonateDesc: "If the project is useful — support its development. Donations help make the tool better.",
    supportProjectBtn: "Support the project ❤️",
    emailTitle: "Contact email",
    emailLabel: "Email",
    emailDesc: "For bug reports, ideas and tech support",
    supportThanks: "Thanks for your support!",
    github: "GitHub",
    githubToken: "GitHub Token",
    githubRepo: "Repository (username/repo)",
    githubAutoPush: "Auto push to GitHub after AI edits",
    leadChat: "LEAD CHAT",
    allChat: "ALL AGENTS CHAT",
    send: "Send",
    duplicate: "Duplicate to lead chat",
    terminal: "TERMINAL",
    checks: "CHECKS",
    importCode: "Code import",
    projectFolder: "Project folder",
    folderPath: "Local project folder path",
    connectFolder: "Connect folder",
    browseFolder: "Browse folder",
    folderConnected: "Folder connected",
    importHint: "Upload .ts/.tsx/.js/.py/.md and other text files",
    importBtn: "Import files",
    attachLink: "Link",
    attachImage: "Image",
    addLink: "Add link",
    clearAttach: "Clear attachments",
    apiKeys: "API keys",
    saveKeys: "Save keys",
    freeOpenRouter: "Get free OpenRouter key",
    provider: "Provider",
    baseUrl: "Base URL",
    defaultModel: "Default model",
    agents: "Agents",
    createAgent: "Create agent",
    role: "Role",
    name: "Name",
    model: "Model",
    loadModels: "Reload models",
    manualModel: "Enter manually...",
    profile: "Profile",
    skill: "Skill",
    prompt: "System prompt",
    saveProfile: "Save profile",
    setMain: "Set lead",
    mockHint: "A real provider API key is required for an agent to answer.",
    ready: "✅ Ready",
    busy: "⏳ Processing...",
    stop: "Stop",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    sending: "Sending",
    streaming: "Generating",
    sent: "Done",
    cancelled: "Stopped",
    errorStatus: "Error",
    unsaved: "● Unsaved",
    collapse: "Collapse",
    expand: "Maximize",
    newFile: "New file",
    newFolder: "New folder",
    rename: "Rename",
    delete: "Delete",
    create: "Create",
    error429: "⚠️ Error 429 (Rate limit exceeded). Switch model or provider.",
    errorDefault: "⚠️ An error occurred. Try again or switch models.",
    logsTitle: "LOGS / SYSTEM EVENTS",
  },
};

const emptyNewAgent = (overrides: Partial<NewAgentDraft> = {}): NewAgentDraft => {
  const preset = getProviderPreset("openrouter");
  const role = overrides.role ?? "advisor";
  return {
    name: "",
    provider: preset.id,
    baseUrl: preset.baseUrl,
    model: preset.defaultModel,
    role,
    description: "",
    skill: "",
    systemPrompt: "",
    color: ROLE_COLORS[role] ?? "#4fc1ff",
    manualModel: false,
    ...overrides,
  };
};

export function IdeApp() {
  const [locale, setLocale] = useState<UiLocale>("ru");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [editorText, setEditorText] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [duplicateToLead, setDuplicateToLead] = useState(true);
  const [terminalCommand, setTerminalCommand] = useState("");
  const [status, setStatus] = useState(dict.ru.loading);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [addAgentMode, setAddAgentMode] = useState<"template" | "custom" | null>(null);
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<PanelName, boolean>>({
    explorer: false,
    editor: false,
    lead: false,
    group: false,
    terminal: false,
    logs: false,
  });
  const [topProportions, setTopProportions] = useState([0.15, 0.35, 0.25, 0.25]);
  const [bottomProportions, setBottomProportions] = useState([0.5, 0.5]);
  const [bottomRowHeight, setBottomRowHeight] = useState(220);
  const [workspaceTreeEntries, setWorkspaceTreeEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, "new" | "modified" | "saved">>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [apiKeysDraft, setApiKeysDraft] = useState<Record<string, string>>({});
  const [githubTokenDraft, setGithubTokenDraft] = useState("");
  const [githubRepoDraft, setGithubRepoDraft] = useState("");
  const [githubAutoPushDraft, setGithubAutoPushDraft] = useState(false);
  const [agentDrafts, setAgentDrafts] = useState<Record<number, AgentDraft>>({});
  const [newAgent, setNewAgent] = useState<NewAgentDraft>(emptyNewAgent());
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({});

  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [workspaceRootDraft, setWorkspaceRootDraft] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<WorkspaceMessage[]>([]);
  const optimisticMessageIdRef = useRef(-1);
  const leadChatEndRef = useRef<HTMLDivElement>(null);
  const groupChatEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessages, setStreamingMessages] = useState<Record<number, ChatStreamState>>({});
  const [chatRunning, setChatRunning] = useState(false);
  const [retryRequest, setRetryRequest] = useState<ChatRetryRequest | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<number | string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const t = dict[locale];

  const settingsDirty = useMemo(() => {
    const saved = data?.settings;
    if (!saved) return false;
    return Object.values(apiKeysDraft).some((value) => Boolean(value.trim()))
      || githubTokenDraft.trim() !== ""
      || githubRepoDraft !== saved.githubRepo
      || githubAutoPushDraft !== saved.githubAutoPush;
  }, [apiKeysDraft, data?.settings, githubAutoPushDraft, githubRepoDraft, githubTokenDraft]);
  const newAgentDirty = useMemo(() => Boolean(
    newAgent.name.trim()
      || newAgent.description.trim()
      || newAgent.skill.trim()
      || newAgent.systemPrompt.trim()
      || newAgent.provider !== getProviderPreset("openrouter").id
      || newAgent.baseUrl !== getProviderPreset("openrouter").baseUrl
      || newAgent.model !== getProviderPreset("openrouter").defaultModel
      || newAgent.role !== "advisor"
      || newAgent.color !== (ROLE_COLORS[newAgent.role] ?? "#4fc1ff")
      || newAgent.manualModel,
  ), [newAgent]);

  const selectedFile = useMemo(() => data?.files.find((f) => f.id === selectedFileId) ?? null, [data, selectedFileId]);
  const mainAgent = useMemo(() => data?.agents.find((a) => a.role === "main") ?? null, [data?.agents]);
  const leadMessages = useMemo(
    () => [...(data?.messages.filter((m) => m.chatChannel === "lead" && m.senderType !== "system") ?? []), ...optimisticMessages.filter((m) => m.chatChannel === "lead")],
    [data?.messages, optimisticMessages],
  );
  const groupMessages = useMemo(
    () => [...(data?.messages.filter((m) => m.chatChannel === "group" && m.senderType !== "system") ?? []), ...optimisticMessages.filter((m) => m.chatChannel === "group")],
    [data?.messages, optimisticMessages],
  );
  const liveMessages = useMemo(() => Object.values(streamingMessages), [streamingMessages]);
  const liveMessagesVersion = liveMessages.map((message) => `${message.identity.agentId}:${message.content.length}:${message.status}`).join("|");

  useEffect(() => {
    leadChatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    groupChatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [leadMessages.length, groupMessages.length, liveMessagesVersion]);

  useEffect(() => () => chatAbortRef.current?.abort(), []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (contextMenu && !(e.target as HTMLElement).closest(".context-menu")) setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && contextMenu) setContextMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  function roleLabel(role: string) {
    if (locale === "ru") {
      if (role === "main") return "Главный";
      if (role === "advisor") return "Советник";
      if (role === "reviewer") return "Ревьюер";
      if (role === "tester") return "Тестировщик";
      if (role === "architect") return "Архитектор";
      if (role === "security") return "Секурити";
      if (role === "observer") return "Наблюдатель";
    }
    return role;
  }

  function providerModelLabel(provider: string, model: string) {
    return `${getProviderPreset(provider).label} / ${normalizeProviderModel(provider, model)}`;
  }

  function isAgentDraftDirty(agent: Agent, draft: AgentDraft) {
    const agentColor = agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff";
    return agent.provider !== draft.provider || agent.baseUrl !== draft.baseUrl || agent.model !== draft.model || agent.role !== draft.role || agent.description !== draft.description || agent.skill !== draft.skill || agent.systemPrompt !== draft.systemPrompt || agentColor !== draft.color;
  }

  function agentColorForIdentity(identity?: AgentIdentity, fallbackAgent?: Agent | null) {
    if (identity?.agentId) {
      const agent = data?.agents.find((a) => a.id === identity.agentId);
      if (agent) return agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff";
    }
    if (fallbackAgent) return fallbackAgent.color ?? ROLE_COLORS[fallbackAgent.role] ?? "#4fc1ff";
    return ROLE_COLORS[identity?.role ?? "advisor"] ?? "#4fc1ff";
  }

  function agentHeader(identity?: AgentIdentity, fallbackName?: string | null) {
    if (identity?.provider && identity.model) {
      return `${roleLabel(identity.role)} (${getProviderPreset(identity.provider).label}: ${normalizeProviderModel(identity.provider, identity.model)})`;
    }
    return fallbackName ?? roleLabel(identity?.role ?? "agent");
  }

  function messageHeader(message: WorkspaceMessage) {
    if (message.agentName === "System" || message.senderType === "system") return locale === "ru" ? "Система" : "System";
    if (message.senderType === "user" || message.agentName === "User" || message.agentName === "Пользователь") {
      return locale === "ru" ? "Пользователь" : "User";
    }

    const storedIdentity = message.metadata?.identity;
    if (storedIdentity) return agentHeader(storedIdentity, message.agentName);

    const agent = data?.agents.find((candidate) => candidate.name === message.agentName);
    if (agent) {
      const draft = agentDrafts[agent.id];
      return agentHeader(
        {
          agentId: agent.id,
          displayName: agent.name,
          role: draft?.role ?? agent.role,
          provider: draft?.provider ?? agent.provider,
          model: draft?.model ?? agent.model,
        },
        agent.name,
      );
    }

    return agentHeader(undefined, message.agentName);
  }

  function messageColor(message: WorkspaceMessage) {
    if (message.senderType === "user") return "#4fc1ff";
    const storedIdentity = message.metadata?.identity;
    if (storedIdentity) return agentColorForIdentity(storedIdentity);
    const agent = data?.agents.find((candidate) => candidate.name === message.agentName);
    if (agent) return agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff";
    return "#4fc1ff";
  }

  function toDrafts(agents: Agent[]) {
    return Object.fromEntries(
      agents?.map((agent) => [
        agent.id,
        {
          provider: agent.provider,
          baseUrl: agent.baseUrl,
          model: agent.model,
          role: agent.role,
          description: agent.description,
          skill: agent.skill,
          systemPrompt: agent.systemPrompt,
          color: agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff",
          manualModel: false,
        },
      ]),
    );
  }

  async function selectWorkspaceFile(file: WorkspaceTreeEntry) {
    if (file.kind !== "file") return;
    const indexedFile = data?.files.find((candidate) => candidate.path === file.path);
    if (!indexedFile) return;
    setSelectedFileId(indexedFile.id);
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`, { cache: "no-store" });
      const payload = response.ok ? (await response.json()) as { content?: string } : null;
      const content = typeof payload?.content === "string" ? payload.content : indexedFile.content;
      setEditorText(content);
      setData((previous) => previous ? { ...previous, files: previous.files.map((candidate) => candidate.id === indexedFile.id ? { ...candidate, content } : candidate) } : previous);
      setFileStatuses((previous) => ({ ...previous, [file.path]: "saved" }));
    } catch {
      setEditorText(indexedFile.content);
    }
  }

  async function fetchModels(providerId: string, baseUrl?: string, apiKey?: string, force = false) {
    const preset = getProviderPreset(providerId);

    if (!force && modelOptions[providerId]?.length) return;

    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, baseUrl: baseUrl ?? preset.baseUrl, apiKey, force }),
      });

      const payload = (await res.json()) as { models?: string[] };
      const models = payload.models && payload.models.length ? payload.models : preset.fallbackModels;
      setModelOptions((prev) => ({ ...prev, [providerId]: models }));
    } catch {
      setModelOptions((prev) => ({ ...prev, [providerId]: preset.fallbackModels }));
    }
  }

  async function loadWorkspace(nextFileId?: number | null, activeLocale?: UiLocale) {
    const l = activeLocale ?? locale;
    const [workspaceResponse, treeResponse] = await Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/workspace/tree", { cache: "no-store" }),
    ]);
    if (!workspaceResponse.ok) throw new Error(dict[l].errLoad);

    const payload = (await workspaceResponse.json()) as WorkspaceData;
    const treePayload = treeResponse.ok ? (await treeResponse.json()) as { entries?: WorkspaceTreeEntry[] } : null;
    setWorkspaceTreeEntries(treePayload?.entries ?? payload.files.map((file) => ({ path: file.path, language: file.language, size: file.content.length, updatedAt: file.updatedAt, kind: "file" })));
    setData(payload);
    setWorkspaceRootDraft(payload.settings?.projectRoot ?? "");
    setApiKeysDraft(payload.settings?.apiKeys ?? {});
    setGithubTokenDraft(payload.settings?.githubToken ?? "");
    setGithubRepoDraft(payload.settings?.githubRepo ?? "");
    setGithubAutoPushDraft(Boolean(payload.settings.githubAutoPush));
    setAgentDrafts(toDrafts(payload.agents));

    const target = nextFileId ?? selectedFileId ?? payload.files[0]?.id ?? null;
    setSelectedFileId(target);
    if (target != null) localStorage.setItem("ui-selected-file", String(target));
    const file = payload.files.find((f) => f.id === target) ?? payload.files[0];
    setEditorText(file?.content ?? "");
    setFileStatuses((previous) => Object.fromEntries(payload.files.map((item) => [item.path, previous[item.path] === "modified" || previous[item.path] === "new" ? previous[item.path] : "saved"])));
    setStatus(dict[l].synced);

    void fetchModels("openrouter", getProviderPreset("openrouter").baseUrl, payload.settings?.apiKeys?.openrouter);
  }

  useEffect(() => {
    const saved = localStorage.getItem("ui-locale");
    const l: UiLocale = saved === "en" ? "en" : "ru";
    const savedFile = Number(localStorage.getItem("ui-selected-file"));
    const timer = window.setTimeout(() => {
      void loadWorkspace(Number.isFinite(savedFile) ? savedFile : null, l)
        .then(async () => {
          const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
          const recovered = await bridge?.wasRecoveredFromCrash?.().catch(() => false);
          if (recovered) setStatus(dict[l].recovered);
        })
        .catch((e) => setStatus(e instanceof Error ? e.message : dict[l].errLoad));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchModels(newAgent.provider, newAgent.baseUrl, apiKeysDraft[newAgent.provider]);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newAgent.provider]);

  // --- Resize handlers ---

  const topResizeRef = useRef<{ index: number; startX: number; startProps: number[] } | null>(null);

  const startTopResize = useCallback((index: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    topResizeRef.current = { index, startX: event.clientX, startProps: [...topProportions] };
    const onMove = (e: PointerEvent) => {
      if (!topResizeRef.current) return;
      const delta = e.clientX - topResizeRef.current.startX;
      const totalWidth = (topResizeRef.current.startProps.reduce((a, b) => a + b, 0)) || 1;
      const deltaFrac = delta / (window.innerWidth || 1000);
      const next = [...topResizeRef.current.startProps];
      const minFrac = 0.03;
      next[index] = Math.max(minFrac, topResizeRef.current.startProps[index] + deltaFrac);
      next[index + 1] = Math.max(minFrac, topResizeRef.current.startProps[index + 1] - deltaFrac);
      const sum = next.reduce((a, b) => a + b, 0);
      setTopProportions(next.map((v) => v / sum));
    };
    const onUp = () => {
      topResizeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [topProportions]);

  const startRowResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomRowHeight;
    const onMove = (moveEvent: PointerEvent) => setBottomRowHeight(Math.max(80, Math.min(520, startHeight - (moveEvent.clientY - startY))));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [bottomRowHeight]);

  // --- Panel controls ---

  function toggleCollapse(name: PanelName) {
    if (fullscreenPanel === name) setFullscreenPanel(null);
    setCollapsedPanels((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function toggleFullscreen(name: string) {
    setFullscreenPanel((current) => current === name ? null : name);
    if (collapsedPanels[name as PanelName]) {
      setCollapsedPanels((prev) => ({ ...prev, [name]: false }));
    }
  }

  function panelClass(name: string) {
    if (!fullscreenPanel) return "";
    return fullscreenPanel === name ? "fixed inset-0 z-50 bg-[#1e1e1e] flex flex-col" : "hidden";
  }

  // --- Collapse-aware flex proportions ---

  function topFlexGrow(index: number) {
    const panelNames: PanelName[] = ["explorer", "editor", "lead", "group"];
    const name = panelNames[index];
    if (collapsedPanels[name]) return 0;
    const active = panelNames.filter((n) => !collapsedPanels[n]);
    if (active.length === 0) return 1;
    const idx = active.indexOf(name);
    if (idx < 0) return 0;
    const activeProps = active.map((n) => topProportions[panelNames.indexOf(n)]);
    const sum = activeProps.reduce((a, b) => a + b, 0) || 1;
    return (activeProps[idx] / sum) * 100;
  }

  function bottomFlexGrow(index: number) {
    const panelNames: PanelName[] = ["terminal", "logs"];
    const name = panelNames[index];
    if (collapsedPanels[name]) return 0;
    const active = panelNames.filter((n) => !collapsedPanels[n]);
    if (active.length === 0) return 1;
    const idx = active.indexOf(name);
    if (idx < 0) return 0;
    const activeProps = active.map((n) => bottomProportions[panelNames.indexOf(n)]);
    const sum = activeProps.reduce((a, b) => a + b, 0) || 1;
    return (activeProps[idx] / sum) * 100;
  }

  // --- File tree operations ---

  function handleTreeContextMenu(e: React.MouseEvent, entry: WorkspaceTreeEntry) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }

  async function createTreeEntry(kind: "file" | "directory", parentPath = "") {
    if (!mainAgent) return;
    const defaultName = kind === "file" ? "new-file.ts" : "new-folder";
    const basePath = parentPath ? `${parentPath}/` : "";
    const path = `${basePath}${defaultName}`;
    const response = await fetch("/api/workspace/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorAgentId: mainAgent.id, path, kind }),
    });
    if (!response.ok) {
      setStatus(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "File operation failed");
      return;
    }
    await loadWorkspace(selectedFileId, locale);
    if (kind === "file") setFileStatuses((previous) => ({ ...previous, [path]: "new" }));
  }

  async function renameTreeEntry(filePath: string) {
    if (!mainAgent) return;
    const nextPath = window.prompt(locale === "ru" ? "Новое имя или путь" : "New name or path", filePath);
    if (!nextPath?.trim() || nextPath.trim() === filePath) return;
    const response = await fetch("/api/workspace/entry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorAgentId: mainAgent.id, path: filePath, nextPath: nextPath.trim() }),
    });
    if (!response.ok) {
      setStatus(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Rename failed");
      return;
    }
    await loadWorkspace(null, locale);
  }

  async function deleteTreeEntry(filePath: string) {
    if (!mainAgent || !window.confirm(`${locale === "ru" ? "Удалить" : "Delete"} ${filePath}?`)) return;
    const response = await fetch("/api/workspace/entry", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorAgentId: mainAgent.id, path: filePath }),
    });
    if (!response.ok) {
      setStatus(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Delete failed");
      return;
    }
    await loadWorkspace(null, locale);
  }

  // --- Collapse button component ---

  function CollapseButton({ name, label }: { name: PanelName; label: string }) {
    const collapsed = collapsedPanels[name];
    return (
      <button
        type="button"
        onClick={() => toggleCollapse(name)}
        title={collapsed ? t.expand : t.collapse}
        className="rounded px-1.5 py-0.5 text-[10px] text-[#9da3b2] hover:bg-[#3a3d41] hover:text-white"
      >
        {collapsed ? "▸" : "◂"}
      </button>
    );
  }

  function ExpandButton({ name }: { name: string }) {
    return (
      <button type="button" onClick={() => toggleFullscreen(name)} title={t.expand} className="rounded px-1.5 py-0.5 text-[10px] text-[#9da3b2] hover:bg-[#3a3d41] hover:text-white">
        □
      </button>
    );
  }

  function switchLocale(next: UiLocale) {
    setLocale(next);
    localStorage.setItem("ui-locale", next);
    setStatus(dict[next].synced);
  }

  async function pickWorkspaceFolder() {
    const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
    if (!bridge) {
      setStatus(t.connectFolder);
      return;
    }
    const directory = await bridge.selectDirectory();
    if (directory) {
      setWorkspaceRootDraft(directory);
      await connectWorkspaceFolder(directory);
    }
  }

  async function connectWorkspaceFolder(selectedDirectory?: string) {
    const directory = (selectedDirectory ?? workspaceRootDraft).trim();
    if (!directory) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/root", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; root?: string; imported?: number } | null;
      if (!res.ok) throw new Error(payload?.error ?? "Failed to connect folder");
      setWorkspaceRootDraft(payload?.root ?? directory);
      setStatus(`${t.folderConnected}: ${payload?.imported ?? 0} files`);
      await loadWorkspace(selectedFileId, locale);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to connect folder");
    } finally {
      setBusy(false);
    }
  }

  async function saveApiKeys() {
    if (!settingsDirty) return;
    setBusy(true);
    try {
      let apiKeysPayload = apiKeysDraft;
      let githubTokenPayload = githubTokenDraft;
      const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
      if (bridge?.safeStorage?.isAvailable && data?.settings?.vaultAvailable) {
        try {
          const available = await bridge.safeStorage.isAvailable();
          if (available) {
            const encrypted: Record<string, string> = {};
            for (const [provider, value] of Object.entries(apiKeysDraft)) {
              if (value && value.trim()) {
                encrypted[provider] = await bridge.safeStorage.encryptString(value);
              }
            }
            apiKeysPayload = encrypted;
            if (githubTokenDraft.trim()) {
              githubTokenPayload = await bridge.safeStorage.encryptString(githubTokenDraft);
            }
          }
        } catch {
          // Fall back to plaintext storage when encryption is unavailable.
        }
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKeys: apiKeysPayload,
          githubToken: githubTokenPayload,
          githubRepo: githubRepoDraft,
          githubAutoPush: githubAutoPushDraft,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Settings update failed");
      }
      await loadWorkspace(selectedFileId, locale);
      setApiKeysDraft({});
      setGithubTokenDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function saveAgentProfile(agentId: number) {
    const draft = agentDrafts[agentId];
    if (!draft) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, locale }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "error");
      }
      await loadWorkspace(selectedFileId, locale);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function createAgent() {
    if (!newAgent.name.trim()) return;

    setBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAgent, locale }),
      });
      if (!res.ok) throw new Error("error");
      setNewAgent(emptyNewAgent());
      await loadWorkspace(selectedFileId, locale);
    } finally {
      setBusy(false);
    }
  }

  async function setMainCoder(agentId: number) {
    setBusy(true);
    try {
      await fetch("/api/agents/main", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, locale }),
      });
      await loadWorkspace(selectedFileId, locale);
    } finally {
      setBusy(false);
    }
  }

  async function saveFile() {
    if (!selectedFile || !mainAgent) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${selectedFile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editorText, actorAgentId: mainAgent.id, locale }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "save error");
      }
      await loadWorkspace(selectedFile.id, locale);
      setFileStatuses((previous) => ({ ...previous, [selectedFile.path]: "saved" }));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackFile() {
    if (!selectedFile || !mainAgent) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/files/${selectedFile.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorAgentId: mainAgent.id, locale }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "rollback error");
      }
      await loadWorkspace(selectedFile.id, locale);
      setFileStatuses((previous) => ({ ...previous, [selectedFile.path]: "saved" }));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function pushToGithub() {
    setBusy(true);
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "github push error");
      }
      await loadWorkspace(selectedFileId, locale);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(channel: ChatChannel, message: string, duplicate = false, attachmentsOverride?: ChatAttachment[]) {
    const outgoingAttachments = attachmentsOverride ?? pendingAttachments;
    if (chatAbortRef.current || (!message.trim() && outgoingAttachments.length === 0)) return;

    const controller = new AbortController();
    chatAbortRef.current = controller;
    const optimisticContent = message.trim() || (locale === "ru" ? "[прикреплены материалы]" : "[materials attached]");
    const optimisticMetadata = outgoingAttachments.length > 0 ? { attachments: outgoingAttachments } : {};
    const optimisticIds: number[] = [];
    const addOptimisticMessage = (chatChannel: ChatChannel) => {
      const id = optimisticMessageIdRef.current;
      optimisticMessageIdRef.current -= 1;
      optimisticIds.push(id);
      return {
        id,
        chatChannel,
        senderType: "user",
        agentName: locale === "ru" ? "Пользователь" : "User",
        content: optimisticContent,
        metadata: optimisticMetadata,
        createdAt: new Date().toISOString(),
      } satisfies WorkspaceMessage;
    };

    const optimisticMessagesToAdd = [
      addOptimisticMessage(channel),
      ...(channel === "group" && duplicate ? [addOptimisticMessage("lead")] : []),
    ];
    setOptimisticMessages((previous) => [...previous, ...optimisticMessagesToAdd]);
    setRetryRequest(null);
    setChatRunning(true);
    setBusy(true);
    setStatus(t.sending);
    setStreamingMessages({});
    setPendingAttachments([]);
    setAttachmentLink("");
    if (channel === "lead") setLeadMessage("");
    if (channel === "group") setGroupMessage("");

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          message,
          locale,
          channel,
          duplicateToLead: duplicate,
          attachments: outgoingAttachments,
          projectContext: {
            activeFilePath: selectedFile?.path,
            activeFileContent: editorText,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Chat error");
      }
      if (!res.body) throw new Error("Chat stream is unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: Error | null = null;

      const consumeBlock = (block: string) => {
        if (!hasSseData(block)) return;

        const event = parseSseJson<ChatStreamEvent>(block);
        if (!event) {
          streamError ??= new Error(locale === "ru" ? "Получено некорректное событие от LLM" : "Received an invalid LLM stream event");
          return;
        }

        if (event.type === "error") {
          streamError = new Error(event.message ?? "Chat error");
          return;
        }
        if (event.type === "agent_start" && event.channel && event.identity) {
          const identity = event.identity;
          setStreamingMessages((previous) => ({
            ...previous,
            [identity.agentId]: {
              channel: event.channel as ChatChannel,
              identity,
              content: "",
              status: "streaming",
              startedAt: new Date().toISOString(),
            },
          }));
          return;
        }
        if (event.type === "delta" && event.channel && event.identity && typeof event.text === "string" && event.text) {
          const eventText = event.text;
          const eventChannel = event.channel as ChatChannel;
          const identity = event.identity;
          setStreamingMessages((previous) => {
            const current = previous[identity.agentId];
            return {
              ...previous,
              [identity.agentId]: appendStreamDelta(current, eventChannel, identity, eventText),
            };
          });
          return;
        }
        if (event.type === "agent_done" && event.identity) {
          const identity = event.identity;
          setStreamingMessages((previous) => {
            const current = previous[identity.agentId];
            return {
              ...previous,
              [identity.agentId]: finishStream(current, event.channel as ChatChannel, identity, event.content, "done"),
            };
          });
          return;
        }
        if (event.type === "agent_error" && event.identity) {
          const identity = event.identity;
          setStreamingMessages((previous) => {
            const current = previous[identity.agentId];
            return {
              ...previous,
              [identity.agentId]: finishStream(current, event.channel as ChatChannel, identity, "", "error", event.message, new Date().toISOString(), event.rateLimited ?? event.status === 429),
            };
          });
          setStatus(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let separator = buffer.search(/\r?\n\r?\n/);
        while (separator >= 0) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator).replace(/^\r?\n\r?\n/, "");
          consumeBlock(block);
          separator = buffer.search(/\r?\n\r?\n/);
        }

        if (done) break;
      }

      if (buffer.trim()) consumeBlock(buffer);
      if (streamError) throw streamError;

      await loadWorkspace(selectedFileId, locale);
      setOptimisticMessages((previous) => previous.filter((message) => !optimisticIds.includes(message.id)));
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const messageText = cancelled ? t.cancelled : error instanceof Error ? error.message : "Chat error";
      setOptimisticMessages((previous) => previous.map((chatMessage) => optimisticIds.includes(chatMessage.id) ? { ...chatMessage, status: cancelled ? "cancelled" : "error" } : chatMessage));
      setStreamingMessages((previous) => Object.fromEntries(Object.entries(previous).map(([id, streamMessage]) => [id,
        finishStream(streamMessage, streamMessage.channel, streamMessage.identity, "", cancelled ? "cancelled" : "error", cancelled ? undefined : messageText),
      ])));
      setRetryRequest({ channel, message, duplicate, attachments: outgoingAttachments, optimisticIds });
      setStatus(messageText);
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
      setChatRunning(false);
      setBusy(false);
    }
  }

  function stopChat() {
    chatAbortRef.current?.abort();
  }

  async function runTerminal(event: FormEvent) {
    event.preventDefault();
    if (!terminalCommand.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: terminalCommand, locale }),
      });
      setTerminalCommand("");
      await loadWorkspace(selectedFileId, locale);
    } finally {
      setBusy(false);
    }
  }

  async function importOwnFiles() {
    if (importFiles.length === 0) return;
    setBusy(true);
    try {
      const filesPayload: Array<{ path: string; content: string }> = [];
      for (const file of importFiles) {
        const text = await file.text();
        filesPayload.push({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, content: text });
      }

      const res = await fetch("/api/files/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesPayload, locale }),
      });

      if (!res.ok) throw new Error("import error");
      setImportFiles([]);
      await loadWorkspace(selectedFileId, locale);
    } finally {
      setBusy(false);
    }
  }

  function onPickImportFiles(event: ChangeEvent<HTMLInputElement>) {
    setImportFiles(Array.from(event.target.files ?? []));
  }

  function addLinkAttachment() {
    const url = attachmentLink.trim();
    if (!url) return;
    setPendingAttachments((prev) => [...prev, { type: "link", url }]);
    setAttachmentLink("");
  }

  function onPickImageAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (!url) return;
      setPendingAttachments((prev) => [...prev, { type: "image", url, name: file.name }]);
    };
    reader.readAsDataURL(file);
  }

  function renderAttachments(list: ChatAttachment[] | undefined) {
    if (!list || list.length === 0) return null;
    return (
      <div className="mt-2 space-y-2">
        {list?.map((att, index) =>
          att.type === "image" ? (
            <div key={`img-${index}`} className="rounded border border-[#3a3d41] p-2">
              {att.name ? <p className="mb-1 text-[11px] text-[#9da3b2]">{att.name}</p> : null}
              {att.url ? <img src={att.url} alt={att.name ?? "attachment"} className="max-h-44 rounded object-contain" /> : null}
            </div>
          ) : (
            <div key={`link-${index}`} className="rounded border border-[#3a3d41] bg-[#1e1e1e] p-2 text-xs">
              {att.url ? (
                <a href={att.url} target="_blank" rel="noreferrer" className="text-[#4fc1ff] underline">
                  {att.title || att.url}
                </a>
              ) : null}
              {att.previewText ? <p className="mt-1 text-[#c6ced8]">{att.previewText}</p> : null}
            </div>
          ),
        )}
      </div>
    );
  }

  function statusLabel(messageStatus: ChatMessageStatus | ChatStreamState["status"]) {
    if (messageStatus === "sending") return t.sending;
    if (messageStatus === "streaming") return t.streaming;
    if (messageStatus === "sent" || messageStatus === "done") return t.sent;
    if (messageStatus === "cancelled") return t.cancelled;
    return t.errorStatus;
  }

  function statusClass(messageStatus: ChatMessageStatus | ChatStreamState["status"]) {
    if (messageStatus === "error") return "text-[#f48771]";
    if (messageStatus === "cancelled") return "text-[#dcdcaa]";
    if (messageStatus === "sending" || messageStatus === "streaming") return "text-[#4fc1ff]";
    return "text-[#9cdcfe]";
  }

  async function copyMessage(messageId: number | string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId((current) => current === messageId ? null : current), 1500);
    } catch {
      setStatus(locale === "ru" ? "Не удалось скопировать сообщение" : "Failed to copy message");
    }
  }

  function renderMessageActions(messageId: number | string, content: string, canRetry = false, showCopy = true) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {showCopy ? (
          <button type="button" onClick={() => void copyMessage(messageId, content)} className="rounded bg-[#3a3d41] px-2 py-0.5 text-[#c6ced8] hover:bg-[#4b4e54]">
            {copiedMessageId === messageId ? t.copied : t.copy}
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            onClick={() => {
              if (!retryRequest) return;
              const request = retryRequest;
              setOptimisticMessages((previous) => previous.filter((message) => !request.optimisticIds.includes(message.id)));
              void sendChat(request.channel, request.message, request.duplicate, request.attachments);
            }}
            className="rounded bg-[#5a3c2b] px-2 py-0.5 text-[#f4c7a1] hover:bg-[#704936]"
          >
            {t.retry}
          </button>
        ) : null}
      </div>
    );
  }

  function renderStreamingMessages(channel: ChatChannel) {
    return liveMessages
      .filter((message) => message.channel === channel)
      .map((message) => (
        <article key={`stream-${message.identity.agentId}`} className="mr-auto w-fit max-w-[92%] rounded border border-[#007acc] bg-[#252526] p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[11px] text-[#4fc1ff]"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: agentColorForIdentity(message.identity) }} />{agentHeader(message.identity, message.identity.displayName)}</p>
            <span className={`text-[10px] ${statusClass(message.status)}`}>{statusLabel(message.status)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{message.content || "…"}</p>
          {message.error ? <p className="mt-1 text-xs text-[#f48771]">{message.error}</p> : null}
          {message.rateLimited ? <p className="mt-1 rounded bg-[#5a3c2b] px-2 py-1 text-xs text-[#f4c7a1]">{t.error429}</p> : null}
          {message.status === "error" && !message.rateLimited ? <p className="mt-1 rounded bg-[#3a2b2b] px-2 py-1 text-xs text-[#f4a1a1]">{t.errorDefault}</p> : null}
          {renderMessageActions(`stream-${message.identity.agentId}`, message.content, false)}
        </article>
      ));
  }

  // --- Collapsed panel strip ---

  function collapsedStrip(name: PanelName, label: string, vertical = true) {
    const collapsed = collapsedPanels[name];
    if (!collapsed) return null;
    if (vertical) {
      return (
        <div className="flex flex-col items-center justify-center gap-1 bg-[#252526]" style={{ width: COLLAPSED_SIDE }}>
          <button type="button" onClick={() => toggleCollapse(name)} title={t.expand} className="text-[10px] text-[#9da3b2] hover:text-white">
            ▸
          </button>
          <span className="text-[9px] text-[#9da3b2] [writing-mode:vertical-rl] select-none">{label}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-1 bg-[#252526]" style={{ height: COLLAPSED_BOTTOM }}>
        <button type="button" onClick={() => toggleCollapse(name)} title={t.expand} className="text-[10px] text-[#9da3b2] hover:text-white">
          ▴
        </button>
        <span className="text-[9px] text-[#9da3b2] select-none">{label}</span>
      </div>
    );
  }

  // Computed top flex grow values
  const topGrows = [topFlexGrow(0), topFlexGrow(1), topFlexGrow(2), topFlexGrow(3)];
  const bottomGrows = [bottomFlexGrow(0), bottomFlexGrow(1)];

  return (
    <main className="relative h-screen overflow-hidden bg-[#1e1e1e] pb-6 text-[#d4d4d4]">
      <header className="flex h-10 items-center justify-between border-b border-[#2d2d30] bg-[#252526] px-3">
        <div className="text-sm font-semibold">Multi-Agent Code Studio</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={pushToGithub} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white" disabled={busy}>
            {t.pushGithub}
          </button>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="rounded bg-gradient-to-r from-amber-400 to-yellow-400 px-3 py-1 text-xs font-bold text-black shadow-[0_0_12px_rgba(251,191,36,0.6)] transition-all hover:from-amber-300 hover:to-yellow-300 hover:shadow-[0_0_18px_rgba(251,191,36,0.9)]"
          >
            {t.donateBtn}
          </button>
          <button type="button" onClick={() => setOrchestratorOpen(true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">
            🤖 {locale === "ru" ? "Оркестратор" : "Orchestrator"}
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">
            ⚙️ {t.settings}
          </button>
        </div>
      </header>

      {/* Main content area: flex column, top flex area + resizer + bottom area */}
      <div className="flex flex-col" style={{ height: "calc(100% - 40px)" }}>
        {/* Top row: Tree | Editor | Lead Chat | Group Chat */}
        <div className="flex min-h-0" style={{ flex: "1 1 auto", height: `calc(100% - ${bottomRowHeight}px)` }}>
          {/* Explorer / File Tree */}
          <div className={`relative ${panelClass("explorer")}`} style={{ flex: collapsedPanels.explorer ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[0]} 1 0%`, minWidth: 0 }}>
            {collapsedStrip("explorer", t.explorer)}
            {!collapsedPanels.explorer && (
              <section className="panel h-full border-r border-[#2d2d30]">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.explorer}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => createTreeEntry("file")} title={t.newFile} className="rounded px-1.5 py-0.5 text-xs hover:bg-[#3a3d41]">📄</button>
                    <button type="button" onClick={() => createTreeEntry("directory")} title={t.newFolder} className="rounded px-1.5 py-0.5 text-xs hover:bg-[#3a3d41]">📁</button>
                    <CollapseButton name="explorer" label={t.explorer} />
                    <ExpandButton name="explorer" />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1">
                  {workspaceTreeEntries.map((entry) => {
                    const file = entry.kind === "file" ? data?.files.find((candidate) => candidate.path === entry.path) : null;
                    const fileStatus = fileStatuses[entry.path];
                    const isSelected = selectedFileId === file?.id;
                    return (
                      <div key={`${entry.kind}-${entry.path}`} className="group mb-0.5 flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={entry.kind === "directory"}
                          onClick={() => { void selectWorkspaceFile(entry); }}
                          onContextMenu={(e) => handleTreeContextMenu(e, entry)}
                          style={{ paddingLeft: `${8 + entry.path.split("/").length * 10}px` }}
                          className={`block min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${entry.kind === "directory" ? "text-[#9da3b2]" : isSelected ? "bg-[#37373d] text-white" : "hover:bg-[#2a2d2e]"}`}
                          title={entry.path}
                        >
                          <span className="mr-1 text-[#4fc1ff]">{entry.kind === "directory" ? "▾" : "◆"}</span>
                          <span className="truncate">{entry.path.split("/").pop() || entry.path}</span>
                          {entry.kind === "file" && fileStatus && fileStatus !== "saved" ? (
                            <span className={`ml-1 text-[10px] ${fileStatus === "modified" ? "text-amber-300" : "text-[#4fc1ff]"}`}>
                              {fileStatus === "modified" ? "●" : "＋"}
                            </span>
                          ) : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Column resizer 0->1 */}
          {!collapsedPanels.explorer && !collapsedPanels.editor && (
            <div className="z-10 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]" onPointerDown={(e) => startTopResize(0, e)} />
          )}

          {/* Editor */}
          <div className={`relative ${panelClass("editor")}`} style={{ flex: collapsedPanels.editor ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[1]} 1 0%`, minWidth: 0 }}>
            {collapsedStrip("editor", t.editor)}
            {!collapsedPanels.editor && (
              <section className="panel h-full border-r border-[#2d2d30]">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.editor} — {selectedFile?.path ?? t.noFile}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={rollbackFile} disabled={!selectedFile || !mainAgent || busy} className="rounded bg-[#5a3c2b] px-2 py-1 text-xs text-white disabled:opacity-60">
                      {t.rollback}
                    </button>
                    <button type="button" onClick={saveFile} disabled={!selectedFile || !mainAgent || busy || fileStatuses[selectedFile?.path ?? ""] !== "modified"} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">
                      {t.saveMain}
                    </button>
                    <CollapseButton name="editor" label={t.editor} />
                    <ExpandButton name="editor" />
                  </div>
                </div>
                <textarea value={editorText} onChange={(e) => {
                  setEditorText(e.target.value);
                  if (selectedFile) setFileStatuses((previous) => ({ ...previous, [selectedFile.path]: e.target.value === selectedFile.content ? "saved" : "modified" }));
                }} spellCheck={false} className="min-h-0 flex-1 resize-none bg-[#1e1e1e] p-3 font-mono text-sm outline-none" />
              </section>
            )}
          </div>

          {/* Column resizer 1->2 */}
          {!collapsedPanels.editor && !collapsedPanels.lead && (
            <div className="z-10 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]" onPointerDown={(e) => startTopResize(1, e)} />
          )}

          {/* Lead Chat */}
          <div className={`relative ${panelClass("lead")}`} style={{ flex: collapsedPanels.lead ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[2]} 1 0%`, minWidth: 0 }}>
            {collapsedStrip("lead", t.leadChat)}
            {!collapsedPanels.lead && (
              <section className="panel h-full border-r border-[#2d2d30]">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.leadChat}</span>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[10px] text-[#9da3b2]">Агентов: {data?.agents.length ?? 0} | Активны: {data?.agents.filter((agent) => agent.isActive).length ?? 0}</span>
                    <CollapseButton name="lead" label={t.leadChat} />
                    <ExpandButton name="lead" />
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {leadMessages?.map((msg) => (
                    <article key={msg.id} className={`w-fit max-w-[92%] rounded border p-2 text-sm ${msg.senderType === "user" ? "ml-auto border-[#007acc] bg-[#0e639c] text-white" : "mr-auto border-[#3a3d41] bg-[#252526]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] text-[#9da3b2]"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: messageColor(msg) }} />{messageHeader(msg)} · {new Date(msg.createdAt).toLocaleTimeString(locale)}</p>
                        {msg.status ? <span className={`text-[10px] ${statusClass(msg.status)}`}>{statusLabel(msg.status)}</span> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
                      {renderAttachments(msg.metadata?.attachments)}
                      {msg.senderType !== "user" && msg.senderType !== "system" ? renderMessageActions(msg.id, msg.content) : null}
                      {msg.status === "error" && retryRequest?.optimisticIds.includes(msg.id) ? renderMessageActions(`retry-${msg.id}`, "", true, false) : null}
                    </article>
                  ))}
                  {renderStreamingMessages("lead")}
                  <div ref={leadChatEndRef} aria-hidden="true" />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); void sendChat("lead", leadMessage); }} className="border-t border-[#2d2d30] p-3">
                  <div className="flex gap-2">
                    <input value={leadMessage} onChange={(e) => setLeadMessage(e.target.value)} disabled={chatRunning} className="w-full rounded border border-[#3a3d41] bg-[#252526] px-3 py-2 text-sm outline-none disabled:opacity-60" />
                    <button className="rounded bg-[#0e639c] px-3 py-2 text-sm text-white disabled:opacity-60" type="submit" disabled={chatRunning || (!leadMessage.trim() && pendingAttachments.length === 0)}>{t.send}</button>
                    {chatRunning ? <button className="rounded bg-[#a12828] px-3 py-2 text-sm text-white" type="button" onClick={stopChat}>{t.stop}</button> : null}
                  </div>
                </form>
              </section>
            )}
          </div>

          {/* Column resizer 2->3 */}
          {!collapsedPanels.lead && !collapsedPanels.group && (
            <div className="z-10 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]" onPointerDown={(e) => startTopResize(2, e)} />
          )}

          {/* Group Chat */}
          <div className={`relative ${panelClass("group")}`} style={{ flex: collapsedPanels.group ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[3]} 1 0%`, minWidth: 0 }}>
            {collapsedStrip("group", t.allChat)}
            {!collapsedPanels.group && (
              <section className="panel h-full">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.allChat}</span>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[10px] text-[#9da3b2]">Агентов: {data?.agents.length ?? 0} | Активны: {data?.agents.filter((agent) => agent.isActive).length ?? 0}</span>
                    <CollapseButton name="group" label={t.allChat} />
                    <ExpandButton name="group" />
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {groupMessages?.map((msg) => (
                    <article key={msg.id} className={`w-fit max-w-[92%] rounded border p-2 text-sm ${msg.senderType === "user" ? "ml-auto border-[#007acc] bg-[#0e639c] text-white" : "mr-auto border-[#3a3d41] bg-[#252526]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] text-[#9da3b2]"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: messageColor(msg) }} />{messageHeader(msg)} · {new Date(msg.createdAt).toLocaleTimeString(locale)}</p>
                        {msg.status ? <span className={`text-[10px] ${statusClass(msg.status)}`}>{statusLabel(msg.status)}</span> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
                      {renderAttachments(msg.metadata?.attachments)}
                      {msg.senderType !== "user" && msg.senderType !== "system" ? renderMessageActions(msg.id, msg.content) : null}
                      {msg.status === "error" && retryRequest?.optimisticIds.includes(msg.id) ? renderMessageActions(`retry-${msg.id}`, "", true, false) : null}
                    </article>
                  ))}
                  {renderStreamingMessages("group")}
                  <div ref={groupChatEndRef} aria-hidden="true" />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); void sendChat("group", groupMessage, duplicateToLead); }} className="border-t border-[#2d2d30] p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <input id="dup" type="checkbox" checked={duplicateToLead} onChange={(e) => setDuplicateToLead(e.target.checked)} />
                    <label htmlFor="dup">{t.duplicate}</label>
                  </div>
                  <div className="mb-2 flex gap-2">
                    <input value={attachmentLink} onChange={(e) => setAttachmentLink(e.target.value)} placeholder={t.attachLink} className="w-full rounded border border-[#3a3d41] bg-[#252526] px-2 py-1 text-xs" />
                    <button type="button" onClick={addLinkAttachment} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.addLink}</button>
                    <label className="cursor-pointer rounded bg-[#3a3d41] px-2 py-1 text-xs">
                      {t.attachImage}
                      <input type="file" accept="image/*" className="hidden" onChange={onPickImageAttachment} />
                    </label>
                  </div>
                  {pendingAttachments.length > 0 ? (
                    <div className="mb-2 rounded border border-[#3a3d41] bg-[#252526] p-2 text-xs">
                      {pendingAttachments?.map((att, i) => (
                        <div key={`${att.type}-${i}`}>{att.type === "link" ? att.url : att.name || "image"}</div>
                      ))}
                      <button type="button" className="mt-2 rounded bg-[#4b2f2f] px-2 py-1" onClick={() => setPendingAttachments([])}>
                        {t.clearAttach}
                      </button>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <input value={groupMessage} onChange={(e) => setGroupMessage(e.target.value)} disabled={chatRunning} className="w-full rounded border border-[#3a3d41] bg-[#252526] px-3 py-2 text-sm outline-none disabled:opacity-60" />
                    <button className="rounded bg-[#0e639c] px-3 py-2 text-sm text-white disabled:opacity-60" type="submit" disabled={chatRunning || (!groupMessage.trim() && pendingAttachments.length === 0)}>{t.send}</button>
                    {chatRunning ? <button className="rounded bg-[#a12828] px-3 py-2 text-sm text-white" type="button" onClick={stopChat}>{t.stop}</button> : null}
                  </div>
                </form>
              </section>
            )}
          </div>
        </div>

        {/* Horizontal resizer between top and bottom */}
        <div className="z-10 h-1 cursor-row-resize bg-transparent hover:bg-[#007acc]" onPointerDown={startRowResize} />

        {/* Bottom row: Terminal | Logs */}
        <div className="flex border-t border-[#2d2d30]" style={{ height: `${bottomRowHeight}px`, minHeight: collapsedPanels.terminal && collapsedPanels.logs ? `${COLLAPSED_BOTTOM}px` : "auto" }}>
          {/* Terminal */}
          <div className={`relative ${panelClass("terminal")}`} style={{ flex: collapsedPanels.terminal ? `0 0 ${COLLAPSED_BOTTOM}px` : `${bottomGrows[0]} 1 0%`, minWidth: 0 }}>
            {collapsedStrip("terminal", t.terminal, false)}
            {!collapsedPanels.terminal && (
              <section className="panel h-full border-r border-[#2d2d30]">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.terminal}</span>
                  <div className="flex items-center gap-0.5">
                    <CollapseButton name="terminal" label={t.terminal} />
                    <ExpandButton name="terminal" />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#111214] p-3 font-mono text-xs">
                  {data?.terminal?.map((entry) => (
                    <div key={entry.id} className="mb-3">
                      <div className="text-[#4fc1ff]">$ {entry.command}</div>
                      <pre className="whitespace-pre-wrap">{entry.output}</pre>
                    </div>
                  ))}
                </div>
                <form onSubmit={runTerminal} className="border-t border-[#2d2d30] p-3">
                  <input value={terminalCommand} onChange={(e) => setTerminalCommand(e.target.value)} className="w-full rounded border border-[#3a3d41] bg-[#252526] px-3 py-2 text-xs outline-none" />
                </form>
              </section>
            )}
          </div>

          {/* Logs / System Events */}
          <div className={`relative ${panelClass("logs")}`} style={{ flex: collapsedPanels.logs ? `0 0 ${COLLAPSED_BOTTOM}px` : `${bottomGrows[1]} 1 0%`, minWidth: 0 }}>
            {collapsedStrip("logs", t.logsTitle, false)}
            {!collapsedPanels.logs && (
              <section className="panel h-full">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.logsTitle}</span>
                  <div className="flex items-center gap-0.5">
                    <CollapseButton name="logs" label={t.logsTitle} />
                    <ExpandButton name="logs" />
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-xs">
                  {data?.systemEvents?.map((event) => (
                    <article key={`event-${event.id}`} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                      <p className="text-[10px] text-[#9da3b2]">{event.source} · {new Date(event.createdAt).toLocaleTimeString(locale)}</p>
                      <p>{event.message}</p>
                      {event.details ? <pre className="mt-1 whitespace-pre-wrap text-[10px] text-[#9da3b2]">{event.details}</pre> : null}
                    </article>
                  ))}
                  {data?.findings?.map((finding) => (
                    <article key={finding.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                      <p className="text-[#9da3b2]">[{finding.severity.toUpperCase()}] {finding.filePath}{finding.line ? `:${finding.line}` : ""}</p>
                      <p>{finding.message}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Context menu for file tree */}
      {contextMenu ? (
        <div
          className="context-menu fixed z-50 min-w-[160px] rounded border border-[#3a3d41] bg-[#252526] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
            onClick={() => { createTreeEntry("file", contextMenu.entry.kind === "directory" ? contextMenu.entry.path : contextMenu.entry.path.split("/").slice(0, -1).join("/")); setContextMenu(null); }}
          >
            📄 {t.newFile}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
            onClick={() => { createTreeEntry("directory", contextMenu.entry.kind === "directory" ? contextMenu.entry.path : contextMenu.entry.path.split("/").slice(0, -1).join("/")); setContextMenu(null); }}
          >
            📁 {t.newFolder}
          </button>
          <div className="my-1 border-t border-[#3a3d41]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
            onClick={() => { renameTreeEntry(contextMenu.entry.path); setContextMenu(null); }}
          >
            ✏️ {t.rename}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#f48771] hover:bg-[#37373d]"
            onClick={() => { deleteTreeEntry(contextMenu.entry.path); setContextMenu(null); }}
          >
            🗑️ {t.delete}
          </button>
        </div>
      ) : null}

      {/* Settings drawer */}
      <aside className={`absolute inset-y-0 right-0 z-30 flex h-full min-h-0 w-[460px] flex-col border-l border-[#2d2d30] bg-[#1b1b1c] transition-transform ${settingsOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="panel-header flex items-center justify-between">
          <span className="flex items-center gap-2">{t.settings}{Object.entries(agentDrafts).some(([agentId, draft]) => {
            const agent = data?.agents.find((candidate) => candidate.id === Number(agentId));
            return agent ? isAgentDraftDirty(agent, draft) : false;
          }) ? <span className="text-[10px] text-amber-300">{t.unsaved}</span> : null}</span>
          <button type="button" onClick={() => setSettingsOpen(false)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.close}</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-10">
          <section className="mb-5 rounded border border-[#3a3d41] bg-[#252526] p-2">
            <h3 className="mb-2 text-xs uppercase text-[#9da3b2]">{t.projectFolder}</h3>
            <input
              value={workspaceRootDraft}
              onChange={(e) => setWorkspaceRootDraft(e.target.value)}
              placeholder={t.folderPath}
              className="mb-2 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => void connectWorkspaceFolder()} disabled={busy} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:opacity-60">
                {t.connectFolder}
              </button>
              <button type="button" onClick={() => void pickWorkspaceFolder()} disabled={busy} className="rounded bg-[#3a3d41] px-3 py-1 text-xs disabled:opacity-60">
                {t.browseFolder}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[#9da3b2]">{workspaceRootDraft || t.noFile}</p>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-xs uppercase text-[#9da3b2]">{t.lang}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => switchLocale("ru")} className={`rounded px-2 py-1 text-sm ${locale === "ru" ? "bg-[#007acc]" : "bg-[#2d2d30]"}`}>🇷🇺</button>
              <button type="button" onClick={() => switchLocale("en")} className={`rounded px-2 py-1 text-sm ${locale === "en" ? "bg-[#007acc]" : "bg-[#2d2d30]"}`}>🇺🇸</button>
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-xs uppercase text-[#9da3b2]">{t.importCode}</h3>
            <p className="mb-2 text-xs text-[#9da3b2]">{t.importHint}</p>
            <input type="file" multiple onChange={onPickImportFiles} className="mb-2 block w-full text-xs" />
            <button type="button" onClick={importOwnFiles} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white">{t.importBtn}</button>
          </section>

          <section className="mb-5">
            <button type="button" onClick={() => setProvidersOpen((open) => !open)} className="mb-2 flex w-full items-center justify-between text-left text-xs uppercase text-[#9da3b2]"><span>{t?.apiKeys}</span><span className="text-sm">{providersOpen ? "▼" : "▶"}</span></button>
            {providersOpen ? <>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="mb-2 inline-block text-xs text-[#4fc1ff] underline">
              {t.freeOpenRouter}
            </a>
            <div className="space-y-3">
              {PROVIDER_PRESETS.filter((p) => p.id !== "custom" && p.id !== "mock")?.map((provider) => (
                <div key={provider.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                  <p className="text-xs font-semibold text-white">{provider.label}</p>
                  <p className="text-[11px] text-[#9da3b2]">{t.baseUrl}: {provider.baseUrl}</p>
                  <p className="text-[11px] text-[#9da3b2]">{t.defaultModel}: {provider.defaultModel}</p>
                  <input
                    value={apiKeysDraft[provider.id] ?? ""}
                    onChange={(e) => setApiKeysDraft((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                    type="password"
                    className="mt-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                    placeholder={`${provider.label} API key`}
                  />
                </div>
              ))}
            </div>

            <div className="mt-3 rounded border border-[#3a3d41] bg-[#252526] p-2">
              <p className="mb-2 text-xs font-semibold text-white">{t.github}</p>
              <label className="mb-1 block text-[11px] text-[#9da3b2]">
                {t?.githubToken}
                <input
                  value={githubTokenDraft}
                  onChange={(e) => setGithubTokenDraft(e.target.value)}
                  type="password"
                  className="mt-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                />
              </label>
              <label className="mb-1 block text-[11px] text-[#9da3b2]">
                {t?.githubRepo}
                <input
                  value={githubRepoDraft}
                  onChange={(e) => setGithubRepoDraft(e.target.value)}
                  className="mt-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                  placeholder="username/repository"
                />
              </label>
              <label className="mt-2 flex items-center gap-2 text-xs text-[#c6ced8]">
                <input
                  type="checkbox"
                  checked={githubAutoPushDraft}
                  onChange={(e) => setGithubAutoPushDraft(e.target.checked)}
                />
                {t.githubAutoPush}
              </label>
            </div>

            <button type="button" onClick={saveApiKeys} disabled={busy || !settingsDirty} className="mt-2 rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">{t.saveKeys}</button>
            </> : null}
          </section>

          <section>
            <button type="button" onClick={() => setAgentsOpen((open) => !open)} className="mb-2 flex w-full items-center justify-between text-left text-xs uppercase text-[#9da3b2]"><span>{t.agents}</span><span className="text-sm">{agentsOpen ? "▼" : "▶"}</span></button>
            {agentsOpen ? <div className="space-y-2">
              {sortAgents(data?.agents ?? [])?.map((agent) => {
                const draft =
                  agentDrafts[agent.id] ??
                  ({
                    provider: agent.provider,
                    baseUrl: agent.baseUrl,
                    model: agent.model,
                    role: agent.role,
                    description: agent.description,
                    skill: agent.skill,
                    systemPrompt: agent.systemPrompt,
                    color: agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff",
                    manualModel: false,
                  } as AgentDraft);

                const isMain = agent.role === "main";
                const draftDirty = isAgentDraftDirty(agent, draft);

                return (
                  <article key={agent.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-[#555]" style={{ backgroundColor: draft.color || ROLE_COLORS[agent.role] || "#4fc1ff" }} />
                        <div>
                          <span className="text-sm">{agent.name}</span>
                          <p className="text-[10px] text-[#4fc1ff]">{providerModelLabel(draft.provider, draft.model)}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#9da3b2]">{draftDirty ? t.unsaved : roleLabel(agent.role)}</span>
                    </div>

                    <select
                      value={draft.provider}
                      onChange={(e) => {
                        const preset = getProviderPreset(e.target.value);
                        setAgentDrafts((prev) => ({
                          ...prev,
                          [agent.id]: { ...draft, provider: preset.id, baseUrl: preset.baseUrl, model: preset.defaultModel, manualModel: false },
                        }));
                        void fetchModels(preset.id, preset.baseUrl, apiKeysDraft[preset.id]);
                      }}
                      className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                    >
                      {PROVIDER_PRESETS?.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>

                    <input value={draft.baseUrl} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, baseUrl: e.target.value } }))} placeholder={t.baseUrl} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />

                    <div className="mb-1 flex gap-1">
                      <select
                        value={draft.manualModel ? "__manual__" : draft.model}
                        onChange={(e) => {
                          if (e.target.value === "__manual__") {
                            setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, manualModel: true } }));
                          } else {
                            setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, model: e.target.value, manualModel: false } }));
                          }
                        }}
                        className="w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                      >
                        {(modelOptions[draft.provider] ?? getProviderPreset(draft.provider).fallbackModels)?.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                        {draft.model && !(modelOptions[draft.provider] ?? []).includes(draft.model) ? <option value={draft.model}>{draft.model}</option> : null}
                        <option value="__manual__">{t.manualModel}</option>
                      </select>
                      <button type="button" onClick={() => fetchModels(draft.provider, draft.baseUrl, apiKeysDraft[draft.provider], true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">
                        {t.loadModels}
                      </button>
                    </div>

                    {draft.manualModel ? <input value={draft.model} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, model: e.target.value } }))} placeholder={t.model} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" /> : null}

                    <select value={draft.role} onChange={(e) => {
                      const newRole = e.target.value;
                      const newColor = ROLE_COLORS[newRole] ?? "#4fc1ff";
                      setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, role: newRole, color: draft.color === (ROLE_COLORS[draft.role] ?? "") ? newColor : draft.color } }));
                    }} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs">
                      {roleOptions?.map((role) => <option key={role} value={role}>{roleLabel(role)} ({role})</option>)}
                    </select>

                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10px] text-[#9da3b2]">Цвет:</span>
                      <input type="color" value={draft.color} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, color: e.target.value } }))} className="h-6 w-8 cursor-pointer rounded border border-[#3a3d41] bg-[#1e1e1e]" />
                    </div>

                    <input value={draft.description} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, description: e.target.value } }))} placeholder={t.profile} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                    <textarea value={draft.skill} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, skill: e.target.value } }))} placeholder={t.skill} className="mb-1 min-h-10 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                    <textarea value={draft.systemPrompt} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, systemPrompt: e.target.value } }))} placeholder={t.prompt} className="mb-1 min-h-10 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                    <div className="flex gap-2">
                      {!isMain ? <button type="button" onClick={() => setMainCoder(agent.id)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.setMain}</button> : null}
                      <button type="button" onClick={() => saveAgentProfile(agent.id)} disabled={busy || !draftDirty} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">{t.saveProfile}</button>
                    </div>
                  </article>
                );
              })}

              {/* Add agent button / form */}
              {!showAddAgent ? (
                <button type="button" onClick={() => { setShowAddAgent(true); setAddAgentMode(null); setNewAgent(emptyNewAgent()); }} className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-[#3a3d41] bg-[#1e1e1e] px-3 py-2 text-xs text-[#9da3b2] hover:border-[#4fc1ff] hover:text-white">
                  + {locale === "ru" ? "Добавить агента" : "Add agent"}
                </button>
              ) : (
                <article className="rounded border border-[#007acc] bg-[#1b1b1c] p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-[#9da3b2]">{addAgentMode === "template" ? (locale === "ru" ? "Новый агент (шаблон)" : "New agent (template)") : addAgentMode === "custom" ? (locale === "ru" ? "Новый агент (свой)" : "New agent (custom)") : locale === "ru" ? "Выберите вариант" : "Choose option"}</span>
                    <button type="button" onClick={() => setShowAddAgent(false)} className="rounded px-1 py-0.5 text-[10px] text-[#9da3b2] hover:bg-[#3a3d41]">✕</button>
                  </div>

                  {addAgentMode === null ? (
                    <div className="space-y-1">
                      <p className="mb-2 text-[10px] text-[#9da3b2]">{locale === "ru" ? "Быстрый старт — готовые роли агентов:" : "Quick start — preset agent roles:"}</p>
                      {roleOptions.map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                            setNewAgent(emptyNewAgent({ role, color: ROLE_COLORS[role] ?? "#4fc1ff" }));
                            setAddAgentMode("template");
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
                        >
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ROLE_COLORS[role] ?? "#4fc1ff" }} />
                          <span className="font-medium">{roleLabel(role)}</span>
                          <span className="text-[10px] text-[#9da3b2]">({role})</span>
                        </button>
                      ))}
                      <div className="border-t border-[#3a3d41] pt-1">
                        <button
                          type="button"
                          onClick={() => { setNewAgent(emptyNewAgent()); setAddAgentMode("custom"); }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
                        >
                          ✨ {locale === "ru" ? "Создать с нуля" : "Create from scratch"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input value={newAgent.name} onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))} placeholder={t.name} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                      <label className="mb-1 block text-[11px] text-[#9da3b2]">
                        {t.provider}
                        <select
                          value={newAgent.provider}
                          onChange={(e) => {
                            const preset = getProviderPreset(e.target.value);
                            setNewAgent((p) => ({ ...p, provider: preset.id, baseUrl: preset.baseUrl, model: preset.defaultModel, manualModel: false }));
                            void fetchModels(preset.id, preset.baseUrl, apiKeysDraft[preset.id]);
                          }}
                          className="mt-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                        >
                          {PROVIDER_PRESETS?.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                          ))}
                        </select>
                      </label>
                      <input value={newAgent.baseUrl} onChange={(e) => setNewAgent((p) => ({ ...p, baseUrl: e.target.value }))} placeholder={t.baseUrl} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                      <div className="mb-1 flex gap-1">
                        <select
                          value={newAgent.manualModel ? "__manual__" : newAgent.model}
                          onChange={(e) => {
                            if (e.target.value === "__manual__") {
                              setNewAgent((p) => ({ ...p, manualModel: true }));
                            } else {
                              setNewAgent((p) => ({ ...p, model: e.target.value, manualModel: false }));
                            }
                          }}
                          className="w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs"
                        >
                          {(modelOptions[newAgent.provider] ?? getProviderPreset(newAgent.provider).fallbackModels)?.map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                          {newAgent.model && !(modelOptions[newAgent.provider] ?? []).includes(newAgent.model) ? <option value={newAgent.model}>{newAgent.model}</option> : null}
                          <option value="__manual__">{t.manualModel}</option>
                        </select>
                        <button type="button" onClick={() => fetchModels(newAgent.provider, newAgent.baseUrl, apiKeysDraft[newAgent.provider], true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">
                          {t.loadModels}
                        </button>
                      </div>
                      {newAgent.manualModel ? <input value={newAgent.model} onChange={(e) => setNewAgent((p) => ({ ...p, model: e.target.value }))} placeholder={t.model} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" /> : null}
                      <select value={newAgent.role} onChange={(e) => {
                        const newRole = e.target.value;
                        setNewAgent((p) => ({ ...p, role: newRole, color: ROLE_COLORS[newRole] ?? "#4fc1ff" }));
                      }} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs">
                        {roleOptions?.map((role) => <option key={role} value={role}>{roleLabel(role)} ({role})</option>)}
                      </select>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] text-[#9da3b2]">Цвет:</span>
                        <input type="color" value={newAgent.color} onChange={(e) => setNewAgent((p) => ({ ...p, color: e.target.value }))} className="h-6 w-8 cursor-pointer rounded border border-[#3a3d41] bg-[#1e1e1e]" />
                      </div>
                      <input value={newAgent.description} onChange={(e) => setNewAgent((p) => ({ ...p, description: e.target.value }))} placeholder={t.profile} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                      <textarea value={newAgent.skill} onChange={(e) => setNewAgent((p) => ({ ...p, skill: e.target.value }))} placeholder={t.skill} className="mb-1 min-h-10 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                      <textarea value={newAgent.systemPrompt} onChange={(e) => setNewAgent((p) => ({ ...p, systemPrompt: e.target.value }))} placeholder={t.prompt} className="mb-1 min-h-10 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                      <button type="button" onClick={createAgent} disabled={busy || !newAgentDirty} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">{t.createAgent}</button>
                    </>
                  )}
                </article>
              )}
            </div> : null}
          </section>
        </div>
      </aside>

      {settingsOpen ? <button type="button" onClick={() => setSettingsOpen(false)} className="absolute inset-0 z-20 bg-black/40" aria-label={t.close} /> : null}

      {supportOpen ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <button type="button" onClick={() => setSupportOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label={t.close} />
          <article className="relative z-10 w-[92%] max-w-[460px] rounded-xl border border-[#3a3d41] bg-[#252526] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">{t.supportTitle}</h2>
              <button type="button" onClick={() => setSupportOpen(false)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs hover:bg-[#4b4e54]">
                {t.close}
              </button>
            </header>

            <div className="space-y-4">
              <section className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 p-4">
                <h3 className="mb-1 text-sm font-semibold text-amber-300">{t.supportDonateTitle}</h3>
                <p className="mb-3 text-xs leading-relaxed text-[#c6ced8]">{t.supportDonateDesc}</p>
                <a
                  href="https://tbank.ru/cf/3TLJMeGjBSC"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-400 px-4 py-2.5 text-sm font-bold text-black shadow-[0_0_18px_rgba(251,191,36,0.6)] transition hover:from-amber-300 hover:to-yellow-300 hover:shadow-[0_0_26px_rgba(251,191,36,0.9)]"
                >
                  ❤️ {t.supportProjectBtn}
                </a>
              </section>

              <section className="rounded-lg border border-[#3a3d41] bg-[#1e1e1e] p-4">
                <h3 className="mb-1 text-sm font-semibold text-white">{t.emailTitle}</h3>
                <p className="mb-2 text-xs text-[#9da3b2]">{t.emailDesc}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#9da3b2]">{t.emailLabel}:</span>
                  <a href="mailto:tsarskiysoft@gmail.com" className="rounded bg-[#2d2d30] px-2 py-1 text-xs font-medium text-[#4fc1ff] hover:underline">
                    tsarskiysoft@gmail.com
                  </a>
                </div>
              </section>

              <p className="text-center text-[11px] text-[#9da3b2]">{t.supportThanks}</p>
            </div>
          </article>
        </div>
      ) : null}

      <OrchestratorPanel open={orchestratorOpen} onClose={() => setOrchestratorOpen(false)} locale={locale} activeFilePath={selectedFile?.path} activeFileContent={editorText} />

      <div className="status-bar">
        <span>{status}</span>
        <span>{busy ? t.busy : t.ready}</span>
      </div>
    </main>
  );
}