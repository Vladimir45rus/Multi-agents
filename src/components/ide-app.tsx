"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from "react";
import { PROVIDER_PRESETS, getProviderPreset, normalizeProviderModel } from "@/lib/providers";
import { OrchestratorPanel } from "@/components/orchestrator-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { hasSseData, parseSseJson } from "@/lib/sse-json";
import type { AgentIdentity } from "@/lib/agent-identity";
import { appendStreamDelta, finishStream, type ChatStreamState } from "@/lib/chat-state";
import { sanitizeChatContent } from "@/lib/chat-display";
import { PreviewModal } from "@/components/preview-modal";

const CodeEditor = lazy(() => import("@/components/code-editor"));

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
type GroupRoleFilter = "all" | "tester" | "uiux" | "architect";

type ChatAttachment = {
  type: "image" | "link";
  url?: string;
  name?: string;
  title?: string;
  previewText?: string;
};

type MentionState = {
  channel: ChatChannel;
  query: string;
  start: number;
  cursor: number;
};

const TASK_TEMPLATES = [
  {
    id: "refactor",
    label: "Р РµС„Р°РєС‚РѕСЂРёРЅРі РєРѕРґР°",
    prompt: "Р’С‹РїРѕР»РЅРё СЂРµС„Р°РєС‚РѕСЂРёРЅРі РєРѕРґР°: СЃРЅР°С‡Р°Р»Р° РёР·СѓС‡Рё СЃРІСЏР·Р°РЅРЅС‹Рµ С„Р°Р№Р»С‹, РЅР°Р№РґРё РґСѓР±Р»РёСЂРѕРІР°РЅРёРµ Рё СЃР»Р°Р±С‹Рµ РјРµСЃС‚Р°, РІРЅРµСЃРё РјРёРЅРёРјР°Р»СЊРЅС‹Рµ Р±РµР·РѕРїР°СЃРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ Рё РїСЂРѕРІРµСЂСЊ typecheck Рё С‚РµСЃС‚С‹.",
  },
  {
    id: "tests",
    label: "РџРѕРєСЂС‹С‚РёРµ С‚РµСЃС‚Р°РјРё",
    prompt: "РЈРІРµР»РёС‡СЊ РїРѕРєСЂС‹С‚РёРµ С‚РµСЃС‚Р°РјРё: РёР·СѓС‡Рё С‚РµРєСѓС‰РёРµ С‚РµСЃС‚С‹, РґРѕР±Р°РІСЊ РїСЂРѕРІРµСЂРєРё РѕСЃРЅРѕРІРЅС‹С… Рё РїРѕРіСЂР°РЅРёС‡РЅС‹С… СЃС†РµРЅР°СЂРёРµРІ, РЅРµ РјРµРЅСЏР№ СЂР°Р±РѕС‡СѓСЋ Р»РѕРіРёРєСѓ Р±РµР· РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё Рё Р·Р°РїСѓСЃС‚Рё С‚РµСЃС‚С‹.",
  },
  {
    id: "security",
    label: "РџРѕРёСЃРє Р±Р°РіРѕРІ/СѓСЏР·РІРёРјРѕСЃС‚РµР№",
    prompt: "РџСЂРѕРІРµРґРё РїРѕРёСЃРє Р±Р°РіРѕРІ Рё СѓСЏР·РІРёРјРѕСЃС‚РµР№: РїСЂРѕРІРµСЂСЊ РІС…РѕРґРЅС‹Рµ РґР°РЅРЅС‹Рµ, РѕР±СЂР°Р±РѕС‚РєСѓ РѕС€РёР±РѕРє, СЃРµРєСЂРµС‚С‹ Рё РїСЂР°РІР° РґРѕСЃС‚СѓРїР°, СѓРєР°Р¶Рё С‚РѕС‡РЅС‹Рµ С„Р°Р№Р»С‹ Рё РІРЅРµСЃРё С‚РѕР»СЊРєРѕ РїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Рµ РёСЃРїСЂР°РІР»РµРЅРёСЏ.",
  },
  {
    id: "docs",
    label: "Р”РѕРєСѓРјРµРЅС‚РёСЂРѕРІР°РЅРёРµ",
    prompt: "РџРѕРґРіРѕС‚РѕРІСЊ РґРѕРєСѓРјРµРЅС‚Р°С†РёСЋ РїРѕ С‚РµРєСѓС‰РµР№ СЂРµР°Р»РёР·Р°С†РёРё: РёР·СѓС‡Рё РєРѕРґ, РѕРїРёС€Рё Р·Р°РїСѓСЃРє, РѕСЃРЅРѕРІРЅС‹Рµ СЃС†РµРЅР°СЂРёРё, РЅР°СЃС‚СЂРѕР№РєРё Рё РѕРіСЂР°РЅРёС‡РµРЅРёСЏ, РЅРµ РёР·РјРµРЅСЏСЏ СЂР°Р±РѕС‡СѓСЋ Р»РѕРіРёРєСѓ.",
  },
] as const;

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
  toggleOverlay?: () => Promise<boolean>;
  isOverlayOpen?: () => Promise<boolean>;
  expandFromOverlay?: () => Promise<void>;
  closeOverlay?: () => Promise<void>;
  onUpdateAvailable?: (callback: (data: { version: string }) => void) => void;
  onUpdateDownloaded?: (callback: (data: { version: string }) => void) => void;
  installUpdate?: () => Promise<void>;
  notify?: (opts: { title: string; body: string }) => Promise<void>;
  safeStorage?: {
    isAvailable: () => Promise<boolean>;
    encryptString: (plaintext: string) => Promise<string>;
    decryptString: (encrypted: string) => Promise<string>;
  };
  wasRecoveredFromCrash?: () => Promise<boolean>;
};

const roleOptions = ["main", "advisor", "reviewer", "tester", "architect", "uiux", "security", "observer", "auto"];

const ROLE_TEMPLATES: Record<string, { description: string; skill: string; systemPrompt: string }> = {
  main: { description: "Р“Р»Р°РІРЅС‹Р№ РєРѕРґРµСЂ: РїСЂРёРЅРёРјР°РµС‚ СЂРµС€РµРЅРёСЏ Рё РїРёС€РµС‚ СЂР°Р±РѕС‡РёР№ РєРѕРґ.", skill: "Fullstack-СЂР°Р·СЂР°Р±РѕС‚РєР°, РґРµРєРѕРјРїРѕР·РёС†РёСЏ Р·Р°РґР°С‡, С‚РµСЃС‚РёСЂРѕРІР°РЅРёРµ Рё Р±РµР·РѕРїР°СЃРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ.", systemPrompt: "РўС‹ Р“Р»Р°РІРЅС‹Р№ Р°РіРµРЅС‚ IDE. РђРЅР°Р»РёР·РёСЂСѓР№ РєРѕРЅС‚РµРєСЃС‚ РїСЂРѕРµРєС‚Р°, РІРЅРѕСЃРё РјРёРЅРёРјР°Р»СЊРЅС‹Рµ РїСЂРѕРІРµСЂСЏРµРјС‹Рµ РёР·РјРµРЅРµРЅРёСЏ Рё Р·Р°РїСѓСЃРєР°Р№ РїРѕРґС…РѕРґСЏС‰РёРµ РїСЂРѕРІРµСЂРєРё." },
  advisor: { description: "РЎРѕРІРµС‚РЅРёРє: РёСЃСЃР»РµРґСѓРµС‚ Р·Р°РґР°С‡Сѓ Рё РїСЂРµРґР»Р°РіР°РµС‚ РєРѕРЅРєСЂРµС‚РЅС‹Рµ СЂРµС€РµРЅРёСЏ.", skill: "РђРЅР°Р»РёР· С‚СЂРµР±РѕРІР°РЅРёР№, РїРѕРёСЃРє СЂРёСЃРєРѕРІ Рё СЏСЃРЅС‹Рµ С‚РµС…РЅРёС‡РµСЃРєРёРµ СЂРµРєРѕРјРµРЅРґР°С†РёРё.", systemPrompt: "РўС‹ РЎРѕРІРµС‚РЅРёРє. РќРµ РёР·РјРµРЅСЏР№ РєРѕРґ СЃР°РјРѕСЃС‚РѕСЏС‚РµР»СЊРЅРѕ; РёР·СѓС‡Р°Р№ РєРѕРЅС‚РµРєСЃС‚ Рё С„РѕСЂРјСѓР»РёСЂСѓР№ РєРѕРЅРєСЂРµС‚РЅС‹Рµ СЂРµРєРѕРјРµРЅРґР°С†РёРё Р“Р»Р°РІРЅРѕРјСѓ Р°РіРµРЅС‚Сѓ." },
  reviewer: { description: "Р РµРІСЊСЋРµСЂ: РЅР°С…РѕРґРёС‚ РґРµС„РµРєС‚С‹ Рё СЂРµРіСЂРµСЃСЃРёРё.", skill: "Code review, С‚РёРїРёР·Р°С†РёСЏ, РєРѕСЂСЂРµРєС‚РЅРѕСЃС‚СЊ, Р±РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ Рё РїРѕРґРґРµСЂР¶РёРІР°РµРјРѕСЃС‚СЊ.", systemPrompt: "РўС‹ Р РµРІСЊСЋРµСЂ. РС‰Рё СЂРµР°Р»СЊРЅС‹Рµ РѕС€РёР±РєРё Рё СЂРµРіСЂРµСЃСЃРёРё, СѓРєР°Р·С‹РІР°Р№ С„Р°Р№Р», СЃС‚СЂРѕРєСѓ Рё СЃРїРѕСЃРѕР± РёСЃРїСЂР°РІР»РµРЅРёСЏ." },
  tester: { description: "QA: РїСЂРѕРІРµСЂСЏРµС‚ РїРѕРІРµРґРµРЅРёРµ Рё РєСЂР°Р№РЅРёРµ СЃР»СѓС‡Р°Рё.", skill: "РўРµСЃС‚-РґРёР·Р°Р№РЅ, СЂРµРіСЂРµСЃСЃРёРё, РёРЅС‚РµРіСЂР°С†РёРѕРЅРЅС‹Рµ Рё РЅРµРіР°С‚РёРІРЅС‹Рµ СЃС†РµРЅР°СЂРёРё.", systemPrompt: "РўС‹ QA-РёРЅР¶РµРЅРµСЂ. РџСЂРѕРІРµСЂСЏР№ С‚СЂРµР±РѕРІР°РЅРёСЏ, РєСЂР°Р№РЅРёРµ СЃР»СѓС‡Р°Рё Рё С‚РµСЃС‚РёСЂСѓРµРјРѕСЃС‚СЊ; РїСЂРµРґР»Р°РіР°Р№ РІРѕСЃРїСЂРѕРёР·РІРѕРґРёРјС‹Рµ РїСЂРѕРІРµСЂРєРё." },
  architect: { description: "РђСЂС…РёС‚РµРєС‚РѕСЂ: РѕС‚РІРµС‡Р°РµС‚ Р·Р° СЃС‚СЂСѓРєС‚СѓСЂСѓ Рё РіСЂР°РЅРёС†С‹ СЃРёСЃС‚РµРјС‹.", skill: "РџСЂРѕРµРєС‚РёСЂРѕРІР°РЅРёРµ РјРѕРґСѓР»РµР№, API, РїРѕС‚РѕРєРѕРІ РґР°РЅРЅС‹С… Рё РјР°СЃС€С‚Р°Р±РёСЂСѓРµРјРѕСЃС‚Рё.", systemPrompt: "РўС‹ РђСЂС…РёС‚РµРєС‚РѕСЂ. РћС†РµРЅРёРІР°Р№ СЃС‚СЂСѓРєС‚СѓСЂСѓ РїСЂРѕРµРєС‚Р°, Р·Р°РІРёСЃРёРјРѕСЃС‚Рё Рё РґРѕР»РіРѕСЃСЂРѕС‡РЅС‹Рµ СЂРёСЃРєРё; РїСЂРµРґР»Р°РіР°Р№ РїСЂРѕСЃС‚С‹Рµ СѓСЃС‚РѕР№С‡РёРІС‹Рµ СЂРµС€РµРЅРёСЏ." },
  uiux: { description: "UI/UX: РѕС‚РІРµС‡Р°РµС‚ Р·Р° СѓРґРѕР±СЃС‚РІРѕ Рё РІРёР·СѓР°Р»СЊРЅСѓСЋ С†РµР»РѕСЃС‚РЅРѕСЃС‚СЊ.", skill: "РђРґР°РїС‚РёРІРЅР°СЏ РІРµСЂСЃС‚РєР°, РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ, UX-РїРѕС‚РѕРєРё Рё РґРёР·Р°Р№РЅ-СЃРёСЃС‚РµРјС‹.", systemPrompt: "РўС‹ UI/UX РґРёР·Р°Р№РЅРµСЂ. РђРЅР°Р»РёР·РёСЂСѓР№ РёРЅС‚РµСЂС„РµР№СЃ, responsive-РїРѕРІРµРґРµРЅРёРµ, РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ Рё СЏСЃРЅРѕСЃС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёС… СЃС†РµРЅР°СЂРёРµРІ." },
  security: { description: "Security: РёС‰РµС‚ СѓСЏР·РІРёРјРѕСЃС‚Рё Рё СѓС‚РµС‡РєРё РґР°РЅРЅС‹С….", skill: "РњРѕРґРµР»РёСЂРѕРІР°РЅРёРµ СѓРіСЂРѕР·, РІР°Р»РёРґР°С†РёСЏ РІС…РѕРґРЅС‹С… РґР°РЅРЅС‹С… Рё Р±РµР·РѕРїР°СЃРЅРѕРµ С…СЂР°РЅРµРЅРёРµ СЃРµРєСЂРµС‚РѕРІ.", systemPrompt: "РўС‹ Security-Р°РЅР°Р»РёС‚РёРє. РС‰Рё СѓСЏР·РІРёРјРѕСЃС‚Рё, СѓС‚РµС‡РєРё СЃРµРєСЂРµС‚РѕРІ Рё РѕРїР°СЃРЅС‹Рµ РіСЂР°РЅРёС†С‹ РґРѕРІРµСЂРёСЏ; РїСЂРµРґР»Р°РіР°Р№ РїСЂР°РєС‚РёС‡РЅС‹Рµ РёСЃРїСЂР°РІР»РµРЅРёСЏ." },
  observer: { description: "РќР°Р±Р»СЋРґР°С‚РµР»СЊ: СЃР»РµРґРёС‚ Р·Р° СЃРѕСЃС‚РѕСЏРЅРёРµРј РїСЂРѕС†РµСЃСЃР° Рё СЂРµР·СѓР»СЊС‚Р°С‚Р°РјРё.", skill: "РњРѕРЅРёС‚РѕСЂРёРЅРі РїСЂРѕРіСЂРµСЃСЃР°, РґРёР°РіРЅРѕСЃС‚РёРєР° СЃР±РѕРµРІ Рё РєРѕРЅС‚СЂРѕР»СЊ РєСЂРёС‚РµСЂРёРµРІ РіРѕС‚РѕРІРЅРѕСЃС‚Рё.", systemPrompt: "РўС‹ РќР°Р±Р»СЋРґР°С‚РµР»СЊ. РЎРІРµСЂСЏР№ РїСЂРѕРіСЂРµСЃСЃ СЃ Р·Р°РґР°С‡РµР№, С„РёРєСЃРёСЂСѓР№ Р±Р»РѕРєРµСЂС‹ Рё РєСЂРёС‚РµСЂРёРё РіРѕС‚РѕРІРЅРѕСЃС‚Рё." },
  auto: { description: "AUTO: Р°РІС‚РѕРЅРѕРјРЅРѕ РєРѕРЅС‚СЂРѕР»РёСЂСѓРµС‚ С†РёРєР» РІС‹РїРѕР»РЅРµРЅРёСЏ.", skill: "РљРѕРЅС‚СЂРѕР»СЊ РїСЂРѕРіСЂРµСЃСЃР°, РєСЂРёС‚РµСЂРёРµРІ РіРѕС‚РѕРІРЅРѕСЃС‚Рё Рё Р±РµР·РѕРїР°СЃРЅРѕРіРѕ Р·Р°РІРµСЂС€РµРЅРёСЏ С†РёРєР»Р°.", systemPrompt: "РўС‹ AUTO-Р°РіРµРЅС‚. РљРѕРЅС‚СЂРѕР»РёСЂСѓР№ Р°РІС‚РѕРЅРѕРјРЅС‹Р№ С†РёРєР», С„РёРєСЃРёСЂСѓР№ Р±Р»РѕРєРµСЂС‹ Рё РїСЂРѕРІРµСЂСЏР№ РєСЂРёС‚РµСЂРёРё RELEASE_READY." },
};

const ROLE_COLORS: Record<string, string> = {
  main: "#8b5cf6",
  architect: "#10b981",
  reviewer: "#f97316",
  tester: "#ef4444",
  uiux: "#ec4899",
  advisor: "#06b6d4",
  security: "#f59e0b",
  observer: "#64748b",
};

const AGENT_COLOR_PALETTE = [
  "#4fc1ff", "#6a9955", "#ce9178", "#dcdcaa", "#c586c0",
  "#f48771", "#9da3b2", "#569cd6", "#d7ba7d", "#b5cea8",
  "#e8ab53", "#4ec9b0", "#f8c555", "#d16969", "#646695",
  "#c586c0", "#7cdc8a", "#f97cb5", "#61afef", "#e06c75",
];

function pickUniqueColor(existingColors: string[], role?: string): string {
  const used = new Set(existingColors.map((c) => c.toLowerCase()));
  const roleColor = role ? ROLE_COLORS[role] : undefined;
  if (roleColor && !used.has(roleColor.toLowerCase())) return roleColor;
  for (const color of AGENT_COLOR_PALETTE) {
    if (!used.has(color.toLowerCase())) return color;
  }
  return AGENT_COLOR_PALETTE[0];
}

const ROLE_PRIORITY: Record<string, number> = {
  main: 0,
  architect: 1,
  uiux: 2,
  advisor: 3,
  reviewer: 4,
  tester: 5,
  security: 6,
  observer: 7,
};

