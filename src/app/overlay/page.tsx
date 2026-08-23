"use client";

import { useEffect, useState, useRef } from "react";

export const dynamic = "force-dynamic";

type AgentStatus = {
  id: number;
  name: string;
  role: string;
  provider: string;
  model: string;
  isActive: boolean;
  color: string;
};

type LiveChat = {
  agentId: number;
  name: string;
  role: string;
  content: string;
  status: "streaming" | "done" | "error";
  errorMessage?: string;
};

type OrchAgentEntry = { name: string; role: string; status: string; message?: string };

type OrchEvent = { id: number; type: string; agent: string; status: string; createdAt: string };

type OrchestratorState = {
  taskId?: string;
  task?: string;
  mode?: string;
  step?: string;
  iteration?: number;
  maxIterations?: number;
  agents: OrchAgentEntry[];
  events: OrchEvent[];
  report?: string;
};

type WorkspaceData = {
  settings: {
    workspaceName: string;
    projectRoot: string;
    mainCoderAgentId: number | null;
    autoApprove: boolean;
    localtunnelUrl: string;
    previewUrl: string;
  };
  agents: AgentStatus[];
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
    main: "🧠",
    architect: "🏗️",
    reviewer: "🔍",
    tester: "🧪",
    uiux: "🎨",
    advisor: "💡",
    security: "🛡️",
    observer: "👁️",
  };
  return map[role] ?? "🤖";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "сейчас";
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}м`;
  return `${Math.floor(min / 60)}ч`;
}

export default function OverlayPage() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [orchestrator, setOrchestrator] = useState<OrchestratorState | null>(null);
  const [liveChats] = useState<LiveChat[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState("");
  const sourceRef = useRef<EventSource | null>(null);

  // Poll workspace state every 3 seconds
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/workspace", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as WorkspaceData;
        if (active) setWorkspace(data);
      } catch {
        // ignore
      }
      if (active) pollTimer = setTimeout(poll, 3000);
    }
    let pollTimer = setTimeout(poll, 0);
    return () => {
      active = false;
      clearTimeout(pollTimer);
    };
  }, []);

  // Poll orchestrator events every 2 seconds
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const [eventsRes, reportsRes] = await Promise.all([
          fetch("/api/orchestrate/events?limit=10", { cache: "no-store" }),
          fetch("/api/orchestrate/reports?limit=1", { cache: "no-store" }),
        ]);
        if (!active) return;
        const eventsPayload = (await eventsRes.json().catch(() => null)) as { events?: OrchEvent[] } | null;
        const reportsPayload = (await reportsRes.json().catch(() => null)) as { reports?: Array<{ summary: string }> } | null;

        if (eventsPayload?.events?.length) {
          const latest = eventsPayload.events[0];
          setLastEvent(`${latest.agent} — ${latest.type}`);
          setOrchestrator((prev) => ({
            taskId: prev?.taskId,
            task: prev?.task,
            mode: prev?.mode,
            step: prev?.step,
            iteration: prev?.iteration,
            maxIterations: prev?.maxIterations,
            agents: prev?.agents ?? [],
            events: eventsPayload?.events ?? [],
            report: reportsPayload?.reports?.[0]?.summary ?? prev?.report,
          }));
        }
        const latestReport = reportsPayload?.reports?.[0];
        if (latestReport) {
          setOrchestrator((prev) => ({
            taskId: prev?.taskId,
            task: prev?.task,
            mode: prev?.mode,
            step: prev?.step,
            iteration: prev?.iteration,
            maxIterations: prev?.maxIterations,
            agents: prev?.agents ?? [],
            events: prev?.events ?? [],
            report: latestReport.summary,
          }));
        }
      } catch {
        // ignore
      }
      if (active) pollTimer2 = setTimeout(poll, 2000);
    }
    let pollTimer2 = setTimeout(poll, 500);
    return () => {
      active = false;
      clearTimeout(pollTimer2);
    };
  }, []);

  // Connect to orchestrator SSE stream
  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (!active) return;
      const es = new EventSource("/api/orchestrate/stream");
      sourceRef.current = es;

      es.onopen = () => {
        if (active) setConnected(true);
      };

      es.onmessage = (event) => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data) as {
            type: string;
            task?: string;
            taskId?: string;
            maxIterations?: number;
            mode?: string;
            step?: string;
            iteration?: number;
            agent?: string;
            role?: string;
            status?: string;
            message?: string;
            total?: number;
          };

          if (data.type === "task_started") {
            setOrchestrator({
              taskId: data.taskId,
              task: data.task,
              maxIterations: data.maxIterations,
              mode: data.mode,
              agents: [],
              events: [],
            });
          } else if (data.type === "agent_status") {
            setOrchestrator((prev) => {
              const existing = prev?.agents ?? [];
              const entry: OrchAgentEntry = { name: data.agent ?? "", role: data.role ?? "", status: data.status ?? "", message: data.message };
              const idx = existing.findIndex((a) => a.name === data.agent);
              const agents = idx >= 0 ? existing.map((a, i) => (i === idx ? entry : a)) : [...existing, entry];
              return {
                taskId: prev?.taskId,
                task: prev?.task,
                mode: prev?.mode,
                step: prev?.step,
                iteration: prev?.iteration,
                maxIterations: prev?.maxIterations,
                agents,
                events: prev?.events ?? [],
                report: prev?.report,
              };
            });
          } else if (data.type === "step") {
            setOrchestrator((prev) => ({
              taskId: prev?.taskId,
              task: prev?.task,
              mode: prev?.mode,
              step: data.step,
              iteration: data.iteration,
              maxIterations: prev?.maxIterations,
              agents: prev?.agents ?? [],
              events: prev?.events ?? [],
              report: prev?.report,
            }));
          } else if (data.type === "task_completed") {
            setOrchestrator(null);
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (active) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      sourceRef.current?.close();
    };
  }, []);

  const sortedAgents = [...(workspace?.agents ?? [])].sort((a, b) => {
    const order: Record<string, number> = { main: 0, architect: 1, uiux: 2, advisor: 3, reviewer: 4, tester: 5, security: 6, observer: 7 };
    return (order[a.role] ?? 99) - (order[b.role] ?? 99);
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 12,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          background: "#161b22",
          borderBottom: "1px solid #30363d",
          minHeight: 30,
        }}
      >
        <span style={{ fontWeight: 700, color: "#58a6ff", fontSize: 13 }}>
          {workspace?.settings?.workspaceName || "Multi-Agent Studio"}
        </span>

        {/* Connection indicator */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "#3fb950" : orchestrator ? "#d29922" : "#555",
            flexShrink: 0,
          }}
          title={connected ? "Stream connected" : orchestrator ? "Task active" : "Idle"}
        />

        {/* Orchestrator status */}
        {orchestrator?.task ? (
          <span style={{ color: "#d2a8ff", fontSize: 11, marginLeft: "auto" }}>
            {orchestrator.step ?? "..."} {orchestrator.iteration != null ? `(${orchestrator.iteration}/${orchestrator.maxIterations ?? "?"})` : ""}
          </span>
        ) : (
          <span style={{ color: "#8b949e", fontSize: 11, marginLeft: "auto" }}>Idle</span>
        )}
      </div>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "auto 1fr",
          gap: 1,
          flex: 1,
          overflow: "hidden",
          background: "#30363d",
        }}
      >
        {/* Agents panel */}
        <div style={{ background: "#0d1117", overflow: "auto", padding: "4px 8px" }}>
          <div style={{ color: "#8b949e", fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Agents ({sortedAgents.length})
          </div>
          {sortedAgents.map((agent) => {
            const color = agent.color ?? ROLE_COLORS[agent.role] ?? "#4fc1ff";
            const orchAgent = orchestrator?.agents.find((a) => a.name === agent.name);
            const statusColor = orchAgent
              ? orchAgent.status === "done"
                ? "#3fb950"
                : orchAgent.status === "error"
                  ? "#f85149"
                  : "#d29922"
              : agent.isActive
                ? "#3fb950"
                : "#484f58";

            return (
              <div
                key={agent.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 4px",
                  borderRadius: 4,
                  marginBottom: 1,
                }}
              >
                <span style={{ fontSize: 10 }}>{roleEmoji(agent.role)}</span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: statusColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {agent.name}
                </span>
                <span style={{ color, fontSize: 10, fontWeight: 600 }}>
                  {agent.role}
                </span>
              </div>
            );
          })}
          {sortedAgents.length === 0 && (
            <div style={{ color: "#484f58", fontSize: 10, padding: 8 }}>No agents configured</div>
          )}
        </div>

        {/* Orchestrator events */}
        <div style={{ background: "#0d1117", overflow: "auto", padding: "4px 8px" }}>
          <div style={{ color: "#8b949e", fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Events
          </div>
          {orchestrator?.agents.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 4px",
                fontSize: 10,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: a.status === "done" ? "#3fb950" : a.status === "error" ? "#f85149" : "#d29922",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "#58a6ff" }}>{a.name}</span>
              <span style={{ color: "#8b949e" }}>{a.status}</span>
              {a.message && <span style={{ color: "#f85149", fontSize: 9 }}>{a.message.slice(0, 60)}</span>}
            </div>
          ))}
          {orchestrator?.events.slice(0, 8).map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                gap: 6,
                padding: "1px 4px",
                fontSize: 10,
                color: "#484f58",
              }}
            >
              <span style={{ color: "#8b949e", width: 50, flexShrink: 0 }}>{timeAgo(e.createdAt)}</span>
              <span style={{ color: "#58a6ff" }}>{e.agent}</span>
              <span>{e.type}</span>
              <span>{e.status}</span>
            </div>
          ))}
          {!orchestrator && (
            <div style={{ color: "#484f58", fontSize: 10, padding: 8 }}>No active task</div>
          )}
        </div>

        {/* Live chat */}
        <div style={{ background: "#0d1117", overflow: "auto", padding: "4px 8px", gridColumn: "1 / -1" }}>
          <div style={{ color: "#8b949e", fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Live Chat
          </div>
          {liveChats.length === 0 && (
            <div style={{ color: "#484f58", fontSize: 10, padding: 4 }}>Waiting for messages...</div>
          )}
          {liveChats.map((chat) => {
            const color = ROLE_COLORS[chat.role] ?? "#4fc1ff";
            return (
              <div
                key={`${chat.agentId}-${chat.status}`}
                style={{
                  padding: "4px 6px",
                  marginBottom: 2,
                  borderRadius: 4,
                  background: "#161b22",
                  borderLeft: `2px solid ${color}`,
                }}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ color, fontWeight: 600, fontSize: 11 }}>
                    {chat.name}
                  </span>
                  <span style={{ color: "#8b949e", fontSize: 9 }}>
                    {chat.role}
                  </span>
                  <span
                    style={{
                      color: chat.status === "streaming" ? "#d29922" : chat.status === "error" ? "#f85149" : "#3fb950",
                      fontSize: 9,
                      marginLeft: "auto",
                    }}
                  >
                    {chat.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#c9d1d9",
                    maxHeight: 36,
                    overflow: "hidden",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {chat.errorMessage ?? chat.content.slice(-120)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "2px 12px",
          background: "#161b22",
          borderTop: "1px solid #30363d",
          fontSize: 10,
          color: "#484f58",
          gap: 16,
          minHeight: 22,
        }}
      >
        <span>{workspace?.settings?.projectRoot || "No workspace"}</span>
        <span style={{ marginLeft: "auto" }}>{lastEvent}</span>
        <span>{connected ? "● LIVE" : "○ polling"}</span>
      </div>
    </div>
  );
}