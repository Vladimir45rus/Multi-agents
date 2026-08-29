"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { sanitizeChatContent } from "@/lib/chat-display";

export const dynamic = "force-dynamic";

type AgentInfo = {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  color: string;
  model?: string;
};

type OrchAgentEntry = { name: string; role: string; status: string; message?: string };
type OrchEvent = { id: number; type: string; agent: string; status: string; createdAt: string };

type WorkspaceMessage = {
  id: number;
  chatChannel: string;
  senderType: string;
  agentName: string | null;
  content: string;
  createdAt: string;
  metadata?: { identity?: { role?: string } };
};

type WorkspaceData = {
  settings: {
    workspaceName: string;
    projectRoot: string;
  };
  agents: AgentInfo[];
  messages: WorkspaceMessage[];
};

type OrchestratorState = {
  taskId?: string;
  task?: string;
  step?: string;
  iteration?: number;
  maxIterations?: number;
  agents: OrchAgentEntry[];
};

type DesktopBridge = {
  expandFromOverlay?: () => Promise<void>;
  closeOverlay?: () => Promise<void>;
  toggleOverlayOnTop?: () => Promise<boolean>;
  collapseOverlay?: () => Promise<boolean>;
  restoreOverlay?: () => Promise<boolean>;
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

function roleEmoji(role: string) {
  const map: Record<string, string> = {
    main: "🧠", architect: "🏗️", reviewer: "🔍", tester: "🧪",
    uiux: "🎨", advisor: "💡", security: "🛡️", observer: "👁️",
  };
  return map[role] ?? "🤖";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "сейчас";
  if (sec < 60) return `${sec}с`;
  return `${Math.floor(sec / 60)}м`;
}

function stripContent(text: string, max = 140) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function MarkdownInline({ content, maxLen }: { content: string; maxLen?: number }) {
  const text = maxLen ? stripContent(content, maxLen) : content;
  // Lightweight: split code blocks, bold, inline code
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```") && part.length > 6) {
          const code = part.slice(3, -3).replace(/^[\w]*\n/, "");
          return (
            <pre key={i} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 4, padding: "2px 6px", fontSize: 9, overflowX: "auto", marginTop: 2, marginBottom: 2 }}>
              <code>{code}</code>
            </pre>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} style={{ background: "#30363d", borderRadius: 2, padding: "0 3px", fontSize: 9 }}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} style={{ color: "#e6edf3", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function OverlayPage() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [orchestrator, setOrchestrator] = useState<OrchestratorState | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [onTop, setOnTop] = useState(true);
  const [changingModel, setChangingModel] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lastMsgEndRef = useRef<HTMLDivElement>(null);

  const bridge = typeof window !== "undefined"
    ? (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge
    : null;

  const expand = useCallback(() => {
    void bridge?.expandFromOverlay?.();
  }, [bridge]);

  const close = useCallback(() => {
    void bridge?.closeOverlay?.();
  }, [bridge]);

  const toggleOnTop = useCallback(() => {
    void bridge?.toggleOverlayOnTop?.().then((value) => setOnTop(value));
  }, [bridge]);

  const collapse = useCallback(() => {
    void bridge?.collapseOverlay?.().then((ok) => { if (ok !== false) setCollapsed(true); });
  }, [bridge]);

  const restore = useCallback(() => {
    void bridge?.restoreOverlay?.().then((ok) => { if (ok !== false) setCollapsed(false); });
  }, [bridge]);

  // Poll workspace every 3s
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        if (active && res.ok) {
          const data = (await res.json()) as WorkspaceData;
          setWorkspace(data);
        }
      } catch { /* ignore */ }
      if (active) pollTimer = setTimeout(poll, 3000);
    }
    let pollTimer = setTimeout(poll, 0);
    return () => { active = false; clearTimeout(pollTimer); };
  }, []);

  // Poll orchestrator events every 2s
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/orchestrate/events?limit=3", { cache: "no-store" });
        if (!active || !res.ok) {
          if (active) pollTimer = setTimeout(poll, 2000);
          return;
        }
        const payload = (await res.json()) as { events?: OrchEvent[] };
        if (payload?.events?.length) {
          const latest = payload.events[0];
          setLastEvent(`${latest.agent} — ${latest.type}`);
        }
      } catch { /* ignore */ }
      if (active) pollTimer = setTimeout(poll, 2000);
    }
    let pollTimer = setTimeout(poll, 500);
    return () => { active = false; clearTimeout(pollTimer); };
  }, []);

  // Widget fix: the previous implementation opened `new EventSource("/api/orchestrate/stream")`,
  // but that route only accepts POST — every GET returned 405 and the widget
  // reconnect-looped without ever showing live status. Poll the orchestrator
  // state endpoint instead; it drives task/step/agent status reliably.
  useEffect(() => {
    let active = true;
    async function pollState() {
      try {
        const res = await fetch("/api/orchestrate/state", { cache: "no-store" });
        if (!active) return;
        if (res.ok) {
          setConnected(true);
          const payload = (await res.json()) as { activeTask?: { task?: string; step?: string; iteration?: number; maxIterations?: number } | null };
          const activeTask = payload?.activeTask ?? null;
          setOrchestrator(activeTask ? {
            task: activeTask.task,
            step: activeTask.step,
            iteration: activeTask.iteration,
            maxIterations: activeTask.maxIterations,
            agents: [],
          } : null);
        } else {
          setConnected(false);
        }
      } catch {
        if (active) setConnected(false);
      }
      if (active) stateTimer = setTimeout(pollState, 2000);
    }
    let stateTimer = setTimeout(pollState, 300);
    return () => { active = false; clearTimeout(stateTimer); };
  }, []);

  // Scroll chat area when new messages arrive
  useEffect(() => {
    lastMsgEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [workspace?.messages?.length]);

  // Send chat message
  async function sendChat(e?: React.KeyboardEvent | React.FormEvent) {
    if (e && "key" in e && e.key !== "Enter") return;
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || busy) return;
    setBusy(true);
    setChatInput("");
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, channel: "group", locale: "ru" }),
      });
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  const sortedAgents = [...(workspace?.agents ?? [])].sort((a, b) => {
    const order: Record<string, number> = { main: 0, architect: 1, uiux: 2, advisor: 3, reviewer: 4, tester: 5, security: 6, observer: 7 };
    return (order[a.role] ?? 99) - (order[b.role] ?? 99);
  });

  // Widget fix: quick model switching for the Lead agent straight from the widget.
  const mainAgent = workspace?.agents.find((agent) => agent.role === "main") ?? null;
  const modelOptions = [...new Set((workspace?.agents ?? []).map((agent) => agent.model).filter(Boolean))];

  async function changeModel(model: string) {
    if (!mainAgent || !model || changingModel) return;
    setChangingModel(true);
    try {
      await fetch(`/api/agents/${mainAgent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const res = await fetch("/api/workspace", { cache: "no-store" });
      if (res.ok) setWorkspace((await res.json()) as WorkspaceData);
    } catch { /* ignore */ }
    finally { setChangingModel(false); }
  }

  // Last agent message (newest non-user, non-system message)
  const lastAgentMsg = workspace?.messages?.slice().reverse().find(
    (m) => m.senderType === "agent" && m.content?.trim()
  );

  const activeTask = orchestrator?.task;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 11,
        userSelect: "none",
        overflow: "hidden",
        borderRadius: 8,
      }}
    >
      {/* --- draggable title bar --- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          background: "#161b22",
          borderBottom: "1px solid #30363d",
          minHeight: 28,
          ...({ WebkitAppRegion: "drag" } as React.CSSProperties),
        }}
      >
        {/* connection dot */}
        <span
          style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: connected ? "#3fb950" : activeTask ? "#d29922" : "#555",
          }}
          title={connected ? "LIVE" : activeTask ? "Task active" : "Idle"}
        />

        <span style={{ fontWeight: 700, color: "#58a6ff", fontSize: 12 }}>
          {workspace?.settings?.workspaceName || "Studio"}
        </span>

        {/* Widget fix: current model selector (Lead agent) */}
        {mainAgent && modelOptions.length > 0 ? (
          <select
            value={mainAgent.model}
            disabled={changingModel}
            onChange={(e) => void changeModel(e.target.value)}
            title="Модель Главного агента"
            style={{
              maxWidth: 130, marginLeft: 4, background: "#161b22",
              border: "1px solid #30363d", borderRadius: 4,
              color: "#c9d1d9", fontSize: 10, padding: "1px 4px",
              outline: "none",
              ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties),
            }}
          >
            {!modelOptions.includes(mainAgent.model) ? <option value={mainAgent.model}>{mainAgent.model}</option> : null}
            {modelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        ) : null}

        {activeTask && (
          <span style={{ color: "#d2a8ff", fontSize: 10, marginLeft: 4 }}>
            {orchestrator.step ?? "..."}{orchestrator.iteration != null ? ` ${orchestrator.iteration}/${orchestrator.maxIterations ?? "?"}` : ""}
          </span>
        )}

        {/* controls — no-drag so they're clickable */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginLeft: "auto",
            ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties),
          }}
        >
          {/* collapse / restore */}
          {collapsed ? (
            <button
              type="button"
              onClick={restore}
              title="Развернуть виджет"
              style={{
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4, border: "none", background: "transparent",
                color: "#8b949e", cursor: "pointer", fontSize: 12,
              }}
            >
              ▾
            </button>
          ) : (
            <button
              type="button"
              onClick={collapse}
              title="Свернуть в полоску"
              style={{
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4, border: "none", background: "transparent",
                color: "#8b949e", cursor: "pointer", fontSize: 12,
              }}
            >
              ─
            </button>
          )}
          {/* expand */}
          <button
            type="button"
            onClick={expand}
            title="Развернуть в основное окно"
            style={{
              width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, border: "none", background: "transparent",
              color: "#8b949e", cursor: "pointer", fontSize: 13,
            }}
          >
            ⛶
          </button>
          {/* always on top */}
          <button
            type="button"
            onClick={toggleOnTop}
            title={onTop ? "Открепить поверх окон" : "Закрепить поверх окон"}
            style={{
              width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, border: "none", background: "transparent",
              color: onTop ? "#58a6ff" : "#8b949e", cursor: "pointer", fontSize: 12,
            }}
          >
            📌
          </button>
          {/* close */}
          <button
            type="button"
            onClick={close}
            title="Закрыть виджет"
            style={{
              width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, border: "none", background: "transparent",
              color: "#8b949e", cursor: "pointer", fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* --- agents row --- */}
      <div
        style={{
          display: collapsed ? "none" : "flex",
          gap: 4,
          padding: "3px 8px",
          overflowX: "auto",
          borderBottom: "1px solid #30363d",
          background: "#0d1117",
          minHeight: 28,
          alignItems: "center",
          flexWrap: "nowrap",
        }}
      >
        {sortedAgents.map((agent) => {
          const color = agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff";
          const orch = orchestrator?.agents.find((a) => a.name === agent.name);
          const dot = agent.isActive ? "#3fb950" : "#484f58";
          const statusColor = orch
            ? orch.status === "done" ? "#3fb950"
              : orch.status === "error" ? "#f85149" : "#d29922"
            : dot;

          return (
            <div
              key={agent.id}
              title={`${agent.name} — ${agent.role}${orch ? ` (${orch.status})` : ""}`}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "1px 6px", borderRadius: 10,
                background: "#161b22", flexShrink: 0,
                border: `1px solid ${orch ? statusColor + "60" : "transparent"}`,
              }}
            >
              <span style={{ fontSize: 10 }}>{roleEmoji(agent.role)}</span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor }} />
              <span style={{ fontSize: 10, whiteSpace: "nowrap" }}>{agent.name}</span>
            </div>
          );
        })}
        {sortedAgents.length === 0 && (
          <span style={{ color: "#484f58", fontSize: 10 }}>…</span>
        )}
      </div>

      {/* --- main area: last message + chat log --- */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "6px 8px",
          display: collapsed ? "none" : "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {workspace?.messages?.slice(-12).filter((msg) => msg.senderType !== "system").map((msg) => {
          const isUser = msg.senderType === "user";
          const identity = msg.metadata?.identity;
          const role = identity?.role ?? "";
          const color = ROLE_COLORS[role] ?? "#4fc1ff";

          return (
            <div
              key={msg.id}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: isUser ? "#161b22" : "#0d1117",
                borderLeft: isUser ? "none" : `2px solid ${color}`,
                fontSize: 10,
              }}
            >
              <div style={{ display: "flex", gap: 4, alignItems: "baseline", marginBottom: 1 }}>
                <span style={{ color: isUser ? "#4fc1ff" : color, fontWeight: 600 }}>
                  {isUser ? "Вы" : msg.agentName ?? role}
                </span>
                <span style={{ color: "#484f58", fontSize: 9 }}>
                  {timeAgo(msg.createdAt)}
                </span>
              </div>
              <div style={{ color: "#8b949e", wordBreak: "break-word" }}>
                <MarkdownInline content={sanitizeChatContent(msg.content)} maxLen={200} />
              </div>
            </div>
          );
        })}
        <div ref={lastMsgEndRef} />
      </div>

      {/* --- compact input --- */}
      <form
        onSubmit={sendChat}
        style={{
          display: collapsed ? "none" : "flex",
          gap: 4,
          padding: "4px 8px",
          borderTop: "1px solid #30363d",
          background: "#161b22",
          ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties),
        }}
      >
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          placeholder={activeTask ? "Ответить агентам…" : "Сообщение в общий чат…"}
          disabled={busy}
          rows={2}
          style={{
            flex: 1,
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#c9d1d9",
            padding: "3px 8px",
            fontSize: 11,
            outline: "none",
            resize: "vertical",
          }}
        />
        <button
          type="submit"
          disabled={busy || !chatInput.trim()}
          style={{
            background: busy ? "#30363d" : "#238636",
            border: "none",
            borderRadius: 4,
            color: "#fff",
            fontSize: 11,
            padding: "3px 10px",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "…" : "→"}
        </button>
      </form>

      {/* --- footer --- */}
      <div
        style={{
          display: collapsed ? "none" : "flex",
          alignItems: "center",
          padding: "2px 8px",
          background: "#161b22",
          borderTop: "1px solid #30363d",
          fontSize: 9,
          color: "#484f58",
          gap: 10,
          minHeight: 20,
        }}
      >
        <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {workspace?.settings?.projectRoot || "—"}
        </span>
        <span style={{ color: "#30363d" }}>|</span>
        <span style={{ marginLeft: "auto" }}>
          {connected ? "● LIVE" : "○ polling"}
        </span>
      </div>
    </div>
  );
}