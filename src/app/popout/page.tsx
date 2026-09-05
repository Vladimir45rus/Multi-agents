"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sanitizeChatContent } from "@/lib/chat-display";
import type { AgentIdentity } from "@/lib/agent-identity";

export const dynamic = "force-dynamic";

type PopoutMessage = {
  id: number;
  chatChannel: string;
  senderType: string;
  agentName: string | null;
  content: string;
  createdAt: string;
  metadata?: { identity?: AgentIdentity };
};

const ROLE_COLORS: Record<string, string> = {
  main: "#8b5cf6", architect: "#10b981", reviewer: "#f97316",
  tester: "#ef4444", uiux: "#ec4899", advisor: "#06b6d4",
  security: "#f59e0b", observer: "#64748b",
};

export default function PopoutChatPage() {
  const sp = useSearchParams();
  const channel = sp.get("channel") === "lead" ? "lead" : "group";
  const [messages, setMessages] = useState<PopoutMessage[]>([]);
  const [agents, setAgents] = useState<Array<{ id: number; name: string; role: string; isActive: boolean; color: string }>>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [fontScale, setFontScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const stored = Number(window.localStorage.getItem("chatFontScale"));
    return Number.isFinite(stored) && stored >= 0.8 && stored <= 1.6 ? stored : 1;
  });
  const endRef = useRef<HTMLDivElement>(null);

  const changeFont = (delta: number) => {
    setFontScale((prev) => {
      const next = Math.min(1.6, Math.max(0.8, Math.round((prev + delta) * 100) / 100));
      window.localStorage.setItem("chatFontScale", String(next));
      return next;
    });
  };

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: PopoutMessage[];
        agents: Array<{ id: number; name: string; role: string; isActive: boolean; color: string }>;
      };
      setAgents(data.agents ?? []);
      setMessages((data.messages ?? []).filter((m) => m.chatChannel === channel && m.senderType !== "system"));
    } catch { /* keep last snapshot */ }
  }, [channel]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Lead chat: only the user and the Lead agent are visible.
  const visible = messages.filter((m) => {
    if (channel !== "lead") return true;
    if (m.senderType === "user" || m.senderType === "main") return true;
    const agentId = m.metadata?.identity?.agentId;
    const mainId = agents.find((a) => a.role === "main")?.id;
    return agentId ? agentId === mainId : false;
  });

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, channel, locale: "ru" }),
      });
    } catch { /* poll keeps the last snapshot */ }
    finally { setBusy(false); void poll(); }
  }

  return (
    <div className="flex h-screen flex-col bg-[#0d1117] text-[#c9d1d9]">
      <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-3 py-1.5">
        <span className="text-xs font-bold text-[#58a6ff]">
          {channel === "lead" ? "ЧАТ С ГЛАВНЫМ" : "ОБЩИЙ ЧАТ АГЕНТОВ"}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeFont(-0.1)} className="rounded border border-[#30363d] px-1.5 text-[10px] text-[#8b949e] hover:text-white">A−</button>
          <button type="button" onClick={() => changeFont(0.1)} className="rounded border border-[#30363d] px-1.5 text-[10px] text-[#8b949e] hover:text-white">A+</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2" style={{ zoom: fontScale }}>
        {visible.map((msg) => {
          const isUser = msg.senderType === "user";
          const role = msg.metadata?.identity?.role ?? "";
          const color = ROLE_COLORS[role] ?? "#4fc1ff";
          return (
            <div
              key={msg.id}
              className={`w-fit max-w-[92%] rounded border p-2 text-sm ${isUser ? "ml-auto border-[#007acc] bg-[#0e639c] text-white" : "mr-auto border-[#30363d] bg-[#161b22]"}`}
            >
              <p className="mb-1 flex items-center gap-1 text-[10px] text-[#8b949e]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isUser ? "#4fc1ff" : color }} />
                {isUser ? "Вы" : msg.agentName ?? role} · {new Date(msg.createdAt).toLocaleTimeString("ru")}
              </p>
              <p className="whitespace-pre-wrap break-words">{sanitizeChatContent(msg.content, "ru")}</p>
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="p-2 text-xs text-[#8b949e]">{channel === "lead" ? "Напишите Главному агенту…" : "Напишите в общий чат…"}</p>
        ) : null}
        <div ref={endRef} aria-hidden="true" />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-[#30363d] bg-[#161b22] p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          rows={2}
          placeholder={channel === "lead" ? "Сообщение Главному…" : "Сообщение в общий чат…"}
          disabled={busy}
          className="min-w-0 flex-1 resize-y rounded border border-[#30363d] bg-[#0d1117] p-2 text-sm text-[#c9d1d9] outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-[#238636] px-3 py-2 text-sm font-semibold text-white disabled:bg-[#30363d] disabled:text-[#8b949e]"
        >
          {busy ? "…" : "→"}
        </button>
      </form>
    </div>
  );
}