function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.role] ?? 99;
    const pb = ROLE_PRIORITY[b.role] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id - b.id;
  });
}

const COLLAPSED_SIDE = 32;

// UX fix (color indication): every workspace panel carries its own accent
// color used for the header highlight and the collapsed-state badge.
const PANEL_ACCENTS: Record<string, string> = {
  explorer: "#22d3ee",
  editor: "#3b82f6",
  lead: "#8b5cf6",
  group: "#a855f7",
  terminal: "#22c55e",
  logs: "#f97316",
};

const PANEL_ICONS: Record<string, string> = {
  explorer: "рџ“Ѓ",
  editor: "рџ“ќ",
  lead: "рџ‘‘",
  group: "рџ‘Ґ",
  terminal: "рџ’»",
  logs: "рџ“њ",
};
const COLLAPSED_BOTTOM = 32;

type PanelName = "explorer" | "editor" | "lead" | "group" | "terminal" | "logs";

type ContextMenuState = {
  x: number;
  y: number;
  entry: WorkspaceTreeEntry;
};

type WorkspaceTreeNode = WorkspaceTreeEntry & {
  children: WorkspaceTreeNode[];
};

type CreateEntryDraft = {
  kind: "file" | "directory";
  parentPath: string;
};

function buildWorkspaceTree(entries: WorkspaceTreeEntry[]) {
  const nodes = new Map<string, WorkspaceTreeNode>();
  const roots: WorkspaceTreeNode[] = [];

  for (const entry of entries) {
    nodes.set(entry.path, { ...entry, children: [] });
  }

  for (const node of nodes.values()) {
    const parentPath = node.path.split("/").slice(0, -1).join("/");
    const parent = parentPath ? nodes.get(parentPath) : undefined;
    if (parent?.kind === "directory") parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (items: WorkspaceTreeNode[]) => {
    items.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.path.localeCompare(right.path);
    });
    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);
  return roots;
}

const dict = {
  ru: {
    loading: "Р—Р°РіСЂСѓР·РєР° СЂР°Р±РѕС‡РµР№ СЃСЂРµРґС‹...",
    synced: "РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ",
    errLoad: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂР°Р±РѕС‡СѓСЋ СЃСЂРµРґСѓ",
    recovered: "Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ РїРѕСЃР»Рµ СЃР±РѕСЏ",
    settings: "РќР°СЃС‚СЂРѕР№РєРё",
    openSettings: "РћС‚РєСЂС‹С‚СЊ РЅР°СЃС‚СЂРѕР№РєРё",
    close: "Р—Р°РєСЂС‹С‚СЊ",
    lang: "РЇР·С‹Рє",
    explorer: "Р”Р•Р Р•Р’Рћ РџР РћР•РљРўРђ",
    editor: "Р Р•Р”РђРљРўРћР ",
    noFile: "Р¤Р°Р№Р» РЅРµ РІС‹Р±СЂР°РЅ",
    saveMain: "РЎРѕС…СЂР°РЅРёС‚СЊ РѕС‚ Р“Р»Р°РІРЅРѕРіРѕ",
    rollback: "РћС‚РєР°С‚РёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ",
    pushGithub: "РџСѓС€ РІ GitHub",
    donateBtn: "рџ’› РџРѕРґРґРµСЂР¶Р°С‚СЊ / Р”РѕРЅР°С‚",
    supportTitle: "РџРѕРґРґРµСЂР¶РєР° Рё СЃРІСЏР·СЊ",
    supportDonateTitle: "Р”РѕРЅР°С‚С‹",
    supportDonateDesc: "Р•СЃР»Рё РїСЂРѕРµРєС‚ РїРѕР»РµР·РµРЅ вЂ” РїРѕРґРґРµСЂР¶РёС‚Рµ СЂР°Р·СЂР°Р±РѕС‚РєСѓ. Р”РѕРЅР°С‚С‹ РїРѕРјРѕРіР°СЋС‚ РґРµР»Р°С‚СЊ РёРЅСЃС‚СЂСѓРјРµРЅС‚ Р»СѓС‡С€Рµ.",
    supportProjectBtn: "РџРѕРґРґРµСЂР¶Р°С‚СЊ РїСЂРѕРµРєС‚ вќ¤пёЏ",
    emailTitle: "РџРѕС‡С‚Р° РґР»СЏ СЃРІСЏР·Рё",
    emailLabel: "Email",
    emailDesc: "Р”Р»СЏ Р±Р°РіСЂРµРїРѕСЂС‚РѕРІ, РїСЂРµРґР»РѕР¶РµРЅРёР№ Рё С‚РµС…РїРѕРґРґРµСЂР¶РєРё",
    supportThanks: "РЎРїР°СЃРёР±Рѕ Р·Р° РїРѕРґРґРµСЂР¶РєСѓ!",
    github: "GitHub",
    githubToken: "GitHub Token",
    githubRepo: "Р РµРїРѕР·РёС‚РѕСЂРёР№ (username/repo)",
    githubAutoPush: "РђРІС‚РѕСЃРѕС…СЂР°РЅРµРЅРёРµ РІ GitHub РїРѕСЃР»Рµ РїСЂР°РІРѕРє РР",
    leadChat: "Р§РђРў РЎ Р“Р›РђР’РќР«Рњ",
    allChat: "РћР‘Р©РР™ Р§РђРў РђР“Р•РќРўРћР’",
    send: "РћС‚РїСЂР°РІРёС‚СЊ",
    duplicate: "Р”СѓР±Р»РёСЂРѕРІР°С‚СЊ РІ С‡Р°С‚ СЃ РіР»Р°РІРЅС‹Рј",
    terminal: "РўР•Р РњРРќРђР›",
    checks: "РџР РћР’Р•Р РљР",
    importCode: "РРјРїРѕСЂС‚ РєРѕРґР°",
    projectFolder: "РџР°РїРєР° РїСЂРѕРµРєС‚Р°",
    folderPath: "РџСѓС‚СЊ Рє Р»РѕРєР°Р»СЊРЅРѕР№ РїР°РїРєРµ",
    connectFolder: "РџРѕРґРєР»СЋС‡РёС‚СЊ РїР°РїРєСѓ",
    browseFolder: "Р’С‹Р±СЂР°С‚СЊ РїР°РїРєСѓ",
    folderConnected: "РџР°РїРєР° РїРѕРґРєР»СЋС‡РµРЅР°",
    importHint: "Р—Р°РіСЂСѓР·РёС‚Рµ .ts/.tsx/.js/.py/.md Рё РґСЂСѓРіРёРµ С‚РµРєСЃС‚РѕРІС‹Рµ С„Р°Р№Р»С‹",
    importBtn: "РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ С„Р°Р№Р»С‹",
    attachLink: "РЎСЃС‹Р»РєР°",
    attachImage: "РљР°СЂС‚РёРЅРєР°",
    addLink: "Р”РѕР±Р°РІРёС‚СЊ СЃСЃС‹Р»РєСѓ",
    clearAttach: "РћС‡РёСЃС‚РёС‚СЊ РІР»РѕР¶РµРЅРёСЏ",
    apiKeys: "API-РєР»СЋС‡Рё",
    saveKeys: "РЎРѕС…СЂР°РЅРёС‚СЊ РєР»СЋС‡Рё",
    freeOpenRouter: "РџРѕР»СѓС‡РёС‚СЊ Р±РµСЃРїР»Р°С‚РЅС‹Р№ РєР»СЋС‡ OpenRouter",
    provider: "РџСЂРѕРІР°Р№РґРµСЂ",
    baseUrl: "Base URL",
    defaultModel: "РњРѕРґРµР»СЊ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ",
    agents: "РђРіРµРЅС‚С‹",
    createAgent: "РЎРѕР·РґР°С‚СЊ Р°РіРµРЅС‚Р°",
    role: "Р РѕР»СЊ",
    name: "РРјСЏ",
    model: "РњРѕРґРµР»СЊ",
    loadModels: "РћР±РЅРѕРІРёС‚СЊ РјРѕРґРµР»Рё",
    manualModel: "Р’РІРµСЃС‚Рё РІСЂСѓС‡РЅСѓСЋ...",
    profile: "РџСЂРѕС„РёР»СЊ",
    skill: "РЎРєРёР»Р»",
    prompt: "РЎРёСЃС‚РµРјРЅС‹Р№ РїСЂРѕРјРїС‚",
    saveProfile: "РЎРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ",
    setMain: "РќР°Р·РЅР°С‡РёС‚СЊ РіР»Р°РІРЅС‹Рј",
    mockHint: "Р”Р»СЏ СЂРµР°Р»СЊРЅРѕРіРѕ РѕС‚РІРµС‚Р° Р°РіРµРЅС‚Сѓ РЅСѓР¶РµРЅ API-РєР»СЋС‡ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїСЂРѕРІР°Р№РґРµСЂР°.",
    ready: "вњ… Р“РѕС‚РѕРІРѕ",
    busy: "вЏі Р’С‹РїРѕР»РЅСЏРµС‚СЃСЏ...",
    stop: "РћСЃС‚Р°РЅРѕРІРёС‚СЊ",
    retry: "РџРѕРІС‚РѕСЂРёС‚СЊ",
    copy: "РљРѕРїРёСЂРѕРІР°С‚СЊ",
    copied: "РЎРєРѕРїРёСЂРѕРІР°РЅРѕ",
    sending: "РћС‚РїСЂР°РІР»СЏРµС‚СЃСЏ",
    streaming: "Р“РµРЅРµСЂР°С†РёСЏ",
    sent: "Р“РѕС‚РѕРІРѕ",
    cancelled: "РћСЃС‚Р°РЅРѕРІР»РµРЅРѕ",
    errorStatus: "РћС€РёР±РєР°",
    unsaved: "в—Џ РќРµ СЃРѕС…СЂР°РЅРµРЅРѕ",
    collapse: "РЎРІРµСЂРЅСѓС‚СЊ",
    expand: "Р Р°Р·РІРµСЂРЅСѓС‚СЊ",
    newFile: "РЎРѕР·РґР°С‚СЊ С„Р°Р№Р»",
    newFolder: "РЎРѕР·РґР°С‚СЊ РїР°РїРєСѓ",
    rename: "РџРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ",
    delete: "РЈРґР°Р»РёС‚СЊ",
    create: "РЎРѕР·РґР°С‚СЊ",
    error429: "вљ пёЏ РћС€РёР±РєР° 429 (РџСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚ Р·Р°РїСЂРѕСЃРѕРІ). РЎРјРµРЅРёС‚Рµ РјРѕРґРµР»СЊ РёР»Рё РїСЂРѕРІР°Р№РґРµСЂР°.",
    errorDefault: "вљ пёЏ РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР°. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р· РёР»Рё СЃРјРµРЅРёС‚Рµ РјРѕРґРµР»СЊ.",
    logsTitle: "Р›РћР“Р / РЎРРЎРўР•РњРќР«Р• РЎРћР‘Р«РўРРЇ",
    search: "РџРѕРёСЃРє РїРѕ С„Р°Р№Р»Р°Рј",
    searchPlaceholder: "РџРѕРёСЃРє РїРѕ РїСЂРѕРµРєС‚Сѓ (Ctrl+P)...",
    noResults: "РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ",
    exportAgents: "Р­РєСЃРїРѕСЂС‚ РЅР°СЃС‚СЂРѕРµРє Рё РїСЂРѕС„Р°Р№Р»РѕРІ",
    importAgents: "РРјРїРѕСЂС‚ РЅР°СЃС‚СЂРѕРµРє",
    importAgentsDesc: "JSON Р±РµР· API-РєР»СЋС‡РµР№ Рё С‚РѕРєРµРЅРѕРІ: РЅР°СЃС‚СЂРѕР№РєРё Рё РїСЂРѕС„РёР»Рё Р°РіРµРЅС‚РѕРІ",
    diff: "РР·РјРµРЅРµРЅРёСЏ",
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
    donateBtn: "рџ’› Support / Donate",
    supportTitle: "Support & Contact",
    supportDonateTitle: "Donations",
    supportDonateDesc: "If the project is useful вЂ” support its development. Donations help make the tool better.",
    supportProjectBtn: "Support the project вќ¤пёЏ",
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
    ready: "вњ… Ready",
    busy: "вЏі Processing...",
    stop: "Stop",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    sending: "Sending",
    streaming: "Generating",
    sent: "Done",
    cancelled: "Stopped",
    errorStatus: "Error",
    unsaved: "в—Џ Unsaved",
    collapse: "Collapse",
    expand: "Maximize",
    newFile: "New file",
    newFolder: "New folder",
    rename: "Rename",
    delete: "Delete",
    create: "Create",
    error429: "вљ пёЏ Error 429 (Rate limit exceeded). Switch model or provider.",
    errorDefault: "вљ пёЏ An error occurred. Try again or switch models.",
    logsTitle: "LOGS / SYSTEM EVENTS",
    search: "Search files",
    searchPlaceholder: "Search project (Ctrl+P)...",
    noResults: "No results found",
    exportAgents: "Export settings and profiles",
    importAgents: "Import settings",
    importAgentsDesc: "JSON without API keys or tokens: settings and agent profiles",
    diff: "Changes",
  },
};

