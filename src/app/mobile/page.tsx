"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { hasSseData, parseSseJson } from "@/lib/sse-json";
import type { AgentIdentity } from "@/lib/agent-identity";
import { MobileSettings } from "./settings";
import { useVoiceInput } from "./voice-input";
import { PreviewModal } from "@/components/preview-modal";

type MobileTab = "lead" | "group" | "state" | "settings";

type ChatMsg = {
  id: number; chatChannel: "lead" | "group"; senderType: string;
  agentName?: string | null; content: string;
  metadata: { identity?: AgentIdentity }; createdAt: string;
};
type AgentInfo = { id: number; name: string; role: string; color: string; isActive: boolean; provider: string; model: string };
type SystemEvent = { id: number; level: string; source: string; message: string; details?: string; createdAt: string };
type ActiveTask = { taskId: string; task: string; mode: string; iteration: number; maxIterations: number; step: string; lastSavedAt: string };
type OrchestratorEvent = { id: number; type: string; agent: string; role: string; iteration: number; status: string; createdAt: string };

const ROLE_COLORS: Record<string, string> = {
  main: "#8b5cf6", architect: "#10b981", reviewer: "#f97316",
  tester: "#ef4444", uiux: "#ec4899", advisor: "#06b6d4",
  security: "#f59e0b", observer: "#64748b",
};

function msgColor(m: ChatMsg, agents: AgentInfo[]) {
  if (m.senderType === "user") return "#fff";
  const ag = agents.find(a => a.id === m.metadata?.identity?.agentId);
  return ag?.color || ROLE_COLORS[ag?.role ?? ""] || "var(--text-accent)";
}
function msgName(m: ChatMsg) { return m.agentName || (m.senderType === "user" ? "Вы" : "Агент"); }

