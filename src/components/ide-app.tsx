"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  | { type: "agent_error"; channel: ChatChannel; identity: AgentIdentity; message: string }
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
  isActive: boolean;
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
  },
};

const emptyNewAgent = (): NewAgentDraft => {
  const preset = getProviderPreset("openrouter");
  return {
    name: "",
    provider: preset.id,
    baseUrl: preset.baseUrl,
    model: preset.defaultModel,
    role: "advisor",
    description: "",
    skill: "",
    systemPrompt: "",
    manualModel: false,
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

  const selectedFile = useMemo(() => data?.files.find((f) => f.id === selectedFileId) ?? null, [data, selectedFileId]);
  const mainAgent = useMemo(() => data?.agents.find((a) => a.role === "main") ?? null, [data?.agents]);
  const leadMessages = useMemo(
    () => [...(data?.messages.filter((m) => m.chatChannel === "lead") ?? []), ...optimisticMessages.filter((m) => m.chatChannel === "lead")],
    [data?.messages, optimisticMessages],
  );
  const groupMessages = useMemo(
    () => [...(data?.messages.filter((m) => m.chatChannel === "group") ?? []), ...optimisticMessages.filter((m) => m.chatChannel === "group")],
    [data?.messages, optimisticMessages],
  );
  const liveMessages = useMemo(() => Object.values(streamingMessages), [streamingMessages]);
  const liveMessagesVersion = liveMessages.map((message) => `${message.identity.agentId}:${message.content.length}:${message.status}`).join("|");

  useEffect(() => {
    leadChatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    groupChatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [leadMessages.length, groupMessages.length, liveMessagesVersion]);

  useEffect(() => () => chatAbortRef.current?.abort(), []);

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
    return agent.provider !== draft.provider || agent.baseUrl !== draft.baseUrl || agent.model !== draft.model || agent.role !== draft.role || agent.description !== draft.description || agent.skill !== draft.skill || agent.systemPrompt !== draft.systemPrompt;
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
          manualModel: false,
        },
      ]),
    );
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
    const res = await fetch("/api/workspace", { cache: "no-store" });
    if (!res.ok) throw new Error(dict[l].errLoad);

    const payload = (await res.json()) as WorkspaceData;
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
              [identity.agentId]: finishStream(current, event.channel as ChatChannel, identity, "", "error", event.message),
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
        <article key={`stream-${message.identity.agentId}`} className="rounded border border-[#007acc] bg-[#252526] p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[#4fc1ff]">{agentHeader(message.identity, message.identity.displayName)}</p>
            <span className={`text-[10px] ${statusClass(message.status)}`}>{statusLabel(message.status)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{message.content || "…"}</p>
          {message.error ? <p className="mt-1 text-xs text-[#f48771]">{message.error}</p> : null}
          {renderMessageActions(`stream-${message.identity.agentId}`, message.content, false)}
        </article>
      ));
  }

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

      <div className="grid h-[calc(100%-40px)] grid-cols-[260px_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] grid-rows-[minmax(0,1fr)_220px]">
        <section className="panel row-span-2 border-r border-[#2d2d30]">
          <div className="panel-header">{t.explorer}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {data?.files?.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => {
                  setSelectedFileId(file.id);
                  setEditorText(file.content);
                }}
                className={`mb-1 block w-full rounded px-2 py-1 text-left text-sm ${selectedFileId === file.id ? "bg-[#37373d] text-white" : "hover:bg-[#2a2d2e]"}`}
              >
                {file.path}
              </button>
            ))}
          </div>
        </section>

        <section className="panel border-r border-[#2d2d30]">
          <div className="panel-header flex items-center justify-between">
            <span>{t.editor} — {selectedFile?.path ?? t.noFile}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={rollbackFile} disabled={!selectedFile || !mainAgent || busy} className="rounded bg-[#5a3c2b] px-2 py-1 text-xs text-white disabled:opacity-60">
                {t.rollback}
              </button>
              <button type="button" onClick={saveFile} disabled={!selectedFile || !mainAgent || busy} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white disabled:opacity-60">
                {t.saveMain}
              </button>
            </div>
          </div>
          <textarea value={editorText} onChange={(e) => setEditorText(e.target.value)} spellCheck={false} className="min-h-0 flex-1 resize-none bg-[#1e1e1e] p-3 font-mono text-sm outline-none" />
        </section>

        <section className="panel row-span-2 border-r border-[#2d2d30]">
          <div className="panel-header">{t.leadChat}</div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {leadMessages?.map((msg) => (
              <article key={msg.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#9da3b2]">{messageHeader(msg)} · {new Date(msg.createdAt).toLocaleTimeString(locale)}</p>
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

        <section className="panel">
          <div className="panel-header">{t.allChat}</div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {groupMessages?.map((msg) => (
              <article key={msg.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#9da3b2]">{messageHeader(msg)} · {new Date(msg.createdAt).toLocaleTimeString(locale)}</p>
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

        <section className="panel border-r border-t border-[#2d2d30]">
          <div className="panel-header">{t.terminal}</div>
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

        <section className="panel border-t border-[#2d2d30]">
          <div className="panel-header">{t.checks}</div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-xs">
            {data?.findings?.map((finding) => (
              <article key={finding.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                <p className="text-[#9da3b2]">[{finding.severity.toUpperCase()}] {finding.filePath}{finding.line ? `:${finding.line}` : ""}</p>
                <p>{finding.message}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

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
            <h3 className="mb-2 text-xs uppercase text-[#9da3b2]">{t?.apiKeys}</h3>
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

            <button type="button" onClick={saveApiKeys} className="mt-2 rounded bg-[#0e639c] px-3 py-1 text-xs text-white">{t.saveKeys}</button>
          </section>

          <section className="mb-5 rounded border border-[#3a3d41] bg-[#252526] p-2">
            <h3 className="mb-2 text-xs uppercase text-[#9da3b2]">{t.createAgent}</h3>
            <p className="mb-2 text-[11px] text-[#9da3b2]">{t.mockHint}</p>
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
            <select value={newAgent.role} onChange={(e) => setNewAgent((p) => ({ ...p, role: e.target.value }))} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs">
              {roleOptions?.map((role) => <option key={role} value={role}>{roleLabel(role)} ({role})</option>)}
            </select>
            <input value={newAgent.description} onChange={(e) => setNewAgent((p) => ({ ...p, description: e.target.value }))} placeholder={t.profile} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
            <textarea value={newAgent.skill} onChange={(e) => setNewAgent((p) => ({ ...p, skill: e.target.value }))} placeholder={t.skill} className="mb-1 min-h-12 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
            <textarea value={newAgent.systemPrompt} onChange={(e) => setNewAgent((p) => ({ ...p, systemPrompt: e.target.value }))} placeholder={t.prompt} className="mb-1 min-h-12 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
            <button type="button" onClick={createAgent} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white">{t.createAgent}</button>
          </section>

          <section>
            <h3 className="mb-2 text-xs uppercase text-[#9da3b2]">{t.agents}</h3>
            <div className="space-y-2">
              {data?.agents?.map((agent) => {
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
                    manualModel: false,
                  } as AgentDraft);

                const isMain = agent.role === "main";
                const draftDirty = isAgentDraftDirty(agent, draft);

                return (
                  <article key={agent.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <div>
                        <span className="text-sm">{agent.name}</span>
                        <p className="text-[10px] text-[#4fc1ff]">{providerModelLabel(draft.provider, draft.model)}</p>
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

                    <select value={draft.role} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, role: e.target.value } }))} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs">
                      {roleOptions?.map((role) => <option key={role} value={role}>{roleLabel(role)} ({role})</option>)}
                    </select>
                    <input value={draft.description} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, description: e.target.value } }))} placeholder={t.profile} className="mb-1 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                    <textarea value={draft.skill} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, skill: e.target.value } }))} placeholder={t.skill} className="mb-1 min-h-10 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                    <textarea value={draft.systemPrompt} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, systemPrompt: e.target.value } }))} placeholder={t.prompt} className="mb-1 min-h-10 w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-1 text-xs" />
                    <div className="flex gap-2">
                      {!isMain ? <button type="button" onClick={() => setMainCoder(agent.id)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.setMain}</button> : null}
                      <button type="button" onClick={() => saveAgentProfile(agent.id)} disabled={busy || !draftDirty} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white disabled:opacity-60">{t.saveProfile}</button>
                    </div>
                  </article>
                );
              })}
            </div>
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

      <OrchestratorPanel open={orchestratorOpen} onClose={() => setOrchestratorOpen(false)} locale={locale} />

      <div className="status-bar">
        <span>{status}</span>
        <span>{busy ? t.busy : t.ready}</span>
      </div>
    </main>
  );
}