const emptyNewAgent = (overrides: Partial<NewAgentDraft> = {}, existingColors: string[] = []): NewAgentDraft => {
  const preset = getProviderPreset("openrouter");
  const role = overrides.role ?? "advisor";
  return {
    name: "",
    provider: preset.id,
    baseUrl: preset.baseUrl,
    model: preset.defaultModel,
    role,
    description: ROLE_TEMPLATES[role]?.description ?? "",
    skill: ROLE_TEMPLATES[role]?.skill ?? "",
    systemPrompt: ROLE_TEMPLATES[role]?.systemPrompt ?? "",
    color: overrides.color ?? pickUniqueColor(existingColors, role),
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
  const [duplicateToLead, setDuplicateToLead] = useState(false);
  const [groupRoleFilter, setGroupRoleFilter] = useState<GroupRoleFilter>("all");
  const [terminalCommand, setTerminalCommand] = useState("");
  const [status, setStatus] = useState(dict.ru.loading);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
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
  const [topProportions, setTopProportions] = useState([240, 560, 320, 320]);
  const [bottomProportions, setBottomProportions] = useState([0.5, 0.5]);
  const [workspaceTreeEntries, setWorkspaceTreeEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, "new" | "modified" | "saved">>({});
  const [selectedDirectory, setSelectedDirectory] = useState("");
  const [expandedDirectories, setExpandedDirectories] = useState<string[]>([]);
  const expandedDirectoriesInitializedRef = useRef(false);
  const [createEntryDraft, setCreateEntryDraft] = useState<CreateEntryDraft | null>(null);
  const [createEntryName, setCreateEntryName] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [openTabs, setOpenTabs] = useState<Array<{ id: number; path: string; content: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ path: string; line: number; content: string }>>([]);

  const [apiKeysDraft, setApiKeysDraft] = useState<Record<string, string>>({});
  const [apiKeysToRemove, setApiKeysToRemove] = useState<Record<string, boolean>>({});
  const [githubTokenDraft, setGithubTokenDraft] = useState("");
  const [removeGithubToken, setRemoveGithubToken] = useState(false);
  const [githubRepoDraft, setGithubRepoDraft] = useState("");
  const [githubAutoPushDraft, setGithubAutoPushDraft] = useState(false);
  const [autoApproveDraft, setAutoApproveDraft] = useState(false);
  const [mobileTokenDraft, setMobileTokenDraft] = useState("");
  const [localtunnelEnabledDraft, setLocaltunnelEnabledDraft] = useState(false);
  const [localtunnelUrl, setLocaltunnelUrl] = useState("");
  const [localtunnelLoading, setLocaltunnelLoading] = useState(false);
  const localtunnelAutoStartRef = useRef(false);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [githubPushToken, setGithubPushToken] = useState("");
  const [githubPushRepo, setGithubPushRepo] = useState("");
  const [githubPushLoading, setGithubPushLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewCommandDraft, setPreviewCommandDraft] = useState("npm run dev");
  const [previewPortDraft, setPreviewPortDraft] = useState(4173);
  const [telegramTokenDraft, setTelegramTokenDraft] = useState("");
  const [removeTelegramToken, setRemoveTelegramToken] = useState(false);
  const [telegramChatIdDraft, setTelegramChatIdDraft] = useState("");
  const [fallbackModelsDraft, setFallbackModelsDraft] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState("web");
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [agentDrafts, setAgentDrafts] = useState<Record<number, AgentDraft>>({});
  const [newAgent, setNewAgent] = useState<NewAgentDraft>(emptyNewAgent());
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({});
  const [modelSearch, setModelSearch] = useState<Record<string, string>>({});

  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [workspaceRootDraft, setWorkspaceRootDraft] = useState("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<WorkspaceMessage[]>([]);
  const optimisticMessageIdRef = useRef(-1);
  const leadChatEndRef = useRef<HTMLDivElement>(null);
  const groupChatEndRef = useRef<HTMLDivElement>(null);
  const systemEventsEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessages, setStreamingMessages] = useState<Record<number, ChatStreamState>>({});
  const [chatRunning, setChatRunning] = useState(false);
  const [retryRequest, setRetryRequest] = useState<ChatRetryRequest | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<number | string | null>(null);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [templateMenu, setTemplateMenu] = useState<ChatChannel | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const chatAbortRef = useRef<AbortController | null>(null);

  // Listen for auto-updater events from Electron main process.
  useEffect(() => {
    const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
    bridge?.onUpdateAvailable?.((data: { version: string }) => {
      setUpdateVersion(data.version);
      setUpdateDownloaded(false);
    });
    bridge?.onUpdateDownloaded?.((data: { version: string }) => {
      setUpdateVersion(data.version);
      setUpdateDownloaded(true);
    });
  }, []);

  const t = dict[locale];
  const appPort = typeof window !== "undefined" ? window.location.port || "80" : "";
  const workspaceTree = useMemo(() => buildWorkspaceTree(workspaceTreeEntries), [workspaceTreeEntries]);

  useEffect(() => {
    if (expandedDirectoriesInitializedRef.current || workspaceTreeEntries.length === 0) return;
    expandedDirectoriesInitializedRef.current = true;
    setExpandedDirectories(workspaceTreeEntries.filter((entry) => entry.kind === "directory").map((entry) => entry.path));
  }, [workspaceTreeEntries]);

  // Collapse/expand helpers moved outside via useMemo render functions
  const renderCollapseButton = (name: PanelName) => {
    const collapsed = collapsedPanels[name];
    return (
      <button
        key={`collapse-${name}`}
        type="button"
        onClick={() => toggleCollapse(name)}
        title={collapsed ? t.expand : t.collapse}
        className="flex h-7 w-7 items-center justify-center rounded text-xs hover:bg-white/10"
        style={{ color: "var(--text-secondary)" }}
      >
        {collapsed ? "в–ё" : "в—‚"}
      </button>
    );
  };

  const renderExpandButton = (name: string) => (
    <button
      key={`expand-${name}`}
      type="button"
      onClick={() => toggleFullscreen(name)}
      title={t.expand}
      className="flex h-7 w-7 items-center justify-center rounded text-xs hover:bg-white/10"
      style={{ color: "var(--text-secondary)" }}
    >
      в–Ў
    </button>
  );

  const settingsDirty = useMemo(() => {
    const saved = data?.settings;
    if (!saved) return false;
    return Object.values(apiKeysDraft).some((value) => Boolean(value.trim()))
      || githubTokenDraft.trim() !== ""
      || removeGithubToken
      || githubRepoDraft !== saved.githubRepo
      || githubAutoPushDraft !== saved.githubAutoPush
      || autoApproveDraft !== saved.autoApprove
      || mobileTokenDraft !== (saved.mobileAuthToken ?? "")
      || localtunnelEnabledDraft !== Boolean(saved.localtunnelEnabled)
      || previewCommandDraft !== saved.previewCommand
      || previewPortDraft !== saved.previewPort
      || telegramTokenDraft.trim() !== ""
      || removeTelegramToken
      || telegramChatIdDraft !== saved.telegramChatId
      || fallbackModelsDraft !== saved.fallbackModels.join("\n")
      || Object.values(apiKeysToRemove).some(Boolean);
  }, [apiKeysDraft, apiKeysToRemove, data?.settings, githubAutoPushDraft, githubRepoDraft, githubTokenDraft, removeGithubToken, autoApproveDraft, mobileTokenDraft, localtunnelEnabledDraft, previewCommandDraft, previewPortDraft, telegramTokenDraft, removeTelegramToken, telegramChatIdDraft, fallbackModelsDraft]);

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
  // UX fix (dedupe): while an agent reply is streaming, the saved copy of the
  // same message must not render twice once the workspace refreshes.
  const liveMessageKeys = useMemo(
    () => new Set(Object.values(streamingMessages).map((m) => `${m.identity.agentId}:${sanitizeChatContent(m.content).trim().slice(0, 80)}`)),
    [streamingMessages],
  );
  const duplicatedByLiveStream = useCallback((msg: WorkspaceMessage) => {
    if (msg.senderType !== "agent") return false;
    const agentId = msg.metadata?.identity?.agentId;
    if (!agentId) return false;
    return liveMessageKeys.has(`${agentId}:${sanitizeChatContent(msg.content).trim().slice(0, 80)}`);
  }, [liveMessageKeys]);
  const leadMessages = useMemo(() => {
    const mainAgentId = data?.agents?.find((a) => a.role === "main")?.id ?? -1;
    const existing = data?.messages.filter((m) =>
      m.chatChannel === "lead"
      && m.senderType !== "system"
      // Lead chat: only user messages + main agent messages. Advisors filtered out.
      && (m.senderType !== "agent" || !m.metadata?.identity?.agentId || m.metadata.identity.agentId === mainAgentId)
      && !duplicatedByLiveStream(m)
    ) ?? [];
    const optimistic = optimisticMessages.filter((m) => m.chatChannel === "lead" && m.senderType === "user");
    return [...existing, ...optimistic];
  }, [data?.messages, data?.agents, optimisticMessages, duplicatedByLiveStream]);
  const groupMessages = useMemo(() => {
    const messages = [...(data?.messages.filter((m) => m.chatChannel === "group" && m.senderType !== "system" && !duplicatedByLiveStream(m)) ?? []), ...optimisticMessages.filter((m) => m.chatChannel === "group")];
    if (groupRoleFilter === "all") return messages;
    return messages.filter((message) => message.metadata?.identity?.role === groupRoleFilter);
  }, [data?.messages, groupRoleFilter, optimisticMessages, duplicatedByLiveStream]);
  const liveMessages = useMemo(() => Object.values(streamingMessages), [streamingMessages]);
  const liveMessagesVersion = liveMessages.map((message) => `${message.identity.agentId}:${message.content.length}:${message.status}`).join("|");
  const contextStats = useMemo(() => {
    const messages = [...leadMessages, ...groupMessages];
    const tokens = messages.reduce((total, message) => total + Math.max(1, Math.ceil(message.content.length / 4)), 0);
    const compressed = Math.max(leadMessages.length, groupMessages.length) > 20;
    return { percent: Math.min(100, Math.round((tokens / 8000) * 100)), compressed };
  }, [leadMessages, groupMessages]);

  useEffect(() => {
    leadChatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
    groupChatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [leadMessages.length, groupMessages.length, liveMessagesVersion]);

  useEffect(() => {
    systemEventsEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [data?.systemEvents?.length]);

  useEffect(() => () => chatAbortRef.current?.abort(), []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (contextMenu && !(e.target as HTMLElement).closest(".context-menu")) setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && contextMenu) { setContextMenu(null); return; }
      if (e.key === "Escape" && searchQuery) { setSearchQuery(""); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); setSearchQuery(""); setSearchResults([]); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveFileRef.current(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") { e.preventDefault(); window.location.reload(); return; }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu, searchQuery]);

  function roleLabel(role: string) {
    if (locale === "ru") {
      if (role === "main") return "Р“Р»Р°РІРЅС‹Р№";
      if (role === "advisor") return "РЎРѕРІРµС‚РЅРёРє";
      if (role === "reviewer") return "Р РµРІСЊСЋРµСЂ";
      if (role === "tester") return "РўРµСЃС‚РёСЂРѕРІС‰РёРє";
      if (role === "architect") return "РђСЂС…РёС‚РµРєС‚РѕСЂ";
      if (role === "uiux") return "UI/UX Р”РёР·Р°Р№РЅРµСЂ";
      if (role === "security") return "РЎРµРєСѓСЂРёС‚Рё";
      if (role === "observer") return "РќР°Р±Р»СЋРґР°С‚РµР»СЊ";
      if (role === "auto") return "AUTO";
    }
    return role === "auto" ? "AUTO" : role;
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
    if (message.agentName === "System" || message.senderType === "system") return locale === "ru" ? "РЎРёСЃС‚РµРјР°" : "System";
    if (message.senderType === "user" || message.agentName === "User" || message.agentName === "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ") {
      return locale === "ru" ? "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ" : "User";
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
    // Add to tabs if not already open
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === indexedFile.id)) return prev;
      return [...prev, { id: indexedFile.id, path: indexedFile.path, content: indexedFile.content }];
    });
    setSelectedFileId(indexedFile.id);
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(file.path)}`, { cache: "no-store" });
      const payload = response.ok ? (await response.json()) as { content?: string } : null;
      const content = typeof payload?.content === "string" ? payload.content : indexedFile.content;
      setEditorText(content);
      setOpenTabs((prev) => prev.map((t) => t.id === indexedFile.id ? { ...t, content } : t));
      setData((previous) => previous ? { ...previous, files: previous.files.map((candidate) => candidate.id === indexedFile.id ? { ...candidate, content } : candidate) } : previous);
      setFileStatuses((previous) => ({ ...previous, [file.path]: "saved" }));
    } catch {
      setEditorText(indexedFile.content);
    }
  }

  function closeTab(tabId: number) {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (selectedFileId === tabId && next.length > 0) {
        const tab = next[next.length - 1];
        setSelectedFileId(tab.id);
        setEditorText(tab.content);
      } else if (next.length === 0) {
        setSelectedFileId(null);
        setEditorText("");
      }
      return next;
    });
  }

  async function searchFiles() {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch("/api/workspace/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, maxResults: 20 }),
      });
      if (!res.ok) return;
      const payload = (await res.json()) as { matches?: Array<{ path: string; line: number; text: string }> };
      setSearchResults((payload.matches ?? []).map((match) => ({ path: match.path, line: match.line, content: match.text })));
    } catch {
      setSearchResults([]);
    }
  }

  useEffect(() => {
    if (!data?.settings.localtunnelEnabled || localtunnelLoading || localtunnelAutoStartRef.current) return;
    localtunnelAutoStartRef.current = true;
    void toggleLocaltunnel(true);
    // Start once after workspace settings are loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.settings.localtunnelEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => { if (searchQuery) searchFiles(); }, 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function quickCommand(cmd: string, channel: ChatChannel) {
    const target = channel === "lead" ? leadMessage : groupMessage;
    const setter = channel === "lead" ? setLeadMessage : setGroupMessage;
    setter(target + cmd + " ");
  }

  function handleMentionInput(channel: ChatChannel, value: string, cursor = value.length) {
    const setter = channel === "lead" ? setLeadMessage : setGroupMessage;
    setter(value);
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/);
    if (!match) {
      setMentionState(null);
      return;
    }
    setMentionState({ channel, query: match[2], start: cursor - match[2].length - 1, cursor });
  }

  function selectMentionFile(file: WorkspaceTreeEntry) {
    if (!mentionState) return;
    const current = mentionState.channel === "lead" ? leadMessage : groupMessage;
    const setter = mentionState.channel === "lead" ? setLeadMessage : setGroupMessage;
    const next = `${current.slice(0, mentionState.start)}@${file.path} ${current.slice(mentionState.cursor)}`;
    const nextCursor = mentionState.start + file.path.length + 2;
    setter(next);
    setMentionState(null);
    window.setTimeout(() => {
      const input = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea[data-chat-channel]")).find((candidate) => candidate.dataset.chatChannel === mentionState.channel);
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }

  function applyTaskTemplate(channel: ChatChannel, prompt: string) {
    const setter = channel === "lead" ? setLeadMessage : setGroupMessage;
    setter(prompt);
    setTemplateMenu(null);
    setMentionState(null);
  }

  function mentionSuggestions(channel: ChatChannel) {
    if (!mentionState || mentionState.channel !== channel) return [];
    const query = mentionState.query.toLowerCase();
    return workspaceTreeEntries
      .filter((entry) => entry.kind === "file" && entry.path.toLowerCase().includes(query))
      .slice(0, 8);
  }

  function renderMentionSuggestions(channel: ChatChannel) {
    const suggestions = mentionSuggestions(channel);
    if (suggestions.length === 0) return null;
    return (
      <div className="absolute bottom-full left-0 z-50 mb-1 max-h-48 w-full overflow-y-auto rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1 shadow-xl">
        {suggestions.map((file) => (
          <button key={file.path} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectMentionFile(file)} className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            рџ“„ {file.path}
          </button>
        ))}
      </div>
    );
  }

  function renderTaskTemplates(channel: ChatChannel) {
    if (templateMenu !== channel) return null;
    return (
      <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-1 shadow-xl">
        {TASK_TEMPLATES.map((template) => (
          <button key={template.id} type="button" onClick={() => applyTaskTemplate(channel, template.prompt)} className="block w-full rounded px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            {template.label}
          </button>
        ))}
      </div>
    );
  }

  function exportAgents() {
    if (!data?.agents) return;
    const settings = data.settings;
    const payload = {
      format: "multi-agent-code-studio-settings",
      version: 1,
      exportedAt: new Date().toISOString(),
      // Deliberately exclude API keys, GitHub tokens, Telegram tokens and mobile access tokens.
      settings: {
        projectRoot: workspaceRootDraft || settings.projectRoot,
        githubRepo: githubRepoDraft || settings.githubRepo,
        githubAutoPush: githubAutoPushDraft,
        autoApprove: autoApproveDraft,
        localtunnelEnabled: localtunnelEnabledDraft,
        fallbackModels: fallbackModelsDraft.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
        previewCommand: previewCommandDraft,
        previewPort: previewPortDraft,
        projectTemplate: settings.projectTemplate,
        projectTemplatePrompt: settings.projectTemplatePrompt,
      },
      agents: data.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        baseUrl: agent.baseUrl,
        model: agent.model,
        role: agent.role,
        description: agent.description,
        skill: agent.skill,
        systemPrompt: agent.systemPrompt,
        color: agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff",
      })),
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "multi-agent-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importAgentsFromFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as
        | { settings?: Record<string, unknown>; agents?: Array<Record<string, unknown>> }
        | Array<Record<string, unknown>>;
      const importedSettings = Array.isArray(parsed) ? {} : parsed.settings ?? {};
      const importedAgents = Array.isArray(parsed) ? parsed : parsed.agents ?? [];
      if (!importedSettings || typeof importedSettings !== "object") throw new Error("Invalid settings payload");

      const settingsPayload: Record<string, unknown> = {};
      const stringSettings = ["projectRoot", "githubRepo", "previewCommand", "projectTemplate", "projectTemplatePrompt"] as const;
      for (const key of stringSettings) {
        if (typeof importedSettings[key] === "string") settingsPayload[key] = importedSettings[key];
      }
      const booleanSettings = ["githubAutoPush", "autoApprove", "localtunnelEnabled"] as const;
      for (const key of booleanSettings) {
        if (typeof importedSettings[key] === "boolean") settingsPayload[key] = importedSettings[key];
      }
      if (Array.isArray(importedSettings.fallbackModels)) settingsPayload.fallbackModels = importedSettings.fallbackModels.filter((value): value is string => typeof value === "string");
      if (typeof importedSettings.previewPort === "number") settingsPayload.previewPort = importedSettings.previewPort;

      if (Object.keys(settingsPayload).length > 0) {
        const settingsResponse = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settingsPayload),
        });
        if (!settingsResponse.ok) {
          const payload = (await settingsResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Settings import failed");
        }
      }

      let importedCount = 0;
      for (const importedAgent of importedAgents) {
        if (typeof importedAgent.name !== "string" || typeof importedAgent.provider !== "string") continue;
        const current = data?.agents.find((agent) =>
          (typeof importedAgent.id === "number" && agent.id === importedAgent.id) || agent.name === importedAgent.name,
        );
        const agentPayload = {
          provider: importedAgent.provider,
          baseUrl: typeof importedAgent.baseUrl === "string" ? importedAgent.baseUrl : undefined,
          model: typeof importedAgent.model === "string" ? importedAgent.model : undefined,
          role: typeof importedAgent.role === "string" ? importedAgent.role : undefined,
          description: typeof importedAgent.description === "string" ? importedAgent.description : undefined,
          skill: typeof importedAgent.skill === "string" ? importedAgent.skill : "",
          systemPrompt: typeof importedAgent.systemPrompt === "string" ? importedAgent.systemPrompt : "",
          color: typeof importedAgent.color === "string" ? importedAgent.color : undefined,
          locale,
        };
        const response = await fetch(current ? `/api/agents/${current.id}` : "/api/agents", {
          method: current ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(current ? agentPayload : { ...agentPayload, name: importedAgent.name }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Agent import failed");
        }
        importedCount += 1;
      }

      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? `РРјРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ РїСЂРѕС„РёР»РµР№: ${importedCount}` : `Imported profiles: ${importedCount}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : (locale === "ru" ? "РќРµ СѓРґР°Р»РѕСЃСЊ РёРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РЅР°СЃС‚СЂРѕР№РєРё" : "Failed to import settings"));
    }
  }

  async function clearAgentMemoryCache() {
    try {
      const response = await fetch("/api/settings", { method: "DELETE" });
      if (!response.ok) throw new Error("Cache clear failed");
      setModelOptions({});
      setModelSearch({});
      setStreamingMessages({});
      setOptimisticMessages([]);
      setRetryRequest(null);
      setStatus(locale === "ru" ? "Р’СЂРµРјРµРЅРЅС‹Р№ РєСЌС€ РїР°РјСЏС‚Рё Р°РіРµРЅС‚РѕРІ РѕС‡РёС‰РµРЅ. РљР»СЋС‡Рё СЃРѕС…СЂР°РЅРµРЅС‹." : "Temporary agent memory cache cleared. Keys were preserved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cache clear failed");
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

  async function loadWorkspace(nextFileId?: number | null, activeLocale?: UiLocale, options?: { clearSelection?: boolean }) {
    const l = activeLocale ?? locale;
    const [workspaceResponse, treeResponse] = await Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/workspace/tree", { cache: "no-store" }),
    ]);
    if (!workspaceResponse.ok) throw new Error(dict[l].errLoad);

    const payload = (await workspaceResponse.json()) as WorkspaceData;
    const treePayload = treeResponse.ok ? (await treeResponse.json()) as { entries?: WorkspaceTreeEntry[] } : null;
    const nextTreeEntries = treePayload?.entries ?? payload.files.map((file) => ({ path: file.path, language: file.language, size: file.content.length, updatedAt: file.updatedAt, kind: "file" as const }));
    setWorkspaceTreeEntries(nextTreeEntries);
    setSelectedDirectory((previous) => previous && nextTreeEntries.some((entry) => entry.kind === "directory" && entry.path === previous) ? previous : "");
    setData(payload);
    setWorkspaceRootDraft(payload.settings?.projectRoot ?? "");
    setApiKeysDraft(payload.settings?.apiKeys ?? {});
    setApiKeysToRemove({});
    setGithubTokenDraft(payload.settings?.githubToken ?? "");
    setRemoveGithubToken(false);
    setGithubRepoDraft(payload.settings?.githubRepo ?? "");
    setGithubAutoPushDraft(Boolean(payload.settings.githubAutoPush));
    setAutoApproveDraft(Boolean(payload.settings.autoApprove));
    setMobileTokenDraft(payload.settings.mobileAuthToken ?? "");
    // S1 companion fix: mirror the mobile access token into a cookie so the
    // desktop UI keeps working against every API route while the localtunnel
    // is active (routes then require the token even for loopback-looking
    // requests).
    const mobileAccessToken = payload.settings.mobileAuthToken ?? "";
    if (mobileAccessToken) {
      document.cookie = `mobile_access_token=${encodeURIComponent(mobileAccessToken)}; path=/; max-age=31536000; samesite=strict`;
    }
    setPreviewUrl(payload.settings.previewUrl ?? "");
    setPreviewCommandDraft(payload.settings.previewCommand ?? "npm run dev");
    setPreviewPortDraft(payload.settings.previewPort ?? 4173);
    setTelegramTokenDraft("");
    setRemoveTelegramToken(false);
    setTelegramChatIdDraft(payload.settings.telegramChatId ?? "");
    setFallbackModelsDraft((payload.settings.fallbackModels ?? []).join("\n"));
    setLocaltunnelEnabledDraft(Boolean(payload.settings.localtunnelEnabled));
    setLocaltunnelUrl(payload.settings.localtunnelUrl ?? "");
    setAgentDrafts(toDrafts(payload.agents));

    const requestedTarget = options?.clearSelection ? null : nextFileId ?? selectedFileId;
    const target = requestedTarget != null && payload.files.some((file) => file.id === requestedTarget)
      ? requestedTarget
      : options?.clearSelection ? null : payload.files[0]?.id ?? null;
    setSelectedFileId(target);
    const validFileIds = new Set(payload.files.map((file) => file.id));
    setOpenTabs((previous) => previous.filter((tab) => validFileIds.has(tab.id)));
    if (target != null) localStorage.setItem("ui-selected-file", String(target));
    const file = payload.files.find((f) => f.id === target) ?? payload.files[0];
    // H8 fix: incoming agent/chat-driven refreshes must not wipe unsaved code
    // the user is currently typing in the editor buffer.
    const keepsUnsavedBuffer = Boolean(
      file
      && file.id === selectedFileId
      && (fileStatuses[file.path] === "modified" || fileStatuses[file.path] === "new"),
    );
    if (!keepsUnsavedBuffer) setEditorText(file?.content ?? "");
    setFileStatuses((previous) => Object.fromEntries(payload.files.map((item) => [item.path, previous[item.path] === "modified" || previous[item.path] === "new" ? previous[item.path] : "saved"])));
    setStatus(dict[l].synced);

    void fetchModels("openrouter", getProviderPreset("openrouter").baseUrl, payload.settings?.apiKeys?.openrouter);
  }

  useEffect(() => {
    const saved = localStorage.getItem("ui-locale");
    const l: UiLocale = saved === "en" ? "en" : "ru";
    const savedFile = Number(localStorage.getItem("ui-selected-file"));
    const timer = window.setTimeout(() => {
      void loadWorkspace(Number.isFinite(savedFile) && savedFile > 0 ? savedFile : undefined, l)
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
    const containerWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    const proportionSum = topProportions.reduce((sum, value) => sum + value, 0) || 1;
    const startProps = topProportions.map((value) => (value / proportionSum) * containerWidth);
    topResizeRef.current = { index, startX: event.clientX, startProps };
    const onMove = (e: PointerEvent) => {
      if (!topResizeRef.current) return;
      const delta = e.clientX - topResizeRef.current.startX;
      const next = [...topResizeRef.current.startProps];
      const minWidth = index === 0 ? 160 : 220;
      const leftStart = topResizeRef.current.startProps[index];
      const rightStart = topResizeRef.current.startProps[index + 1];
      const safeDelta = Math.max(minWidth - leftStart, Math.min(rightStart - minWidth, delta));
      next[index] = leftStart + safeDelta;
      next[index + 1] = rightStart - safeDelta;
      const sum = next.reduce((a, b) => a + b, 0) || 1;
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
    return fullscreenPanel === name ? "fixed inset-0 z-50 flex flex-col" + (typeof window !== "undefined" && document.documentElement.getAttribute("data-theme") === "light" ? " bg-white" : " bg-[var(--bg-app)]") : "hidden";
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
    return activeProps[idx] / sum;
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
    return activeProps[idx] / sum;
  }

  // --- File tree operations ---

  function renderWorkspaceTreeNode(node: WorkspaceTreeNode, depth: number): React.ReactNode {
    const file = node.kind === "file" ? data?.files.find((candidate) => candidate.path === node.path) : null;
    const fileStatus = fileStatuses[node.path];
    const isSelected = selectedFileId === file?.id;
    const isSelectedDirectory = selectedDirectory === node.path;
    const isExpanded = node.kind === "directory" && expandedDirectories.includes(node.path);
    const isCreatingHere = createEntryDraft?.parentPath === node.path;

    return (
      <div key={`${node.kind}-${node.path}`}>
        <div className="group mb-0.5 flex items-center gap-0.5">
          {node.kind === "directory" ? (
            <button
              type="button"
              onClick={() => setExpandedDirectories((previous) => isExpanded ? previous.filter((path) => path !== node.path) : [...previous, node.path])}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              title={isExpanded ? "РЎРІРµСЂРЅСѓС‚СЊ РїР°РїРєСѓ" : "Р Р°Р·РІРµСЂРЅСѓС‚СЊ РїР°РїРєСѓ"}
            >
              {isExpanded ? "в–ѕ" : "в–ё"}
            </button>
          ) : <span className="h-6 w-6 shrink-0" />}
          <button
            type="button"
            onClick={() => {
              if (node.kind === "directory") {
                setSelectedDirectory(node.path);
                setStatus(locale === "ru" ? `РџР°РїРєР° РІС‹Р±СЂР°РЅР° РґР»СЏ СЃРѕР·РґР°РЅРёСЏ: ${node.path}` : `Folder selected for creation: ${node.path}`);
              } else {
                void selectWorkspaceFile(node);
              }
            }}
            onContextMenu={(event) => handleTreeContextMenu(event, node)}
            style={{ paddingLeft: `${Math.max(0, depth) * 10 + 4}px` }}
            className={`block min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${node.kind === "directory" ? isSelectedDirectory ? "bg-[var(--bg-selection)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]" : isSelected ? "bg-[#37373d] text-white" : "hover:bg-[var(--bg-hover)]"}`}
            title={node.path}
          >
            <span className="mr-1 text-[var(--text-accent)]">{node.kind === "directory" ? "рџ“Ѓ" : "в—†"}</span>
            <span className="truncate">{node.path.split("/").pop() || node.path}</span>
            {node.kind === "file" && fileStatus && fileStatus !== "saved" ? (
              <span className={`ml-1 text-[10px] ${fileStatus === "modified" ? "text-amber-300" : "text-[var(--text-accent)]"}`}>
                {fileStatus === "modified" ? "в—Џ" : "пј‹"}
              </span>
            ) : null}
          </button>
        </div>
        {node.kind === "directory" && isExpanded ? (
          <div>
            {isCreatingHere ? (
              <div className="mb-1 flex items-center gap-1 rounded border border-blue-400/60 bg-blue-500/10 px-2 py-1" style={{ marginLeft: `${(depth + 1) * 10 + 26}px` }}>
                <span className="text-[var(--text-accent)]">{createEntryDraft.kind === "directory" ? "рџ“Ѓ" : "рџ“„"}</span>
                <input
                  autoFocus
                  value={createEntryName}
                  onChange={(event) => setCreateEntryName(event.target.value)}
                  onKeyDown={handleCreateInputKeyDown}
                  placeholder={createEntryDraft.kind === "directory" ? "РРјСЏ РЅРѕРІРѕР№ РїР°РїРєРё" : "РРјСЏ РЅРѕРІРѕРіРѕ С„Р°Р№Р»Р°"}
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
                <button type="button" onClick={() => void submitCreateEntry()} className="text-emerald-300" title={t.create}>вњ“</button>
                <button type="button" onClick={cancelCreateEntry} className="text-red-300" title={t.close}>вњ•</button>
              </div>
            ) : null}
            {node.children.map((child) => renderWorkspaceTreeNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  function handleTreeContextMenu(e: React.MouseEvent, entry: WorkspaceTreeEntry) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }

  function beginCreateEntry(kind: "file" | "directory", parentPath = selectedDirectory) {
    if (!mainAgent) {
      setStatus(locale === "ru" ? "РЎРЅР°С‡Р°Р»Р° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅР°Р·РЅР°С‡РµРЅ Р“Р»Р°РІРЅС‹Р№ Р°РіРµРЅС‚" : "Assign a Lead Agent first");
      return;
    }
    if (busy) return;
    if (parentPath) {
      setExpandedDirectories((previous) => previous.includes(parentPath) ? previous : [...previous, parentPath]);
      setSelectedDirectory(parentPath);
    }
    setCreateEntryDraft({ kind, parentPath });
    setCreateEntryName(kind === "file" ? "" : "");
    setContextMenu(null);
    setStatus(locale === "ru" ? `Р’РІРµРґРёС‚Рµ РёРјСЏ ${kind === "file" ? "С„Р°Р№Р»Р°" : "РїР°РїРєРё"}` : `Enter ${kind === "file" ? "file" : "folder"} name`);
  }

  function cancelCreateEntry() {
    setCreateEntryDraft(null);
    setCreateEntryName("");
  }

  async function submitCreateEntry() {
    if (!createEntryDraft || !mainAgent) return;
    const rawName = createEntryName.trim();
    if (!rawName) {
      setStatus(locale === "ru" ? "Р’РІРµРґРёС‚Рµ РёРјСЏ" : "Enter a name");
      return;
    }
    if (/[\\\\/:*?"<>|]/.test(rawName) || rawName === "." || rawName === "..") {
      setStatus(locale === "ru" ? "РќРµРґРѕРїСѓСЃС‚РёРјРѕРµ РёРјСЏ С„Р°Р№Р»Р° РёР»Рё РїР°РїРєРё" : "Invalid file or folder name");
      return;
    }

    const name = rawName;
    const path = createEntryDraft.parentPath ? `${createEntryDraft.parentPath}/${name}` : name;
    if (workspaceTreeEntries.some((entry) => entry.path === path)) {
      setStatus(locale === "ru" ? "Р¤Р°Р№Р» РёР»Рё РїР°РїРєР° СЃ С‚Р°РєРёРј РёРјРµРЅРµРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓСЋС‚" : "An entry with this name already exists");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/workspace/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorAgentId: mainAgent.id, path, kind: createEntryDraft.kind }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "File operation failed");

      const createdKind = createEntryDraft.kind;
      const createdParent = createEntryDraft.parentPath;
      cancelCreateEntry();
      await loadWorkspace(selectedFileId, locale);
      if (createdKind === "file") setFileStatuses((previous) => ({ ...previous, [path]: "new" }));
      setStatus(locale === "ru" ? `${createdKind === "file" ? "Р¤Р°Р№Р»" : "РџР°РїРєР°"} СЃРѕР·РґР°РЅ: ${path}` : `${createdKind === "file" ? "File" : "Folder"} created: ${path}`);
      if (createdParent) setExpandedDirectories((previous) => previous.includes(createdParent) ? previous : [...previous, createdParent]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "File operation failed");
    } finally {
      setBusy(false);
    }
  }

  function handleCreateInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitCreateEntry();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCreateEntry();
    }
  }

  async function renameTreeEntry(filePath: string) {
    if (!mainAgent) {
      setStatus(locale === "ru" ? "РЎРЅР°С‡Р°Р»Р° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅР°Р·РЅР°С‡РµРЅ Р“Р»Р°РІРЅС‹Р№ Р°РіРµРЅС‚" : "Assign a Lead Agent first");
      return;
    }
    const nextPath = window.prompt(locale === "ru" ? "РќРѕРІРѕРµ РёРјСЏ РёР»Рё РїСѓС‚СЊ" : "New name or path", filePath);
    if (!nextPath?.trim() || nextPath.trim() === filePath) return;
    setBusy(true);
    try {
      const response = await fetch("/api/workspace/entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorAgentId: mainAgent.id, path: filePath, nextPath: nextPath.trim() }),
      });
      if (!response.ok) {
        setStatus(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Rename failed");
        return;
      }
      await loadWorkspace(null, locale, { clearSelection: true });
      setStatus(locale === "ru" ? `РџРµСЂРµРёРјРµРЅРѕРІР°РЅРѕ: ${nextPath.trim()}` : `Renamed: ${nextPath.trim()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTreeEntry(filePath: string) {
    if (!mainAgent) {
      setStatus(locale === "ru" ? "РЎРЅР°С‡Р°Р»Р° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅР°Р·РЅР°С‡РµРЅ Р“Р»Р°РІРЅС‹Р№ Р°РіРµРЅС‚" : "Assign a Lead Agent first");
      return;
    }
    if (!window.confirm(`${locale === "ru" ? "РЈРґР°Р»РёС‚СЊ" : "Delete"} ${filePath}?`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/workspace/entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorAgentId: mainAgent.id, path: filePath }),
      });
      if (!response.ok) {
        setStatus(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Delete failed");
        return;
      }
      await loadWorkspace(null, locale, { clearSelection: true });
      setStatus(locale === "ru" ? `РЈРґР°Р»РµРЅРѕ: ${filePath}` : `Deleted: ${filePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(false);
    }
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
      setOpenTabs([]);
      setSelectedFileId(null);
      setEditorText("");
      setExpandedDirectories([]);
      expandedDirectoriesInitializedRef.current = false;
      setStreamingMessages({});
      setOptimisticMessages([]);
      await loadWorkspace(null, locale, { clearSelection: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to connect folder");
    } finally {
      setBusy(false);
    }
  }

  async function saveApiKeys() {
    if (!settingsDirty) {
      setStatus(locale === "ru" ? "РќРµС‚ РёР·РјРµРЅРµРЅРёР№ РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ" : "No settings changes to save");
      return;
    }
    setBusy(true);
    try {
      let apiKeysPayload = apiKeysDraft;
      let githubTokenPayload = githubTokenDraft;
      let telegramTokenPayload = telegramTokenDraft;
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
            if (telegramTokenDraft.trim()) {
              telegramTokenPayload = await bridge.safeStorage.encryptString(telegramTokenDraft);
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
          autoApprove: autoApproveDraft,
          mobileAuthToken: mobileTokenDraft,
          localtunnelEnabled: localtunnelEnabledDraft,
          localtunnelUrl,
          telegramToken: telegramTokenPayload,
          telegramChatId: telegramChatIdDraft,
          fallbackModels: fallbackModelsDraft.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
          removeApiKeys: Object.entries(apiKeysToRemove).filter(([, remove]) => remove).map(([provider]) => provider),
          removeGithubToken,
          removeTelegramToken,
          previewCommand: previewCommandDraft,
          previewPort: previewPortDraft,
          previewUrl,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Settings update failed");
      }
      await loadWorkspace(selectedFileId, locale);
      setApiKeysDraft({});
      setApiKeysToRemove({});
      setGithubTokenDraft("");
      setRemoveGithubToken(false);
      setTelegramTokenDraft("");
      setRemoveTelegramToken(false);
      setStatus(locale === "ru" ? "РќР°СЃС‚СЂРѕР№РєРё СЃРѕС…СЂР°РЅРµРЅС‹" : "Settings saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Settings update failed");
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
    if (!newAgent.name.trim()) {
      setStatus(locale === "ru" ? "Р’РІРµРґРёС‚Рµ РёРјСЏ Р°РіРµРЅС‚Р°" : "Enter an agent name");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAgent, locale }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Agent creation failed");
      }
      setNewAgent(emptyNewAgent({}, (data?.agents ?? []).map((a) => a.color ?? ROLE_COLORS[a.role] ?? "")));
      await loadWorkspace(selectedFileId, locale);
      setShowAddAgent(false);
      setStatus(locale === "ru" ? "РђРіРµРЅС‚ СЃРѕР·РґР°РЅ" : "Agent created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Agent creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function setMainCoder(agentId: number) {
    setBusy(true);
    try {
      const response = await fetch("/api/agents/main", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, locale }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to set Lead agent");
      }
      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? "Р“Р»Р°РІРЅС‹Р№ Р°РіРµРЅС‚ РЅР°Р·РЅР°С‡РµРЅ" : "Lead agent assigned");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to set Lead agent");
    } finally {
      setBusy(false);
    }
  }

  const saveFileRef = useRef<() => void>(() => {});
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
  saveFileRef.current = saveFile;

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

  async function pushToGithub(credentials?: { token?: string; repo?: string }) {
    if (!credentials && (!data?.settings.githubTokenConfigured || !data.settings.githubRepo)) {
      setGithubPushToken("");
      setGithubPushRepo(data?.settings.githubRepo ?? "");
      setGithubModalOpen(true);
      return;
    }

    setBusy(true);
    setGithubPushLoading(true);
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, ...credentials }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!res.ok) {
        if (payload?.code === "GITHUB_CREDENTIALS_REQUIRED") {
          setGithubPushToken("");
          setGithubPushRepo(data?.settings.githubRepo ?? "");
          setGithubModalOpen(true);
          return;
        }
        throw new Error(payload?.error ?? "github push error");
      }
      setGithubModalOpen(false);
      await loadWorkspace(selectedFileId, locale);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setGithubPushLoading(false);
      setBusy(false);
    }
  }

  async function clearHistory(channel: ChatChannel) {
    if (!window.confirm(locale === "ru" ? "РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ СЌС‚РѕРіРѕ С‡Р°С‚Р°?" : "Clear this chat history?")) return;
    try {
      const response = await fetch(`/api/chat/history?channel=${channel}`, { method: "DELETE" });
      if (!response.ok) throw new Error("History clear failed");
      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? "РСЃС‚РѕСЂРёСЏ РѕС‡РёС‰РµРЅР°" : "History cleared");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "History clear failed");
    }
  }

  async function toggleLocaltunnel(enabled: boolean) {
    localtunnelAutoStartRef.current = enabled;
    setLocaltunnelEnabledDraft(enabled);
    setLocaltunnelLoading(true);
    try {
      const response = await fetch("/api/localtunnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enabled ? "start" : "stop" }),
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Localtunnel error");
      setLocaltunnelUrl(payload?.url ?? "");
      await loadWorkspace(selectedFileId, locale);
    } catch (error) {
      setLocaltunnelEnabledDraft(false);
      setStatus(error instanceof Error ? error.message : "Localtunnel error");
    } finally {
      setLocaltunnelLoading(false);
    }
  }

  async function sendChat(channel: ChatChannel, message: string, duplicate = false, attachmentsOverride?: ChatAttachment[]) {
    const outgoingAttachments = attachmentsOverride ?? pendingAttachments;
    if (chatAbortRef.current || (!message.trim() && outgoingAttachments.length === 0)) return;

    const controller = new AbortController();
    chatAbortRef.current = controller;
    const optimisticContent = message.trim() || (locale === "ru" ? "[РїСЂРёРєСЂРµРїР»РµРЅС‹ РјР°С‚РµСЂРёР°Р»С‹]" : "[materials attached]");
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
        agentName: locale === "ru" ? "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ" : "User",
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
          streamError ??= new Error(locale === "ru" ? "РџРѕР»СѓС‡РµРЅРѕ РЅРµРєРѕСЂСЂРµРєС‚РЅРѕРµ СЃРѕР±С‹С‚РёРµ РѕС‚ LLM" : "Received an invalid LLM stream event");
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
          const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
          void bridge?.notify?.({
            title: locale === "ru" ? `вњ… ${event.identity.displayName} Р·Р°РІРµСЂС€РёР» Р·Р°РґР°С‡Сѓ` : `вњ… ${event.identity.displayName} completed the task`,
            body: event.content.slice(0, 120),
          });
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
          const httpStatus = event.status === 403 || event.status === 429 ? event.status : undefined;
          const accessError = httpStatus !== undefined
            ? `РћС€РёР±РєР° РґРѕСЃС‚СѓРїР° Рє РјРѕРґРµР»Рё (HTTP ${httpStatus}). РЎРјРµРЅРёС‚Рµ РјРѕРґРµР»СЊ РІ РќР°СЃС‚СЂРѕР№РєР°С… РЅР° qwen/qwen-2.5-coder-32b-instruct:free РёР»Рё google/gemini-2.0-flash-lite-001:free`
            : undefined;
          setStreamingMessages((previous) => {
            const current = previous[identity.agentId];
            return {
              ...previous,
              [identity.agentId]: finishStream(current, event.channel as ChatChannel, identity, "", "error", accessError ?? event.message, new Date().toISOString(), httpStatus === 429),
            };
          });
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
      // Details are available in the Logs / System Events panel.
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
      setChatRunning(false);
      setBusy(false);
    }
  }

  function stopChat() {
    chatAbortRef.current?.abort();
  }

  async function startPreview() {
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/preview", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Preview failed");
      setPreviewUrl(payload?.url ?? "");
      await loadWorkspace(selectedFileId, locale);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function reloadPreview() {
    if (!previewUrl) return startPreview();
    await startPreview();
  }

  async function sendPreviewFeedback(value: string) {
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: value }),
      });
      if (!response.ok) throw new Error("Preview feedback failed");
      setStatus(locale === "ru" ? "РљРѕРјРјРµРЅС‚Р°СЂРёР№ РѕС‚РїСЂР°РІР»РµРЅ Р”РёР·Р°Р№РЅРµСЂСѓ" : "Feedback sent to the Designer");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Preview feedback failed");
    }
  }

  async function testTelegram() {
    setTelegramTesting(true);
    try {
      await saveApiKeys();
      const response = await fetch("/api/telegram/test", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: string; username?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Telegram connection failed");
      await fetch("/api/telegram/poll", { method: "POST" });
      setStatus(locale === "ru" ? `Telegram РїРѕРґРєР»СЋС‡С‘РЅ${payload?.username ? `: @${payload.username}` : ""}` : `Telegram connected${payload?.username ? `: @${payload.username}` : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Telegram connection failed");
    } finally {
      setTelegramTesting(false);
    }
  }

  async function generateTemplate() {
    const directory = workspaceRootDraft.trim();
    if (!directory) {
      setStatus(locale === "ru" ? "РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ РїР°РїРєСѓ РїСЂРѕРµРєС‚Р°" : "Choose a project folder first");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateId, directory }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; files?: string[] } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Template generation failed");
      setTemplateOpen(false);
      await loadWorkspace(null, locale);
      setStatus(locale === "ru" ? `РџСЂРµСЃРµС‚ СЃРѕР·РґР°РЅ: ${payload?.files?.length ?? 0} С„Р°Р№Р»РѕРІ` : `Preset created: ${payload?.files?.length ?? 0} files`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Template generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function runTerminal(event: FormEvent) {
    event.preventDefault();
    if (!terminalCommand.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: terminalCommand, locale }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Terminal command failed");
      }
      setTerminalCommand("");
      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? "РљРѕРјР°РЅРґР° РІС‹РїРѕР»РЅРµРЅР°" : "Command completed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Terminal command failed");
    } finally {
      setBusy(false);
    }
  }

  async function importOwnFiles() {
    if (importFiles.length === 0) {
      setStatus(locale === "ru" ? "Р’С‹Р±РµСЂРёС‚Рµ С„Р°Р№Р»С‹ РґР»СЏ РёРјРїРѕСЂС‚Р°" : "Choose files to import");
      return;
    }
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

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Import failed");
      }
      setImportFiles([]);
      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? `РРјРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ С„Р°Р№Р»РѕРІ: ${filesPayload.length}` : `Imported files: ${filesPayload.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
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
            <div key={`img-${index}`} className="rounded border border-[var(--border-default)] p-2">
              {att.name ? <p className="mb-1 text-[11px] text-[var(--text-secondary)]">{att.name}</p> : null}
              {att.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URLs
                <img src={att.url} alt={att.name ?? "attachment"} className="max-h-44 rounded object-contain" />
              ) : null}
            </div>
          ) : (
            <div key={`link-${index}`} className="rounded border border-[var(--border-default)] bg-[var(--bg-app)] p-2 text-xs">
              {att.url ? (
                <a href={att.url} target="_blank" rel="noreferrer" className="text-[var(--text-accent)] underline">
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
    if (messageStatus === "error") return "text-red-300";
    if (messageStatus === "cancelled") return "text-amber-200";
    if (messageStatus === "sending" || messageStatus === "streaming") return "text-blue-300";
    return "text-emerald-300";
  }

  function eventTone(level: string) {
    if (level === "error") return { border: "border-red-500/30", background: "bg-red-500/10", text: "text-red-200", dot: "bg-red-400" };
    if (level === "warning") return { border: "border-amber-500/30", background: "bg-amber-500/10", text: "text-amber-200", dot: "bg-amber-400" };
    if (level === "success") return { border: "border-emerald-500/30", background: "bg-emerald-500/10", text: "text-emerald-200", dot: "bg-emerald-400" };
    return { border: "border-slate-700", background: "bg-slate-900/60", text: "text-slate-200", dot: "bg-blue-400" };
  }

  async function toggleAutoApprove(enabled: boolean) {
    setAutoApproveDraft(enabled);
    setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApprove: enabled }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Auto mode update failed");
      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? `AUTO ${enabled ? "РІРєР»СЋС‡С‘РЅ" : "РІС‹РєР»СЋС‡РµРЅ"}` : `AUTO ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      setAutoApproveDraft(!enabled);
      setStatus(error instanceof Error ? error.message : "Auto mode update failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateSystemReport() {
    let events = data?.systemEvents ?? [];
    try {
      const response = await fetch("/api/system-events?limit=100", { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { events?: WorkspaceData["systemEvents"] };
        events = payload.events ?? events;
      }
    } catch {
      // Use the already loaded snapshot if the report refresh is unavailable.
    }
    const lines = events.slice(0, 100).reverse().map((event) => `- **${event.level.toUpperCase()}** ${event.source} вЂ” ${event.message} _( ${new Date(event.createdAt).toLocaleString(locale)} )_`);
    const markdown = `# Multi-Agent Code Studio вЂ” СЃРёСЃС‚РµРјРЅС‹Р№ РѕС‚С‡С‘С‚

РЎС„РѕСЂРјРёСЂРѕРІР°РЅ: ${new Date().toISOString()}

${lines.length > 0 ? lines.join("\n") : "_РЎРёСЃС‚РµРјРЅС‹С… СЃРѕР±С‹С‚РёР№ РЅРµС‚._"}`;
    setReportText(markdown);
    setReportOpen(true);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      setStatus(locale === "ru" ? "РћС‚С‡С‘С‚ СЃРєРѕРїРёСЂРѕРІР°РЅ" : "Report copied");
    } catch {
      setStatus(locale === "ru" ? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ РѕС‚С‡С‘С‚" : "Failed to copy report");
    }
  }

  async function clearSystemEvents() {
    setBusy(true);
    try {
      const response = await fetch("/api/system-events", { method: "DELETE" });
      if (!response.ok) throw new Error("System events clear failed");
      setData((previous) => previous ? { ...previous, systemEvents: [], findings: previous.findings } : previous);
      setStatus(locale === "ru" ? "Р›РѕРіРё РѕС‡РёС‰РµРЅС‹" : "Logs cleared");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "System events clear failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearTerminal() {
    setBusy(true);
    try {
      const response = await fetch("/api/terminal", { method: "DELETE" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? "Terminal clear failed");
      await loadWorkspace(selectedFileId, locale);
      setStatus(locale === "ru" ? "РўРµСЂРјРёРЅР°Р» РѕС‡РёС‰РµРЅ" : "Terminal cleared");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Terminal clear failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage(messageId: number | string, content: string) {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        // Fallback for Electron / older environments
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId((current) => current === messageId ? null : current), 1500);
    } catch {
      setStatus(locale === "ru" ? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ" : "Failed to copy message");
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
        <article key={`stream-${message.identity.agentId}`} className="mr-auto w-fit max-w-[92%] rounded border border-[#007acc] bg-[var(--bg-panel)] p-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[11px] text-[var(--text-accent)]"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: agentColorForIdentity(message.identity) }} />{agentHeader(message.identity, message.identity.displayName)}</p>
            <span className={`text-[10px] ${statusClass(message.status)}`}>{statusLabel(message.status)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{sanitizeChatContent(message.content, locale) || "вЂ¦"}</p>
          {message.status === "error" ? (
            // UX fix (log routing): raw provider errors stay out of chat вЂ” a
            // compact status chip is shown instead; full details are recorded
            // in the Logs / System events panel by the backend.
            <p className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
              вљ пёЏ {locale === "ru"
                ? "РњРѕРґРµР»СЊ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅР° (Р»РёРјРёС‚ Р·Р°РїСЂРѕСЃРѕРІ РёР»Рё РѕС€РёР±РєР° РґРѕСЃС‚СѓРїР°). РџРѕРґСЂРѕР±РЅРѕСЃС‚Рё вЂ” РІ РїР°РЅРµР»Рё В«Р›РѕРіРё / РЎРёСЃС‚РµРјРЅС‹Рµ СЃРѕР±С‹С‚РёСЏВ»."
                : "Model is temporarily unavailable (rate limit or access error). Details are in the Logs / System events panel."}
            </p>
          ) : null}
          {renderMessageActions(`stream-${message.identity.agentId}`, message.content, false)}
        </article>
      ));
  }

  // --- Collapsed panel strip ---

  function collapsedStrip(name: PanelName, label: string, vertical = true) {
    const collapsed = collapsedPanels[name];
    if (!collapsed) return null;
    const accent = PANEL_ACCENTS[name] ?? "#4fc1ff";
    const icon = PANEL_ICONS[name] ?? "в–¦";
    // UX fix (color indication): a bright accent badge with the panel name
    // stays visible while collapsed, so any panel can be restored in 1 click.
    const badgeStyle: React.CSSProperties = {
      background: `color-mix(in srgb, ${accent} 22%, var(--bg-panel))`,
      border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`,
      boxShadow: `inset ${vertical ? "3px" : "0"} 0 0 0 ${accent}`,
    };
    if (vertical) {
      return (
        <div className="flex flex-col items-center justify-center gap-1 py-1" style={{ ...badgeStyle, width: COLLAPSED_SIDE, minHeight: 32 }}>
          <button type="button" onClick={() => toggleCollapse(name)} title={`${t.expand}: ${label}`} className="flex h-7 w-7 items-center justify-center rounded text-xs hover:bg-white/10" style={{ color: accent }}>
            {icon}
          </button>
          <button type="button" onClick={() => toggleCollapse(name)} title={t.expand} className="max-w-full flex-1 select-none px-0.5 text-[9px] font-semibold uppercase tracking-wide hover:bg-white/5" style={{ color: accent, writingMode: "vertical-rl" }}>
            {label}
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2 px-2" style={{ ...badgeStyle, height: COLLAPSED_BOTTOM, minHeight: 32 }}>
        <button type="button" onClick={() => toggleCollapse(name)} title={`${t.expand}: ${label}`} className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-white/10" style={{ color: accent }}>
          {icon}
        </button>
        <button type="button" onClick={() => toggleCollapse(name)} title={t.expand} className="select-none whitespace-nowrap text-[11px] font-semibold hover:bg-white/5" style={{ color: accent }}>
          {label}
        </button>
        <button type="button" onClick={() => toggleCollapse(name)} title={t.expand} className="text-xs" style={{ color: accent }}>в–ё</button>
      </div>
    );
  }

  // Computed top flex grow values
  const topGrows = [topFlexGrow(0), topFlexGrow(1), topFlexGrow(2), topFlexGrow(3)];
  const bottomGrows = [bottomFlexGrow(0), bottomFlexGrow(1)];

  return (
    <main className="app-container h-screen w-screen overflow-hidden relative" style={{ background: "var(--bg-app)", color: "var(--text-primary)" }}>
      {/* Auto-update banner */}
      {updateVersion && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 16px",
            background: updateDownloaded ? "linear-gradient(135deg, #1a3a1a, #0d2818)" : "linear-gradient(135deg, #1a2a4a, #0d1a30)",
            borderBottom: updateDownloaded ? "1px solid #2ea04360" : "1px solid #1f6feb60",
            color: "#e6edf3",
            fontSize: 12,
          }}
        >
          <span style={{ fontSize: 16 }}>{updateDownloaded ? "вњ…" : "рџ”„"}</span>
          <span style={{ flex: 1 }}>
            {updateDownloaded
              ? locale === "ru" ? `РћР±РЅРѕРІР»РµРЅРёРµ v${updateVersion} Р·Р°РіСЂСѓР¶РµРЅРѕ Рё РіРѕС‚РѕРІРѕ Рє СѓСЃС‚Р°РЅРѕРІРєРµ.` : `Update v${updateVersion} downloaded and ready to install.`
              : locale === "ru" ? `Р”РѕСЃС‚СѓРїРЅР° РЅРѕРІР°СЏ РІРµСЂСЃРёСЏ v${updateVersion}` : `New version v${updateVersion} available`}
          </span>
          <button
            type="button"
            onClick={() => {
              const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
              void bridge?.installUpdate?.();
            }}
            style={{
              background: updateDownloaded ? "#238636" : "#1f6feb",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              padding: "4px 14px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {locale === "ru" ? "РџРµСЂРµР·Р°РїСѓСЃС‚РёС‚СЊ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ" : "Restart to update"}
          </button>
        </div>
      )}
      <header className="app-header flex items-center justify-between gap-4 border-b px-3" style={{ borderColor: "var(--border-default)", background: "var(--bg-panel)" }}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-lg">рџ‘‘</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-amber-300">Multi-Agent Code Studio</div>
            <div className="truncate text-[9px] tracking-[0.08em] text-slate-500">AUTONOMOUS AI DEVELOPMENT COMPLEX</div>
          </div>
        </div>
        <div className="hidden min-w-0 items-center gap-2 xl:flex">
          <span className={`rounded-full border px-3 py-1 text-[10px] ${busy ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
            {busy ? "рџџЎ Р’С‹РїРѕР»РЅСЏРµС‚СЃСЏ" : "рџџў РЎС‚Р°С‚СѓСЃ: РћР¶РёРґР°РЅРёРµ"}
          </span>
          {[
            ["РљР»СЋС‡РµР№", Object.values(data?.settings.apiKeysConfigured ?? {}).filter(Boolean).length],
            ["РђРіРµРЅС‚РѕРІ", data?.agents.length ?? 0],
            ["РЎРѕРѕР±С‰РµРЅРёР№", data?.messages.length ?? 0],
            ["Р¤Р°Р№Р»РѕРІ", data?.files.length ?? 0],
          ].map(([label, value]) => (
            <span key={label} className="min-w-[58px] rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-center">
              <strong className="block text-xs text-slate-100">{value}</strong>
              <small className="block text-[9px] text-slate-500">{label}</small>
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setPreviewOpen(true)} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-xs hover:border-blue-400" title={locale === "ru" ? "РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ РїСЂРѕРµРєС‚Р°" : "Project preview"}>
            рџ‘ЃпёЏ {locale === "ru" ? "РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ" : "Preview"}
          </button>
          <button type="button" onClick={() => void pushToGithub()} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50" disabled={busy}>
            {t.pushGithub}
          </button>
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-black shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
          >
            {t.donateBtn}
          </button>
          <button
            type="button"
            onClick={() => {
              const bridge = (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge;
              bridge?.toggleOverlay?.();
            }}
            className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-xs hover:border-blue-400"
            title={locale === "ru" ? "РџРѕРІРµСЂС… РІСЃРµС… РѕРєРѕРЅ (Ctrl+Shift+O)" : "Always on top (Ctrl+Shift+O)"}
          >
            рџ“Њ {locale === "ru" ? "Р’РёРґР¶РµС‚" : "Widget"}
          </button>
          <button type="button" onClick={() => setOrchestratorOpen(true)} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-xs hover:border-blue-400">
            рџ¤– {locale === "ru" ? "РћСЂРєРµСЃС‚СЂР°С‚РѕСЂ" : "Orchestrator"}
          </button>
          <ThemeToggle />
          <button type="button" onClick={() => void generateSystemReport()} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-xs hover:border-blue-400">
            рџ“„ {locale === "ru" ? "РЎС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РѕС‚С‡С‘С‚" : "Generate report"}
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-xs hover:border-blue-400">
            вљ™пёЏ {t.settings}
          </button>
        </div>
      </header>

      {/* Main content area: flex column, top flex area + resizer + bottom area */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Full-height side panels with a central editor/terminal work area. */}
        <div className="workspace-top-row flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          {/* Explorer / File Tree */}
          <div className={`workspace-column ${collapsedPanels.explorer ? "workspace-column-collapsed" : ""} relative panel-accent-explorer ${panelClass("explorer")}`} style={{ flex: collapsedPanels.explorer ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[0]} 1 0%` }}>
            {collapsedStrip("explorer", t.explorer)}
            {!collapsedPanels.explorer && (
              <section className="panel h-full border-r" style={{ borderColor: "var(--border-default)" }}>
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.explorer}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => beginCreateEntry("file")} title={selectedDirectory ? `${t.newFile}: ${selectedDirectory}` : t.newFile} className="rounded px-1.5 py-0.5 text-xs hover:bg-[#3a3d41]">рџ“„</button>
                    <button type="button" onClick={() => beginCreateEntry("directory")} title={selectedDirectory ? `${t.newFolder}: ${selectedDirectory}` : t.newFolder} className="rounded px-1.5 py-0.5 text-xs hover:bg-[#3a3d41]">рџ“Ѓ</button>
                    {renderCollapseButton("explorer")}
                    {renderExpandButton("explorer")}
                  </div>
                </div>
                <div className="border-b border-[var(--border-default)] p-2">
                  <div className="relative">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.searchPlaceholder}
                      className="w-full rounded-md border border-[var(--border-input)] bg-[var(--bg-app)] px-2 py-1.5 text-[10px] outline-none focus:border-blue-400"
                    />
                    {searchQuery && searchResults.length > 0 ? (
                      <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[260px] overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-xl">
                        {searchResults.map((r, i) => (
                          <button key={`${r.path}:${r.line}:${i}`} type="button" onClick={() => { const entry = workspaceTreeEntries.find((e) => e.path === r.path); if (entry) { void selectWorkspaceFile(entry); setSearchQuery(""); setSearchResults([]); } }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[10px] hover:bg-[var(--bg-hover)]">
                            <span className="truncate text-emerald-300">{r.path}</span><span className="text-slate-500">:{r.line}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1">
                  {createEntryDraft?.parentPath === "" ? (
                    <div className="mb-1 flex items-center gap-1 rounded border border-blue-400/60 bg-blue-500/10 px-2 py-1">
                      <span className="text-[var(--text-accent)]">{createEntryDraft.kind === "directory" ? "рџ“Ѓ" : "рџ“„"}</span>
                      <input autoFocus value={createEntryName} onChange={(event) => setCreateEntryName(event.target.value)} onKeyDown={handleCreateInputKeyDown} placeholder={createEntryDraft.kind === "directory" ? t.newFolder : t.newFile} className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
                      <button type="button" onClick={() => void submitCreateEntry()} className="text-emerald-300" title={t.create}>вњ“</button>
                      <button type="button" onClick={cancelCreateEntry} className="text-red-300" title={t.close}>вњ•</button>
                    </div>
                  ) : null}
                  {workspaceTree.map((node) => renderWorkspaceTreeNode(node, 0))}
                </div>
              </section>
            )}
          </div>

          {/* Column resizer 0->1 */}
          {!collapsedPanels.explorer && !collapsedPanels.editor && (
            <div className="z-10 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]" onPointerDown={(e) => startTopResize(0, e)} />
          )}

          {/* Editor */}
          <div className={`workspace-column ${collapsedPanels.editor ? "workspace-column-collapsed" : ""} relative panel-accent-editor ${panelClass("editor")}`} style={{ flex: collapsedPanels.editor ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[1]} 1 0%` }}>
            {collapsedStrip("editor", t.editor)}
            {!collapsedPanels.editor && (
              <section className="panel h-full border-r" style={{ borderColor: "var(--border-default)" }}>
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.editor} вЂ” {selectedFile?.path ?? t.noFile}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={rollbackFile} disabled={!selectedFile || !mainAgent || busy} className="rounded bg-[#5a3c2b] px-2 py-1 text-xs text-white disabled:opacity-60">
                      {t.rollback}
                    </button>
                    <button type="button" onClick={saveFile} disabled={!selectedFile || !mainAgent || busy || fileStatuses[selectedFile?.path ?? ""] !== "modified"} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">
                      {t.saveMain}
                    </button>
                    {renderCollapseButton("editor")}
                    {renderExpandButton("editor")}
                  </div>
                </div>
                {/* Tab bar */}
                <div className="flex items-center overflow-x-auto border-b border-[var(--border-default)] bg-[var(--bg-app)]">
                  {openTabs.map((tab) => (
                    <div
                      key={tab.id}
                      onClick={() => { setSelectedFileId(tab.id); setEditorText(tab.content); }}
                      className={`flex shrink-0 cursor-pointer items-center gap-1 border-r px-3 py-1 text-[11px] ${tab.id === selectedFileId ? "bg-[var(--bg-selection)] text-white" : "hover:bg-[var(--bg-hover)]"}`}
                      style={{ borderColor: "var(--border-default)", color: tab.id === selectedFileId ? undefined : "var(--text-secondary)" }}
                    >
                      <span className="max-w-[120px] truncate">{tab.path.split("/").pop() || tab.path}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} className="ml-1 rounded-full px-1 text-[10px] hover:bg-slate-700">вњ•</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => beginCreateEntry("file")} disabled={busy || !mainAgent} title={selectedDirectory ? `${t.newFile}: ${selectedDirectory}` : t.newFile} className="shrink-0 px-3 py-1 text-[11px] text-[var(--text-secondary)] hover:text-white disabled:opacity-50">пј‹ РќРѕРІС‹Р№ С„Р°Р№Р»</button>
                </div>
                {selectedFile ? (
                  <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--bg-app)] text-xs text-[var(--text-secondary)]">Loading editor...</div>}>
                    <CodeEditor
                      filePath={selectedFile.path}
                      value={editorText}
                      onChange={(v) => {
                        setEditorText(v);
                        if (selectedFile) setFileStatuses((previous) => ({ ...previous, [selectedFile.path]: v === selectedFile.content ? "saved" : "modified" }));
                        setOpenTabs((prev) => prev.map((t) => t.id === selectedFile.id ? { ...t, content: v } : t));
                      }}
                      onSave={saveFile}
                    />
                  </Suspense>
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--bg-app)] text-xs text-[var(--text-secondary)]">{t.noFile}</div>
                )}
              </section>
            )}
          </div>

          {/* Column resizer 1->2 */}
          {!collapsedPanels.editor && !collapsedPanels.lead && (
            <div className="z-10 w-1 cursor-col-resize bg-transparent hover:bg-[#007acc]" onPointerDown={(e) => startTopResize(1, e)} />
          )}

          {/* Lead Chat */}
          <div className={`workspace-column ${collapsedPanels.lead ? "workspace-column-collapsed" : ""} relative panel-accent-lead ${panelClass("lead")}`} style={{ flex: collapsedPanels.lead ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[2]} 1 0%` }}>
            {collapsedStrip("lead", t.leadChat)}
            {!collapsedPanels.lead && (
              <section className="panel h-full border-r" style={{ borderColor: "var(--border-default)" }}>
                <div className="panel-header chat-panel-header">
                  <div className="chat-panel-title">
                    <span className="truncate">{t.leadChat}</span>
                    <span className={`shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] ${contextStats.compressed ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-600 text-slate-400"}`}>РџР°РјСЏС‚СЊ: {contextStats.percent}%{contextStats.compressed ? " | РЎР¶Р°С‚Рѕ" : ""}</span>
                  </div>
                  <div className="chat-panel-actions relative">
                    <span className="text-[10px] text-[var(--text-secondary)]">РђРіРµРЅС‚РѕРІ: {data?.agents.length ?? 0} В· РђРєС‚РёРІРЅС‹: {data?.agents.filter((agent) => agent.isActive).length ?? 0}</span>
                    <button type="button" onClick={() => setTemplateMenu((current) => current === "lead" ? null : "lead")} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-[10px] hover:border-blue-400">рџ“љ РЁР°Р±Р»РѕРЅС‹ Р·Р°РґР°С‡</button>
                    {renderTaskTemplates("lead")}
                    <button type="button" onClick={() => void clearHistory("lead")} title={locale === "ru" ? "РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ" : "Clear history"} className="rounded px-1.5 py-1 text-xs hover:bg-[#3a3d41]">рџ—‘пёЏ</button>
                    {renderCollapseButton("lead")}
                    {renderExpandButton("lead")}
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {leadMessages?.map((msg) => (
                    <article key={msg.id} className={`w-fit max-w-[92%] rounded border p-2 text-sm ${msg.senderType === "user" ? "ml-auto border-[#007acc] bg-[#0e639c] text-white" : "mr-auto border-[var(--border-default)] bg-[var(--bg-panel)]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: messageColor(msg) }} />{messageHeader(msg)} В· {new Date(msg.createdAt).toLocaleTimeString(locale)}</p>
                        {msg.status ? <span className={`text-[10px] ${statusClass(msg.status)}`}>{statusLabel(msg.status)}</span> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{sanitizeChatContent(msg.content, locale)}</p>
                      {renderAttachments(msg.metadata?.attachments)}
                      {msg.senderType !== "user" && msg.senderType !== "system" ? renderMessageActions(msg.id, msg.content) : null}
                      {msg.status === "error" && retryRequest?.optimisticIds.includes(msg.id) ? renderMessageActions(`retry-${msg.id}`, "", true, false) : null}
                    </article>
                  ))}
                  {renderStreamingMessages("lead")}
                  <div ref={leadChatEndRef} aria-hidden="true" />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); void sendChat("lead", leadMessage); }} className="border-t border-[#2d2d30] p-3">
                  <div className="mb-1 flex flex-wrap gap-1">
                    {["/fix", "/explain", "/test", "/refactor", "/docs"].map((cmd) => (
                      <button key={cmd} type="button" onClick={() => quickCommand(`${cmd} `, "lead")} className="rounded bg-[var(--bg-panel-alt)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-[#3a3d41]">{cmd}</button>
                    ))}
                    {sortAgents(data?.agents ?? []).map((agent) => (
                      <button key={`@-lead-${agent.id}`} type="button" onClick={() => quickCommand(`@${agent.name} `, "lead")} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-[var(--bg-panel-alt)]" style={{ color: agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff" }}>@{agent.name}</button>
                    ))}
                  </div>
                  <div className="relative flex gap-2">
                    {renderMentionSuggestions("lead")}
                    <textarea data-chat-channel="lead" value={leadMessage} onChange={(e) => handleMentionInput("lead", e.target.value, e.target.selectionStart ?? e.target.value.length)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} disabled={chatRunning} rows={2} className="w-full resize-y rounded border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 text-sm outline-none disabled:opacity-60" />
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
          <div className={`workspace-column ${collapsedPanels.group ? "workspace-column-collapsed" : ""} relative panel-accent-group ${panelClass("group")}`} style={{ flex: collapsedPanels.group ? `0 0 ${COLLAPSED_SIDE}px` : `${topGrows[3]} 1 0%` }}>
            {collapsedStrip("group", t.allChat)}
            {!collapsedPanels.group && (
              <section className="panel h-full">
                <div className="panel-header chat-panel-header">
                  <div className="chat-panel-title">
                    <span className="truncate">{t.allChat}</span>
                    <span className={`shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] ${contextStats.compressed ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-600 text-slate-400"}`}>РџР°РјСЏС‚СЊ: {contextStats.percent}%{contextStats.compressed ? " | РЎР¶Р°С‚Рѕ" : ""}</span>
                  </div>
                  <div className="chat-panel-actions relative">
                    <span className="text-[10px] text-[var(--text-secondary)]">РђРіРµРЅС‚РѕРІ: {data?.agents.length ?? 0} В· РђРєС‚РёРІРЅС‹: {data?.agents.filter((agent) => agent.isActive).length ?? 0}</span>
                    <button type="button" onClick={() => setTemplateMenu((current) => current === "group" ? null : "group")} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-[10px] hover:border-blue-400">рџ“љ РЁР°Р±Р»РѕРЅС‹ Р·Р°РґР°С‡</button>
                    {renderTaskTemplates("group")}
                    {(["all", "tester", "uiux", "architect"] as GroupRoleFilter[]).map((filter) => (
                      <button key={filter} type="button" onClick={() => setGroupRoleFilter(filter)} className={`rounded-full border px-1.5 py-0.5 text-[9px] ${groupRoleFilter === filter ? "border-blue-400 bg-blue-500/20 text-blue-200" : "border-[var(--border-default)] text-[var(--text-muted)] hover:text-white"}`}>
                        {filter === "all" ? "Р’СЃРµ" : filter === "tester" ? "QA" : filter === "uiux" ? "UI/UX" : "РђСЂС…РёС‚РµРєС‚РѕСЂ"}
                      </button>
                    ))}
                    <label className="flex items-center gap-1 rounded border border-[var(--border-default)] px-1.5 py-1 text-[9px] text-[var(--text-muted)]" title="РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СѓС‚РІРµСЂР¶РґР°С‚СЊ С†РёРєР»">
                      <span>AUTO</span>
                      <input type="checkbox" checked={autoApproveDraft} onChange={(event) => void toggleAutoApprove(event.target.checked)} disabled={busy} />
                    </label>
                    <button type="button" onClick={() => void clearHistory("group")} title={locale === "ru" ? "РћС‡РёСЃС‚РёС‚СЊ РёСЃС‚РѕСЂРёСЋ" : "Clear history"} className="rounded px-1.5 py-1 text-xs hover:bg-[var(--bg-panel-alt)]">рџ—‘пёЏ</button>
                    {renderCollapseButton("group")}
                    {renderExpandButton("group")}
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {groupMessages?.map((msg) => (
                    <article key={msg.id} className={`w-fit max-w-[92%] rounded border p-2 text-sm ${msg.senderType === "user" ? "ml-auto border-[#007acc] bg-[#0e639c] text-white" : "mr-auto border-[var(--border-default)] bg-[var(--bg-panel)]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: messageColor(msg) }} />{messageHeader(msg)} В· {new Date(msg.createdAt).toLocaleTimeString(locale)}</p>
                        {msg.status ? <span className={`text-[10px] ${statusClass(msg.status)}`}>{statusLabel(msg.status)}</span> : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{sanitizeChatContent(msg.content, locale)}</p>
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
                    {duplicateToLead ? <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>вљ пёЏ {locale === "ru" ? "РўРѕР»СЊРєРѕ Р“Р»Р°РІРЅС‹Р№ Р°РіРµРЅС‚ РІРёРґРµРЅ РІ С‡Р°С‚Рµ СЃ Р“Р»Р°РІРЅС‹Рј" : "Only Lead Agent visible in Lead Chat"}</span> : null}
                  </div>
                  <div className="mb-2 flex gap-2">
                    <input value={attachmentLink} onChange={(e) => setAttachmentLink(e.target.value)} placeholder={t.attachLink} className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-panel)] px-2 py-1 text-xs" />
                    <button type="button" onClick={addLinkAttachment} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.addLink}</button>
                    <label className="cursor-pointer rounded bg-[#3a3d41] px-2 py-1 text-xs">
                      {t.attachImage}
                      <input type="file" accept="image/*" className="hidden" onChange={onPickImageAttachment} />
                    </label>
                  </div>
                  {pendingAttachments.length > 0 ? (
                    <div className="mb-2 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2 text-xs">
                      {pendingAttachments?.map((att, i) => (
                        <div key={`${att.type}-${i}`}>{att.type === "link" ? att.url : att.name || "image"}</div>
                      ))}
                      <button type="button" className="mt-2 rounded bg-[#4b2f2f] px-2 py-1" onClick={() => setPendingAttachments([])}>
                        {t.clearAttach}
                      </button>
                    </div>
                  ) : null}
                  <div className="mb-1 flex flex-wrap gap-1">
                    {["/fix", "/explain", "/test", "/refactor", "/docs"].map((cmd) => (
                      <button key={cmd} type="button" onClick={() => quickCommand(`${cmd} `, "group")} className="rounded bg-[var(--bg-panel-alt)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-[#3a3d41]">{cmd}</button>
                    ))}
                    {sortAgents(data?.agents ?? []).map((agent) => (
                      <button key={`@${agent.id}`} type="button" onClick={() => quickCommand(`@${agent.name} `, "group")} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-[var(--bg-panel-alt)]" style={{ color: agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff" }}>@{agent.name}</button>
                    ))}
                  </div>
                  <div className="relative flex gap-2">
                    {renderMentionSuggestions("group")}
                    <textarea data-chat-channel="group" value={groupMessage} onChange={(e) => handleMentionInput("group", e.target.value, e.target.selectionStart ?? e.target.value.length)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} disabled={chatRunning} rows={2} className="w-full resize-y rounded border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 text-sm outline-none disabled:opacity-60" />
                    <button className="rounded bg-[#0e639c] px-3 py-2 text-sm text-white disabled:opacity-60" type="submit" disabled={chatRunning || (!groupMessage.trim() && pendingAttachments.length === 0)}>{t.send}</button>
                    {chatRunning ? <button className="rounded bg-[#a12828] px-3 py-2 text-sm text-white" type="button" onClick={stopChat}>{t.stop}</button> : null}
                  </div>
                </form>
              </section>
            )}
          </div>
        </div>

        {/* Bottom panel stays in the flex flow, so collapsing it cannot overlap the workspace. */}
        <div className="logs-panel h-[200px] w-full shrink-0 overflow-y-auto relative z-10 flex border-t border-[var(--border-default)] bg-slate-950 shadow-[0_-12px_30px_rgba(0,0,0,0.24)]">
          {/* Terminal */}
          <div className={`workspace-column ${collapsedPanels.terminal ? "workspace-column-collapsed" : ""} relative panel-accent-terminal ${panelClass("terminal")}`} style={{ flex: collapsedPanels.terminal ? `0 0 ${COLLAPSED_BOTTOM}px` : `${bottomGrows[0]} 1 0%` }}>
            {collapsedStrip("terminal", t.terminal, false)}
            {!collapsedPanels.terminal && (
              <section className="panel h-full border-r" style={{ borderColor: "var(--border-default)" }}>
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.terminal}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => void clearTerminal()} disabled={busy} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-0.5 text-[10px] text-slate-300 hover:border-blue-400 disabled:opacity-50">clear</button>
                    {renderCollapseButton("terminal")}
                    {renderExpandButton("terminal")}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-terminal)] p-2 font-mono text-[10px]">
                  {data?.terminal?.map((entry) => (
                    <div key={entry.id} className="mb-2 grid grid-cols-[auto_1fr] gap-2">
                      <span className="text-slate-600">{new Date(entry.createdAt).toLocaleTimeString(locale)}</span>
                      <div>
                        <div className={entry.status === "success" ? "text-emerald-400" : entry.status === "timeout" ? "text-amber-300" : "text-red-300"}>$ {entry.command}</div>
                        <pre className="whitespace-pre-wrap text-slate-300">{entry.output}</pre>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={runTerminal} className="flex items-center gap-2 border-t border-[var(--border-default)] bg-[var(--bg-terminal)] p-2">
                  <span className="font-mono text-emerald-400">$</span>
                  <input value={terminalCommand} onChange={(e) => setTerminalCommand(e.target.value)} placeholder={locale === "ru" ? "Р’РІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ..." : "Enter command..."} className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-slate-600" />
                </form>
              </section>
            )}
          </div>

          {/* Logs / System Events */}
          <div className={`workspace-column ${collapsedPanels.logs ? "workspace-column-collapsed" : ""} relative panel-accent-logs ${panelClass("logs")}`} style={{ flex: collapsedPanels.logs ? `0 0 ${COLLAPSED_BOTTOM}px` : `${bottomGrows[1]} 1 0%` }}>
            {collapsedStrip("logs", t.logsTitle, false)}
            {!collapsedPanels.logs && (
              <section className="panel h-full">
                <div className="panel-header flex items-center justify-between">
                  <span className="truncate">{t.logsTitle}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => toggleFullscreen("logs")} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-[10px] hover:border-blue-400">{t.expand}</button>
                    <button type="button" onClick={() => toggleCollapse("logs")} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-[10px] hover:border-blue-400">{t.collapse}</button>
                    <button type="button" onClick={() => void clearSystemEvents()} disabled={busy} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-[10px] hover:border-red-400 disabled:opacity-50">{locale === "ru" ? "РћС‡РёСЃС‚РёС‚СЊ Р»РѕРіРё" : "Clear logs"}</button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-xs">
                  {data?.systemEvents?.map((event) => (
                    <article key={`event-${event.id}`} className={`rounded border p-2 ${eventTone(event.level).border} ${eventTone(event.level).background}`}>
                      <p className="flex items-center gap-1 text-[10px] text-slate-500"><span className={`inline-block h-1.5 w-1.5 rounded-full ${eventTone(event.level).dot}`} />{event.source} В· {new Date(event.createdAt).toLocaleTimeString(locale)}</p>
                      <p className={`mt-0.5 ${eventTone(event.level).text}`}>{event.message}</p>
                      {event.details ? <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-400">{event.details}</pre> : null}
                    </article>
                  ))}
                  {data?.findings?.map((finding) => (
                    <article key={finding.id} className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
                      <p className="text-amber-300">[{finding.severity.toUpperCase()}] {finding.filePath}{finding.line ? `:${finding.line}` : ""}</p>
                      <p className="mt-0.5 text-amber-100">{finding.message}</p>
                    </article>
                  ))}
                  <div ref={systemEventsEndRef} aria-hidden="true" />
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Context menu for file tree */}
      {contextMenu ? (
        <div
          className="context-menu fixed z-50 min-w-[160px] rounded border border-[var(--border-default)] bg-[var(--bg-panel)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
            onClick={() => beginCreateEntry("file", contextMenu.entry.kind === "directory" ? contextMenu.entry.path : contextMenu.entry.path.split("/").slice(0, -1).join("/"))}
          >
            рџ“„ {t.newFile}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
            onClick={() => beginCreateEntry("directory", contextMenu.entry.kind === "directory" ? contextMenu.entry.path : contextMenu.entry.path.split("/").slice(0, -1).join("/"))}
          >
            рџ“Ѓ {t.newFolder}
          </button>
          <div className="my-1 border-t border-[var(--border-default)]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
            onClick={() => { renameTreeEntry(contextMenu.entry.path); setContextMenu(null); }}
          >
            вњЏпёЏ {t.rename}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#f48771] hover:bg-[#37373d]"
            onClick={() => { deleteTreeEntry(contextMenu.entry.path); setContextMenu(null); }}
          >
            рџ—‘пёЏ {t.delete}
          </button>
        </div>
      ) : null}

      {/* Settings drawer */}
      {settingsOpen ? (
        <button
          type="button"
          aria-label={t.close}
          onClick={() => setSettingsOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/40"
        />
      ) : null}
      {settingsOpen ? (
        <aside
          aria-label={t.settings}
          className="settings-drawer flex min-h-0 max-w-[calc(100vw-16px)] flex-col overflow-hidden"
          style={{
            borderColor: "var(--border-default)",
            background: "var(--bg-panel)",
          }}
        >
        <div className="panel-header flex items-center justify-between">
          <span className="flex items-center gap-2">{t.settings}{Object.entries(agentDrafts).some(([agentId, draft]) => {
            const agent = data?.agents.find((candidate) => candidate.id === Number(agentId));
            return agent ? isAgentDraftDirty(agent, draft) : false;
          }) ? <span className="text-[10px] text-amber-300">{t.unsaved}</span> : null}</span>
          <button type="button" onClick={() => setSettingsOpen(false)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.close}</button>
        </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-10">
          <section className="mb-5 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
            <h3 className="mb-2 text-xs uppercase text-[var(--text-secondary)]">{t.projectFolder}</h3>
            <input
              value={workspaceRootDraft}
              onChange={(e) => setWorkspaceRootDraft(e.target.value)}
              placeholder={t.folderPath}
              className="mb-2 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => void connectWorkspaceFolder()} disabled={busy} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:opacity-60">
                {t.connectFolder}
              </button>
              <button type="button" onClick={() => void pickWorkspaceFolder()} disabled={busy} className="rounded bg-[#3a3d41] px-3 py-1 text-xs disabled:opacity-60">
                {t.browseFolder}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{workspaceRootDraft || t.noFile}</p>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-xs uppercase text-[var(--text-secondary)]">{t.lang}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => switchLocale("ru")} className={`rounded px-2 py-1 text-sm ${locale === "ru" ? "bg-[#007acc]" : "bg-[var(--bg-panel-alt)]"}`}>рџ‡·рџ‡є</button>
              <button type="button" onClick={() => switchLocale("en")} className={`rounded px-2 py-1 text-sm ${locale === "en" ? "bg-[#007acc]" : "bg-[var(--bg-panel-alt)]"}`}>рџ‡єрџ‡ё</button>
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-xs uppercase text-[var(--text-secondary)]">{t.importCode}</h3>
            <p className="mb-2 text-xs text-[var(--text-secondary)]">{t.importHint}</p>
            <input type="file" multiple onChange={onPickImportFiles} className="mb-2 block w-full text-xs" />
            <button type="button" onClick={importOwnFiles} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white">{t.importBtn}</button>
          </section>

          <section className="mb-5">
            <button type="button" onClick={() => setProvidersOpen((open) => !open)} className="mb-2 flex w-full items-center justify-between text-left text-xs uppercase text-[var(--text-secondary)]"><span>{t?.apiKeys}</span><span className="text-sm">{providersOpen ? "в–ј" : "в–¶"}</span></button>
            {providersOpen ? <>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="mb-2 inline-block text-xs text-[var(--text-accent)] underline">
              {t.freeOpenRouter}
            </a>
            <div className="space-y-3">
              {PROVIDER_PRESETS.filter((p) => p.id !== "custom" && p.id !== "mock")?.map((provider) => (
                <div key={provider.id} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
                  <p className="text-xs font-semibold text-white">{provider.label}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{t.baseUrl}: {provider.baseUrl}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">{t.defaultModel}: {provider.defaultModel}</p>
                  <input
                    value={apiKeysDraft[provider.id] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setApiKeysDraft((prev) => ({ ...prev, [provider.id]: value }));
                      if (value.trim()) setApiKeysToRemove((prev) => ({ ...prev, [provider.id]: false }));
                    }}
                    type="password"
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
                    placeholder={data?.settings.apiKeysConfigured?.[provider.id] ? `${provider.label} API key СЃРѕС…СЂР°РЅС‘РЅ Р»РѕРєР°Р»СЊРЅРѕ` : `${provider.label} API key`}
                  />
                  {data?.settings.apiKeysConfigured?.[provider.id] ? (
                    <button
                      type="button"
                      onClick={() => {
                        setApiKeysDraft((prev) => ({ ...prev, [provider.id]: "" }));
                        setApiKeysToRemove((prev) => ({ ...prev, [provider.id]: true }));
                      }}
                      className="mt-1 rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:border-red-400"
                    >
                      {locale === "ru" ? "РЈРґР°Р»РёС‚СЊ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Р№ РєР»СЋС‡" : "Remove saved key"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
              <p className="mb-2 text-xs font-semibold text-white">{t.github}</p>
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                {t?.githubToken}
                <input
                  value={githubTokenDraft}
                  onChange={(e) => {
                    setGithubTokenDraft(e.target.value);
                    if (e.target.value.trim()) setRemoveGithubToken(false);
                  }}
                  type="password"
                  autoComplete="off"
                  placeholder={data?.settings.githubTokenConfigured ? "GitHub token СЃРѕС…СЂР°РЅС‘РЅ Р»РѕРєР°Р»СЊРЅРѕ" : ""}
                  className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
                />
              </label>
              {data?.settings.githubTokenConfigured ? (
                <button type="button" onClick={() => { setGithubTokenDraft(""); setRemoveGithubToken(true); }} className="mb-1 rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:border-red-400">
                  {locale === "ru" ? "РЈРґР°Р»РёС‚СЊ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Р№ GitHub-С‚РѕРєРµРЅ" : "Remove saved GitHub token"}
                </button>
              ) : null}
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                {t?.githubRepo}
                <input
                  value={githubRepoDraft}
                  onChange={(e) => setGithubRepoDraft(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
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
              <label className="mt-2 flex items-center gap-2 text-xs text-[#c6ced8]">
                <input
                  type="checkbox"
                  checked={autoApproveDraft}
                  onChange={(e) => setAutoApproveDraft(e.target.checked)}
                />
                {locale === "ru" ? "РђРІС‚Рѕ-СѓС‚РІРµСЂР¶РґРµРЅРёРµ (Р°РІС‚РѕРЅРѕРјРЅС‹Р№ С†РёРєР»)" : "Auto-Approve (autonomous cycle)"}
              </label>
              <div className="mt-2">
                <p className="text-xs text-[var(--text-secondary)]">{locale === "ru" ? "РњРѕР±РёР»СЊРЅС‹Р№ РґРѕСЃС‚СѓРї (С‚РѕРєРµРЅ)" : "Mobile access token"}</p>
                <div className="flex gap-2 mt-1">
                  <input value={mobileTokenDraft} onChange={(e) => setMobileTokenDraft(e.target.value)} placeholder={locale === "ru" ? "РћСЃС‚Р°РІСЊС‚Рµ РїСѓСЃС‚С‹Рј С‡С‚РѕР±С‹ РѕС‚РєР»СЋС‡РёС‚СЊ" : "Leave empty to disable"} className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                {mobileTokenDraft ? <span className="text-[10px] self-center truncate max-w-[240px]" style={{ color: "var(--text-accent)" }}>рџЊђ http://IP-РџРљ:{appPort}/mobile?token={mobileTokenDraft}</span> : null}
              </div>
              <div className="mt-3 border-t border-[#2d2d30] pt-3">
                <label className="flex items-center justify-between gap-3 text-xs text-[#c6ced8]">
                  <span>{locale === "ru" ? "Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ РґРѕСЃС‚СѓРї (Localtunnel)" : "Global access (Localtunnel)"}</span>
                  <input
                    type="checkbox"
                    checked={localtunnelEnabledDraft}
                    disabled={localtunnelLoading}
                    onChange={(e) => void toggleLocaltunnel(e.target.checked)}
                  />
                </label>
                {localtunnelUrl ? (() => {
                  const mobileUrl = `${localtunnelUrl}/mobile${mobileTokenDraft ? `?token=${encodeURIComponent(mobileTokenDraft)}` : ""}`;
                  return (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 rounded bg-[#1e3323] p-2 text-xs">
                        <span className="text-[#6a9955]">рџџў {locale === "ru" ? "РђРєС‚РёРІРµРЅ" : "Active"}</span>
                        <a href={mobileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-[var(--text-accent)] underline">{mobileUrl}</a>
                        <button type="button" onClick={() => { navigator.clipboard?.writeText(mobileUrl); setStatus(locale === "ru" ? "РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°" : "Link copied"); }} className="whitespace-nowrap text-[10px] text-[var(--text-secondary)] hover:text-white">{locale === "ru" ? "РљРѕРїРёСЂРѕРІР°С‚СЊ" : "Copy"}</button>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/qrcode?url=${encodeURIComponent(mobileUrl)}`} alt="QR code" className="mt-2 h-[140px] w-[140px] rounded border border-[#2d2d30]" />
                    </div>
                  );
                })() : <p className="mt-2 text-[10px] text-[var(--text-secondary)]">{locale === "ru" ? "Р‘РµР· СЂРµРіРёСЃС‚СЂР°С†РёРё, С‚РѕРєРµРЅРѕРІ Рё VPN." : "No registration, tokens, or VPN required."}</p>}
              </div>
              </div>
            </div>

            <button type="button" onClick={saveApiKeys} disabled={busy || !settingsDirty} className="mt-2 rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">{t.saveKeys}</button>
            </> : null}
          </section>

          <section className="mb-5 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{locale === "ru" ? "Live Preview РїСЂРѕРµРєС‚Р°" : "Project Live Preview"}</p>
                <p className="text-[10px] text-[var(--text-secondary)]">{previewUrl || `${previewCommandDraft} В· :${previewPortDraft}`}</p>
              </div>
              <button type="button" onClick={() => setPreviewOpen(true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">рџ‘ЃпёЏ {locale === "ru" ? "РћС‚РєСЂС‹С‚СЊ" : "Open"}</button>
            </div>
            <div className="mt-2 flex gap-2">
              <input value={previewCommandDraft} onChange={(e) => setPreviewCommandDraft(e.target.value)} className="min-w-0 flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" placeholder="npm run dev" />
              <input type="number" min={1} max={65535} value={previewPortDraft} onChange={(e) => setPreviewPortDraft(Number(e.target.value) || 4173)} className="w-20 rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
            </div>
          </section>

          <section className="mb-5 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{locale === "ru" ? "РџСЂРµСЃРµС‚ РїСЂРѕРµРєС‚Р°" : "Project preset"}</p>
                <p className="text-[10px] text-[var(--text-secondary)]">{data?.settings.projectTemplate || (locale === "ru" ? "РќРµ РІС‹Р±СЂР°РЅ" : "Not selected")}</p>
              </div>
              <button type="button" onClick={() => setTemplateOpen(true)} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white">вљЎ {locale === "ru" ? "Р’С‹Р±СЂР°С‚СЊ" : "Choose"}</button>
            </div>
          </section>

          <section className="mb-5 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
            <p className="mb-2 text-xs font-semibold">Telegram</p>
            <label className="mb-2 block text-[11px] text-[var(--text-secondary)]">Telegram Bot Token
              <input value={telegramTokenDraft} onChange={(e) => { setTelegramTokenDraft(e.target.value); if (e.target.value.trim()) setRemoveTelegramToken(false); }} type="password" autoComplete="off" placeholder={data?.settings.telegramTokenConfigured ? "Telegram token СЃРѕС…СЂР°РЅС‘РЅ Р»РѕРєР°Р»СЊРЅРѕ" : "123456:ABC..."} className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
            </label>
            {data?.settings.telegramTokenConfigured ? (
              <button type="button" onClick={() => { setTelegramTokenDraft(""); setRemoveTelegramToken(true); }} className="mb-2 rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:border-red-400">
                {locale === "ru" ? "РЈРґР°Р»РёС‚СЊ СЃРѕС…СЂР°РЅС‘РЅРЅС‹Р№ Telegram-С‚РѕРєРµРЅ" : "Remove saved Telegram token"}
              </button>
            ) : null}
            <label className="mb-2 block text-[11px] text-[var(--text-secondary)]">Telegram Chat ID
              <input value={telegramChatIdDraft} onChange={(e) => setTelegramChatIdDraft(e.target.value)} placeholder="-100..." className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
            </label>
            <button type="button" onClick={() => void testTelegram()} disabled={telegramTesting || !telegramChatIdDraft.trim()} className="rounded bg-[#229ed9] px-3 py-1 text-xs text-white disabled:opacity-50">{telegramTesting ? "..." : (locale === "ru" ? "РџСЂРѕРІРµСЂРёС‚СЊ СЃРІСЏР·СЊ" : "Test connection")}</button>
            <p className="mt-2 text-[10px] text-[var(--text-secondary)]">{locale === "ru" ? "Р РµР¶РёРј: long polling. РЎРѕС…СЂР°РЅРёС‚Рµ РЅР°СЃС‚СЂРѕР№РєРё РїРµСЂРµРґ РїСЂРѕРІРµСЂРєРѕР№." : "Mode: long polling. Save settings before testing."}</p>
          </section>

          <section className="mb-5 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
            <p className="mb-2 text-xs font-semibold">{locale === "ru" ? "Fallback Chain РјРѕРґРµР»РµР№" : "Fallback model chain"}</p>
            <textarea value={fallbackModelsDraft} onChange={(e) => setFallbackModelsDraft(e.target.value)} placeholder={locale === "ru" ? "РџРѕ РѕРґРЅРѕР№ РјРѕРґРµР»Рё РЅР° СЃС‚СЂРѕРєСѓ\nРЅР°РїСЂРёРјРµСЂ: gpt-4o-mini\nclaude-3-5-haiku" : "One model per line\ne.g. gpt-4o-mini\nclaude-3-5-haiku"} className="min-h-16 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{locale === "ru" ? "РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РїСЂРё 403, 429, 5xx Рё timeout." : "Used for 403, 429, 5xx and timeouts."}</p>
          </section>

          <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase text-[var(--text-secondary)]">{locale === "ru" ? "Р­РљРЎРџРћР Рў / РРњРџРћР Рў" : "EXPORT / IMPORT"}</span>
              <div className="flex gap-2">
                <button type="button" onClick={exportAgents} className="rounded bg-[#3a3d41] px-2 py-1 text-xs text-white">{t.exportAgents}</button>
                <label className="cursor-pointer rounded bg-[#3a3d41] px-2 py-1 text-xs text-white">
                  {t.importAgents}
                  <input type="file" accept=".json" className="hidden" onChange={importAgentsFromFile} />
                </label>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)]">{t.importAgentsDesc}</p>
            <button type="button" onClick={() => void clearAgentMemoryCache()} disabled={busy} className="mt-2 rounded border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 py-1 text-xs text-amber-200 hover:border-amber-400 disabled:opacity-50">
              {locale === "ru" ? "РћС‡РёСЃС‚РёС‚СЊ РєСЌС€ РїР°РјСЏС‚Рё Р°РіРµРЅС‚РѕРІ" : "Clear agent memory cache"}
            </button>
          </section>

          <section>
            <button type="button" onClick={() => setAgentsOpen((open) => !open)} className="mb-2 flex w-full items-center justify-between text-left text-xs uppercase text-[var(--text-secondary)]"><span>{t.agents}</span><span className="text-sm">{agentsOpen ? "в–ј" : "в–¶"}</span></button>
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
                  <article key={agent.id} className="rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-[#555]" style={{ backgroundColor: draft.color || ROLE_COLORS[agent.role] || "#4fc1ff" }} />
                        <div>
                          <span className="text-sm">{agent.name}</span>
                          <p className="text-[10px] text-[var(--text-accent)]">{providerModelLabel(draft.provider, draft.model)}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)]">{draftDirty ? t.unsaved : roleLabel(agent.role)}</span>
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
                      className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
                    >
                      {PROVIDER_PRESETS?.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>

                    <input value={draft.baseUrl} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, baseUrl: e.target.value } }))} placeholder={t.baseUrl} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />

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
                        className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
                      >
                        {(modelOptions[draft.provider] ?? getProviderPreset(draft.provider).fallbackModels).filter((model) => model.toLowerCase().includes((modelSearch[`agent-${agent.id}`] ?? "").toLowerCase())).map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                        {draft.model && !(modelOptions[draft.provider] ?? []).includes(draft.model) ? <option value={draft.model}>{draft.model}</option> : null}
                        <option value="__manual__">{t.manualModel}</option>
                      </select>
                      <button type="button" onClick={() => fetchModels(draft.provider, draft.baseUrl, apiKeysDraft[draft.provider], true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">
                        {t.loadModels}
                      </button>
                      <input value={modelSearch[`agent-${agent.id}`] ?? ""} onChange={(e) => setModelSearch((prev) => ({ ...prev, [`agent-${agent.id}`]: e.target.value }))} placeholder="free / coder / qwen" className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-[10px]" />
                    </div>

                    {draft.manualModel ? <input value={draft.model} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, model: e.target.value } }))} placeholder={t.model} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" /> : null}

                    <select value={draft.role} onChange={(e) => {
                      const newRole = e.target.value;
                      const newColor = ROLE_COLORS[newRole] ?? "#4fc1ff";
                      setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, role: newRole, color: draft.color === (ROLE_COLORS[draft.role] ?? "") ? newColor : draft.color } }));
                    }} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs">
                      {roleOptions?.map((role) => <option key={role} value={role}>{roleLabel(role)} ({role})</option>)}
                    </select>

                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-secondary)]">Р¦РІРµС‚:</span>
                      <input type="color" value={draft.color} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, color: e.target.value } }))} className="h-6 w-8 cursor-pointer rounded border border-[var(--border-default)] bg-[var(--bg-app)]" />
                    </div>

                    <input value={draft.description} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, description: e.target.value } }))} placeholder={t.profile} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                    <textarea value={draft.skill} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, skill: e.target.value } }))} placeholder={t.skill} className="mb-1 min-h-10 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                    <textarea value={draft.systemPrompt} onChange={(e) => setAgentDrafts((prev) => ({ ...prev, [agent.id]: { ...draft, systemPrompt: e.target.value } }))} placeholder={t.prompt} className="mb-1 min-h-10 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                    <div className="flex gap-2">
                      {!isMain ? <button type="button" onClick={() => setMainCoder(agent.id)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.setMain}</button> : null}
                      <button type="button" onClick={() => saveAgentProfile(agent.id)} disabled={busy || !draftDirty} className="rounded bg-[#0e639c] px-2 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">{t.saveProfile}</button>
                    </div>
                  </article>
                );
              })}

              {/* Add agent button / form */}
              {!showAddAgent ? (
                <button type="button" onClick={() => { setShowAddAgent(true); setAddAgentMode(null); setNewAgent(emptyNewAgent({}, (data?.agents ?? []).map((a) => a.color ?? ROLE_COLORS[a.role] ?? ""))); }} className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:border-[#4fc1ff] hover:text-white">
                  + {locale === "ru" ? "Р”РѕР±Р°РІРёС‚СЊ Р°РіРµРЅС‚Р°" : "Add agent"}
                </button>
              ) : (
                <article className="rounded border border-[#007acc] bg-[#1b1b1c] p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">{addAgentMode === "template" ? (locale === "ru" ? "РќРѕРІС‹Р№ Р°РіРµРЅС‚ (С€Р°Р±Р»РѕРЅ)" : "New agent (template)") : addAgentMode === "custom" ? (locale === "ru" ? "РќРѕРІС‹Р№ Р°РіРµРЅС‚ (СЃРІРѕР№)" : "New agent (custom)") : locale === "ru" ? "Р’С‹Р±РµСЂРёС‚Рµ РІР°СЂРёР°РЅС‚" : "Choose option"}</span>
                    <button type="button" onClick={() => setShowAddAgent(false)} className="rounded px-1 py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-[#3a3d41]">вњ•</button>
                  </div>

                  {addAgentMode === null ? (
                    <div className="space-y-1">
                      <p className="mb-2 text-[10px] text-[var(--text-secondary)]">{locale === "ru" ? "Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚ вЂ” РіРѕС‚РѕРІС‹Рµ СЂРѕР»Рё Р°РіРµРЅС‚РѕРІ:" : "Quick start вЂ” preset agent roles:"}</p>
                      {roleOptions.map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                            setNewAgent(emptyNewAgent({ role }, (data?.agents ?? []).map((a) => a.color ?? ROLE_COLORS[a.role] ?? "")));
                            setAddAgentMode("template");
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
                        >
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ROLE_COLORS[role] ?? "#4fc1ff" }} />
                          <span className="font-medium">{roleLabel(role)}</span>
                          <span className="text-[10px] text-[var(--text-secondary)]">({role})</span>
                        </button>
                      ))}
                      <div className="border-t border-[var(--border-default)] pt-1">
                        <button
                          type="button"
                          onClick={() => { setNewAgent(emptyNewAgent({}, (data?.agents ?? []).map((a) => a.color ?? ROLE_COLORS[a.role] ?? ""))); setAddAgentMode("custom"); }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[#c6ced8] hover:bg-[#37373d]"
                        >
                          вњЁ {locale === "ru" ? "РЎРѕР·РґР°С‚СЊ СЃ РЅСѓР»СЏ" : "Create from scratch"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input value={newAgent.name} onChange={(e) => setNewAgent((p) => ({ ...p, name: e.target.value }))} placeholder={t.name} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                      <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                        {t.provider}
                        <select
                          value={newAgent.provider}
                          onChange={(e) => {
                            const preset = getProviderPreset(e.target.value);
                            setNewAgent((p) => ({ ...p, provider: preset.id, baseUrl: preset.baseUrl, model: preset.defaultModel, manualModel: false }));
                            void fetchModels(preset.id, preset.baseUrl, apiKeysDraft[preset.id]);
                          }}
                          className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
                        >
                          {PROVIDER_PRESETS?.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                          ))}
                        </select>
                      </label>
                      <input value={newAgent.baseUrl} onChange={(e) => setNewAgent((p) => ({ ...p, baseUrl: e.target.value }))} placeholder={t.baseUrl} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
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
                          className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs"
                        >
                          {(modelOptions[newAgent.provider] ?? getProviderPreset(newAgent.provider).fallbackModels).filter((model) => model.toLowerCase().includes((modelSearch.new ?? "").toLowerCase())).map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                          {newAgent.model && !(modelOptions[newAgent.provider] ?? []).includes(newAgent.model) ? <option value={newAgent.model}>{newAgent.model}</option> : null}
                          <option value="__manual__">{t.manualModel}</option>
                        </select>
                        <button type="button" onClick={() => fetchModels(newAgent.provider, newAgent.baseUrl, apiKeysDraft[newAgent.provider], true)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">
                          {t.loadModels}
                        </button>
                        <input value={modelSearch.new ?? ""} onChange={(e) => setModelSearch((prev) => ({ ...prev, new: e.target.value }))} placeholder="free / coder / qwen" className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-[10px]" />
                      </div>
                      {newAgent.manualModel ? <input value={newAgent.model} onChange={(e) => setNewAgent((p) => ({ ...p, model: e.target.value }))} placeholder={t.model} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" /> : null}
                      <select value={newAgent.role} onChange={(e) => {
                        const newRole = e.target.value;
                        setNewAgent((p) => ({ ...p, role: newRole, color: ROLE_COLORS[newRole] ?? "#4fc1ff" }));
                      }} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs">
                        {roleOptions?.map((role) => <option key={role} value={role}>{roleLabel(role)} ({role})</option>)}
                      </select>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-secondary)]">Р¦РІРµС‚:</span>
                        <input type="color" value={newAgent.color} onChange={(e) => setNewAgent((p) => ({ ...p, color: e.target.value }))} className="h-6 w-8 cursor-pointer rounded border border-[var(--border-default)] bg-[var(--bg-app)]" />
                      </div>
                      <input value={newAgent.description} onChange={(e) => setNewAgent((p) => ({ ...p, description: e.target.value }))} placeholder={t.profile} className="mb-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                      <textarea value={newAgent.skill} onChange={(e) => setNewAgent((p) => ({ ...p, skill: e.target.value }))} placeholder={t.skill} className="mb-1 min-h-10 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                      <textarea value={newAgent.systemPrompt} onChange={(e) => setNewAgent((p) => ({ ...p, systemPrompt: e.target.value }))} placeholder={t.prompt} className="mb-1 min-h-10 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1 text-xs" />
                      <button type="button" onClick={createAgent} disabled={busy || !newAgentDirty} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:bg-[#3a3d41] disabled:text-[#777]">{t.createAgent}</button>
                    </>
                  )}
                </article>
              )}
            </div> : null}
          </section>
        </div>
      </aside>
      ) : null}

      {githubModalOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <button type="button" onClick={() => setGithubModalOpen(false)} className="absolute inset-0 bg-black/60" aria-label={t.close} />
          <form onSubmit={(event) => { event.preventDefault(); void pushToGithub({ token: githubPushToken, repo: githubPushRepo }); }} className="relative z-10 w-[92%] max-w-[460px] rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{locale === "ru" ? "РџСѓС€ РІ GitHub" : "Push to GitHub"}</h2>
              <button type="button" onClick={() => setGithubModalOpen(false)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.close}</button>
            </div>
            <label className="mb-3 block text-xs text-[var(--text-secondary)]">
              GitHub Personal Access Token (PAT)
              <input value={githubPushToken} onChange={(event) => setGithubPushToken(event.target.value)} type="password" required className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-2 text-xs" autoComplete="off" />
            </label>
            <label className="mb-4 block text-xs text-[var(--text-secondary)]">
              {locale === "ru" ? "Р РµРїРѕР·РёС‚РѕСЂРёР№ (owner/repo)" : "Repository (owner/repo)"}
              <input value={githubPushRepo} onChange={(event) => setGithubPushRepo(event.target.value)} placeholder="owner/repo" required className="mt-1 w-full rounded border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-2 text-xs" />
            </label>
            <button type="submit" disabled={githubPushLoading || !githubPushToken.trim() || !githubPushRepo.trim()} className="w-full rounded bg-[#0e639c] px-3 py-2 text-xs text-white disabled:opacity-50">
              {githubPushLoading ? (locale === "ru" ? "РџСѓС€ РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ..." : "Pushing...") : (locale === "ru" ? "РРЅРёС†РёР°Р»РёР·РёСЂРѕРІР°С‚СЊ Рё РїСѓС€РЅСѓС‚СЊ" : "Initialize and push")}
            </button>
          </form>
        </div>
      ) : null}

      {templateOpen ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-3">
          <section className="w-[92vw] max-w-[620px] rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{locale === "ru" ? "Р’С‹Р±РѕСЂ РїСЂРµСЃРµС‚Р° РїСЂРѕРµРєС‚Р°" : "Choose project preset"}</h2>
              <button type="button" onClick={() => setTemplateOpen(false)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.close}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["web", "рџЊђ Web-СЃР°Р№С‚ / Р’РµР±-РїСЂРёР»РѕР¶РµРЅРёРµ", "React / Vite / HTML-CSS"],
                ["mobile", "рџ“± РњРѕР±РёР»СЊРЅРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ", "Capacitor / Android APK / iOS"],
                ["desktop", "рџ’» Р”РµСЃРєС‚РѕРї-РїСЂРёР»РѕР¶РµРЅРёРµ", ".exe / Electron"],
                ["all", "вљЎ Р’СЃРµ РІ РѕРґРЅРѕРј", "Web + APK + EXE"],
                ["telegram", "рџ¤– Telegram-Р±РѕС‚ / Backend API", "Node.js / Express"],
              ].map(([id, label, description]) => (
                <button key={id} type="button" onClick={() => setTemplateId(id)} className={`rounded border p-3 text-left ${templateId === id ? "border-[#007acc] bg-[#264f78]" : "border-[var(--border-default)] bg-[var(--bg-app)]"}`}>
                  <p className="text-xs font-semibold">{label}</p>
                  <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{description}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-[var(--text-secondary)]">{workspaceRootDraft || (locale === "ru" ? "РџР°РїРєР° РїСЂРѕРµРєС‚Р° РЅРµ РїРѕРґРєР»СЋС‡РµРЅР°" : "Project folder is not connected")}</p>
            <button type="button" onClick={() => void generateTemplate()} disabled={busy || !workspaceRootDraft.trim()} className="mt-3 w-full rounded bg-[#0e639c] px-3 py-2 text-xs text-white disabled:opacity-50">{locale === "ru" ? "РЎРѕР·РґР°С‚СЊ СЃС‚СЂСѓРєС‚СѓСЂСѓ РїСЂРѕРµРєС‚Р°" : "Generate project structure"}</button>
          </section>
        </div>
      ) : null}

      {supportOpen ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <button type="button" onClick={() => setSupportOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label={t.close} />
          <article className="relative z-10 w-[92%] max-w-[460px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
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
                  вќ¤пёЏ {t.supportProjectBtn}
                </a>
              </section>

              <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4">
                <h3 className="mb-1 text-sm font-semibold text-white">{t.emailTitle}</h3>
                <p className="mb-2 text-xs text-[var(--text-secondary)]">{t.emailDesc}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">{t.emailLabel}:</span>
                  <a href="mailto:tsarskiysoft@gmail.com" className="rounded bg-[var(--bg-panel-alt)] px-2 py-1 text-xs font-medium text-[var(--text-accent)] hover:underline">
                    tsarskiysoft@gmail.com
                  </a>
                </div>
              </section>

              <p className="text-center text-[11px] text-[var(--text-secondary)]">{t.supportThanks}</p>
            </div>
          </article>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3">
          <section className="flex max-h-[85vh] w-[92vw] max-w-[720px] flex-col rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{locale === "ru" ? "РЎРёСЃС‚РµРјРЅС‹Р№ Markdown-РѕС‚С‡С‘С‚" : "System Markdown report"}</h2><button type="button" onClick={() => setReportOpen(false)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">{t.close}</button></div>
            <textarea readOnly value={reportText} className="min-h-[320px] flex-1 resize-none rounded border border-[var(--border-default)] bg-[var(--bg-app)] p-3 font-mono text-xs text-[var(--text-primary)] outline-none" />
            <button type="button" onClick={() => void copyReport()} className="mt-3 rounded bg-[#0e639c] px-3 py-2 text-xs text-white">{locale === "ru" ? "РЎРєРѕРїРёСЂРѕРІР°С‚СЊ" : "Copy"}</button>
          </section>
        </div>
      ) : null}

      <PreviewModal open={previewOpen} url={previewUrl} loading={previewLoading} onClose={() => setPreviewOpen(false)} onReload={() => void reloadPreview()} onStart={() => void startPreview()} onFeedback={(value) => void sendPreviewFeedback(value)} />

      <OrchestratorPanel open={orchestratorOpen} onClose={() => setOrchestratorOpen(false)} locale={locale} activeFilePath={selectedFile?.path} activeFileContent={editorText} />

      <div className="status-bar">
        <span>{status}</span>
        <span>{busy ? t.busy : t.ready}</span>
      </div>
    </main>
  );
}