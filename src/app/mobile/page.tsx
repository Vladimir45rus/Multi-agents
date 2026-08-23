"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { hasSseData, parseSseJson } from "@/lib/sse-json";
import type { AgentIdentity } from "@/lib/agent-identity";
import { MobileSettings } from "./settings";
import { useVoiceInput } from "./voice-input";

type MobileTab = "lead" | "group" | "settings";

type ChatMsg = {
  id: number; chatChannel: "lead" | "group"; senderType: string;
  agentName?: string | null; content: string;
  metadata: { identity?: AgentIdentity }; createdAt: string;
};
type AgentInfo = { id: number; name: string; role: string; color: string; isActive: boolean; provider: string; model: string };

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
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<MobileTab>("lead");
  const [data, setData] = useState<{ messages: ChatMsg[]; agents: AgentInfo[]; settings: { autoApprove: boolean; mobileAuthToken: string } } | null>(null);
  const [leadMsg, setLeadMsg] = useState("");
  const [groupMsg, setGroupMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
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
    fetch("/api/workspace").then(r => r.json()).then(d => {
      const saved = d?.settings?.mobileAuthToken ?? "";
      if (!saved || urlToken === saved) setAuthed(true);
      else setAuthed(false);
    }).catch(() => setAuthed(true)); // fail open
  }, [urlToken]);

  const f = async () => { try { const r = await fetch("/api/workspace"); if (r.ok) setData(await r.json()); } catch { /* */ } };
  // Initial fetch + poll — external data sync, not cascading state
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void f();
    pollRef.current = setInterval(f, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);
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

  async function send() {
    const msg = tab === "lead" ? leadMsg : groupMsg;
    if (!msg.trim() || sending) return;
    setSending(true); tab === "lead" ? setLeadMsg("") : setGroupMsg("");
    setStream({}); setStatus("...");
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/chat/stream", {
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

  if (tab === "settings") return <MobileSettings onBack={() => setTab("lead")} agents={data?.agents ?? []} />;

  const vars = (k: string) => `var(--${k})`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: vars("bg-app"), color: vars("text-primary") }}>
      <header style={{ background: vars("bg-panel"), borderBottom: `1px solid ${vars("border-default")}`, display: "flex", padding: "0 8px" }}>
        {(["lead","group","settings"] as MobileTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, border: "none",
              background: tab === t ? vars("bg-selection") : "transparent",
              color: tab === t ? vars("text-accent") : vars("text-secondary"), cursor: "pointer" }}>
            {t === "lead" ? "🤖 Главный" : t === "group" ? "💬 Общий" : "⚙️"}
          </button>))}
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {msgs.map(m => (
          <div key={m.id} style={m.senderType === "user"
            ? { alignSelf: "flex-end", background: vars("bg-message-user"), color: "white", maxWidth: "88%", borderRadius: "14px 14px 4px 14px", padding: "8px 14px", fontSize: 14, marginBottom: 6 }
            : { alignSelf: "flex-start", background: vars("bg-message-agent"), color: vars("text-primary"), maxWidth: "88%", borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 14, marginBottom: 6, border: `1px solid ${vars("border-default")}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, color: msgColor(m, data?.agents ?? []) }}>
              {msgName(m)} · {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
          </div>))}
        {Object.entries(stream).map(([id, text]) => (
          <div key={id} style={{ alignSelf: "flex-start", background: vars("bg-message-agent"), opacity: 0.8, color: vars("text-primary"), maxWidth: "88%", borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 14, marginBottom: 6, border: `1px solid ${vars("border-default")}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, color: vars("text-accent") }}>Пишет...</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
          </div>))}
        <div ref={endRef} />
      </div>

      {(data?.settings?.autoApprove && !sending) && <div style={{ padding: "4px 12px", fontSize: 11, background: vars("bg-panel"), borderTop: `1px solid ${vars("border-default")}`, color: vars("text-secondary") }}>🔄 Авто-цикл активен</div>}
      {status && <div style={{ padding: "4px 12px", fontSize: 12, color: status.startsWith("Ошибка") ? "#f48771" : vars("text-accent") }}>{status}</div>}

      <form onSubmit={e => { e.preventDefault(); void send(); }}
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
      </form>
    </div>
  );
}