export default function MobilePage() {
  const sp = useSearchParams();
  const urlToken = sp.get("token") ?? "";
  const mobileFetch = useCallback((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (urlToken) headers.set("x-mobile-access-token", urlToken);
    return fetch(input, { ...init, headers });
  }, [urlToken]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<MobileTab>("lead");
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [orchestratorEvents, setOrchestratorEvents] = useState<OrchestratorEvent[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [data, setData] = useState<{ messages: ChatMsg[]; agents: AgentInfo[]; settings: { autoApprove: boolean; mobileAuthToken: string; previewUrl?: string } } | null>(null);
  const [leadMsg, setLeadMsg] = useState("");
  const [groupMsg, setGroupMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Voice input
  const voice = useVoiceInput((text) => {
    if (tab === "lead") setLeadMsg((prev) => prev + (prev ? " " : "") + text);
    else setGroupMsg((prev) => prev + (prev ? " " : "") + text);
  });

  // Auth check: if token set but mismatch, block access
  useEffect(() => {
    mobileFetch("/api/workspace").then(async (response) => {
      if (!response.ok) throw new Error("Mobile authorization failed");
      const d = await response.json();
      const saved = d?.settings?.mobileAuthToken ?? "";
      if (!saved || urlToken === saved) setAuthed(true);
      else setAuthed(false);
    }).catch(() => setAuthed(false));
  }, [mobileFetch, urlToken]);

  const f = useCallback(async () => { try { const r = await mobileFetch("/api/workspace"); if (r.ok) { const next = await r.json(); setData(next); setPreviewUrl(next?.settings?.previewUrl ? `/api/preview/proxy?token=${encodeURIComponent(urlToken)}` : ""); } } catch { /* */ } }, [mobileFetch, urlToken]);

  const refreshState = useCallback(async () => {
    try {
      const [stateResponse, eventsResponse, logsResponse] = await Promise.all([
        mobileFetch("/api/orchestrate/state", { cache: "no-store" }),
        mobileFetch("/api/orchestrate/events?limit=5", { cache: "no-store" }),
        mobileFetch("/api/system-events?limit=5", { cache: "no-store" }),
      ]);
      if (stateResponse.ok) {
        const payload = await stateResponse.json() as { activeTask?: ActiveTask | null };
        setActiveTask(payload.activeTask ?? null);
      }
      if (eventsResponse.ok) {
        const payload = await eventsResponse.json() as { events?: OrchestratorEvent[] };
        setOrchestratorEvents(payload.events ?? []);
      }
      if (logsResponse.ok) {
        const payload = await logsResponse.json() as { events?: SystemEvent[] };
        setSystemEvents(payload.events ?? []);
      }
    } catch {
      // State is best-effort; the chat remains available.
    }
  }, [mobileFetch]);

  useEffect(() => {
    void refreshState();
    const timer = setInterval(() => void refreshState(), 2000);
    return () => clearInterval(timer);
  }, [refreshState]);
  // Initial fetch + poll — external data sync, not cascading state
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void f();
    pollRef.current = setInterval(f, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [f]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [data?.messages?.length, stream]);

  const msgs = useMemo(() => {
    const all = data?.messages ?? [];
    if (tab === "lead") {
      const mainId = data?.agents?.find(a => a.role === "main")?.id ?? -1;
      return all.filter(m => m.chatChannel === "lead" && m.senderType !== "system"
        && (m.senderType !== "agent" || !m.metadata?.identity?.agentId || m.metadata.identity.agentId === mainId));
    }
    return all.filter(m => m.chatChannel === "group" && m.senderType !== "system");
  }, [data, tab]);

  async function startPreview() {
    setPreviewLoading(true);
    try {
      const response = await mobileFetch("/api/preview", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Preview failed");
      setPreviewUrl(payload.url ? `/api/preview/proxy?token=${encodeURIComponent(urlToken)}` : "");
      setStatus("Preview запущен");
    } catch (error) {
      setStatus(error instanceof Error ? `Ошибка: ${error.message}` : "Ошибка preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function sendPreviewFeedback(value: string) {
    try {
      const response = await mobileFetch("/api/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: value }) });
      if (!response.ok) throw new Error("Feedback failed");
      setStatus("Комментарий отправлен Дизайнеру");
    } catch (error) {
      setStatus(error instanceof Error ? `Ошибка: ${error.message}` : "Ошибка отправки комментария");
    }
  }

  async function send() {
    const msg = tab === "lead" ? leadMsg : groupMsg;
    if (!msg.trim() || sending) return;
    setSending(true); tab === "lead" ? setLeadMsg("") : setGroupMsg("");
    setStream({}); setStatus("...");
    abortRef.current = new AbortController();
    try {
      const res = await mobileFetch("/api/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message: msg, locale: "ru", channel: tab === "lead" ? "lead" : "group", duplicateToLead: false }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("Chat error");
      if (!res.body) throw new Error("No body");
      const r = res.body.getReader(); const d = new TextDecoder(); let b = "";
      while (true) { const { done, value } = await r.read(); if (done) break; b += d.decode(value, { stream: true });
        const ls = b.split("\n"); b = ls.pop() || "";
        for (const l of ls) { if (!hasSseData(l)) continue;
          const ev = parseSseJson<{ type: string; text?: string; identity?: AgentIdentity }>(l);
          if (!ev) continue;
          if (ev.type === "delta" && ev.identity) { setStream(p => ({ ...p, [ev.identity!.agentId]: (p[ev.identity!.agentId] || "") + (ev.text || "") })); setStatus(""); }
          if (ev.type === "agent_done") setStream(p => { const n = { ...p }; delete n[ev.identity!.agentId]; return n; });
          if (ev.type === "error") setStatus("Ошибка: " + (ev as any).message);
        }
      }
    } catch (e: any) { if (e.name !== "AbortError") setStatus("Ошибка: " + (e.message || "сеть")); }
    finally { setSending(false); f(); }
  }

  if (authed === false) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: "var(--bg-app)", color: "var(--text-primary)", flexDirection: "column", gap: 12, padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Нет доступа</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Неверный или отсутствующий токен. Добавьте ?token=... к URL.</div>
    </div>
  );
  if (authed === null) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: "var(--bg-app)", color: "var(--text-secondary)" }}>Загрузка...</div>;

  if (tab === "settings") return <MobileSettings onBack={() => setTab("lead")} agents={data?.agents ?? []} accessToken={urlToken} />;

  async function stopTask() {
    if (!activeTask) {
      setStatus("Активной задачи нет");
      return;
    }
    try {
      const response = await mobileFetch("/api/orchestrate/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: activeTask.taskId }),
      });
      if (!response.ok) throw new Error("Не удалось остановить задачу");
      setStatus("Задача остановлена");
      await refreshState();
    } catch (error) {
      setStatus(error instanceof Error ? `Ошибка: ${error.message}` : "Ошибка остановки");
    }
  }

  async function continueTask() {
    await refreshState();
    setStatus(activeTask ? "Задача уже выполняется" : "Активной задачи для продолжения нет; запустите её на компьютере");
  }

  function stateLabel() {
    if (!activeTask) return data?.settings?.autoApprove ? "AUTO включён, задача не запущена" : "Готов";
    if (activeTask.mode === "controlled") return `Пауза / ожидание действия · ${activeTask.step}`;
    return data?.settings?.autoApprove ? `AUTO · ${activeTask.step}` : `Выполняется · ${activeTask.step}`;
  }

  const currentAgent = orchestratorEvents[orchestratorEvents.length - 1];

  const vars = (k: string) => `var(--${k})`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: vars("bg-app"), color: vars("text-primary") }}>
      <header style={{ background: vars("bg-panel"), borderBottom: `1px solid ${vars("border-default")}`, display: "flex", padding: "0 8px" }}>
        {(["lead","group","state","settings"] as MobileTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, border: "none",
              background: tab === t ? vars("bg-selection") : "transparent",
              color: tab === t ? vars("text-accent") : vars("text-secondary"), cursor: "pointer" }}>
            {t === "lead" ? "🤖 Главный" : t === "group" ? "💬 Общий" : t === "state" ? "📊 Состояние" : "⚙️"}
          </button>))}
        <button type="button" onClick={() => setPreviewOpen(true)} style={{ marginLeft: "auto", padding: "10px 10px", fontSize: 13, fontWeight: 700, border: "none", background: "transparent", color: vars("text-secondary"), cursor: "pointer" }} title="Предпросмотр">👁️</button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {tab === "state" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <section style={{ background: vars("bg-panel"), border: `1px solid ${vars("border-default")}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: vars("text-secondary"), marginBottom: 5 }}>Статус оркестратора</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: activeTask ? "#d29922" : "#3fb950" }}>{stateLabel()}</div>
              {activeTask ? <>
                <div style={{ marginTop: 8, fontSize: 13, wordBreak: "break-word" }}>{activeTask.task}</div>
                <div style={{ marginTop: 8, color: vars("text-secondary"), fontSize: 12 }}>
                  {currentAgent ? `${currentAgent.agent} · Итерация ${activeTask.iteration} из ${activeTask.maxIterations}` : `Итерация ${activeTask.iteration} из ${activeTask.maxIterations}`}
                </div>
              </> : <div style={{ marginTop: 6, color: vars("text-secondary"), fontSize: 12 }}>Активных задач нет</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => void stopTask()} style={{ border: "none", borderRadius: 8, padding: "8px 12px", background: "#a12828", color: "white", fontWeight: 700 }}>Остановить</button>
                <button type="button" onClick={() => void continueTask()} style={{ border: "none", borderRadius: 8, padding: "8px 12px", background: vars("bg-status"), color: "white", fontWeight: 700 }}>Продолжить</button>
                <button type="button" onClick={() => void refreshState()} style={{ border: `1px solid ${vars("border-input")}`, borderRadius: 8, padding: "8px 12px", background: vars("bg-input"), color: vars("text-primary"), fontWeight: 700 }}>Обновить состояние</button>
              </div>
            </section>
            <section style={{ background: vars("bg-panel"), border: `1px solid ${vars("border-default")}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Последние системные события</div>
              {systemEvents.length === 0 ? <div style={{ color: vars("text-secondary"), fontSize: 12 }}>Событий нет</div> : systemEvents.slice(0, 5).map(event => {
                const isError = event.level === "error";
                const isWarning = event.level === "warning";
                return <div key={event.id} style={{ borderLeft: `3px solid ${isError ? "#f85149" : isWarning ? "#d29922" : "#3fb950"}`, background: isError ? "#3b1618" : vars("bg-input"), borderRadius: 6, padding: "7px 8px", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: vars("text-secondary") }}>{event.source} · {new Date(event.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div style={{ fontSize: 12, color: isError ? "#ffb4b4" : vars("text-primary"), wordBreak: "break-word" }}>{event.message}</div>
                </div>;
              })}
            </section>
          </div>
        ) : null}
        {tab !== "state" && msgs.map(m => (
          <div key={m.id} style={m.senderType === "user"
            ? { alignSelf: "flex-end", background: vars("bg-message-user"), color: "white", maxWidth: "88%", borderRadius: "14px 14px 4px 14px", padding: "8px 14px", fontSize: 14, marginBottom: 6 }
            : { alignSelf: "flex-start", background: vars("bg-message-agent"), color: vars("text-primary"), maxWidth: "88%", borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 14, marginBottom: 6, border: `1px solid ${vars("border-default")}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, color: msgColor(m, data?.agents ?? []) }}>
              {msgName(m)} · {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
          </div>))}
        {tab !== "state" && Object.entries(stream).map(([id, text]) => (
          <div key={id} style={{ alignSelf: "flex-start", background: vars("bg-message-agent"), opacity: 0.8, color: vars("text-primary"), maxWidth: "88%", borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 14, marginBottom: 6, border: `1px solid ${vars("border-default")}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, color: vars("text-accent") }}>Пишет...</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
          </div>))}
        <div ref={endRef} />
      </div>

      {(data?.settings?.autoApprove && !sending && tab !== "state") && <div style={{ padding: "4px 12px", fontSize: 11, background: vars("bg-panel"), borderTop: `1px solid ${vars("border-default")}`, color: vars("text-secondary") }}>🔄 Авто-цикл активен</div>}
      <PreviewModal open={previewOpen} url={previewUrl} loading={previewLoading} onClose={() => setPreviewOpen(false)} onReload={() => void startPreview()} onStart={() => void startPreview()} onFeedback={(value) => void sendPreviewFeedback(value)} />
      {status && <div style={{ padding: "4px 12px", fontSize: 12, color: status.startsWith("Ошибка") ? "#f48771" : vars("text-accent") }}>{status}</div>}

      {tab !== "state" && <form onSubmit={e => { e.preventDefault(); void send(); }}
        style={{ padding: "8px 10px", borderTop: `1px solid ${vars("border-default")}`, background: vars("bg-panel"), display: "flex", gap: 8, alignItems: "center" }}>
        <input value={tab === "lead" ? leadMsg : groupMsg}
          onChange={e => tab === "lead" ? setLeadMsg(e.target.value) : setGroupMsg(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${vars("border-input")}`, background: vars("bg-input"), color: vars("text-primary"), fontSize: 14, outline: "none" }}
          placeholder="Сообщение..." disabled={sending} />
        {voice.supported ? (
          <button type="button" onClick={voice.toggle}
            style={{ background: voice.listening ? "#a12828" : vars("bg-input"), color: voice.listening ? "white" : vars("text-secondary"), border: `1px solid ${vars("border-input")}`, borderRadius: 20, padding: "10px 12px", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>
            🎙️
          </button>
        ) : null}
        <button type="submit" style={{ background: vars("bg-status"), color: "white", border: "none", borderRadius: 20, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: sending ? 0.5 : 1 }} disabled={sending}>↑</button>
        {sending && <button type="button" onClick={() => { abortRef.current?.abort(); setSending(false); }} style={{ background: "#a12828", color: "white", border: "none", borderRadius: 20, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✕</button>}
      </form>}
    </div>
  );
}