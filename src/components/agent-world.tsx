"use client";

import { useEffect, useMemo, useState } from "react";

// "Живой мир": the team as people in a room. Everything on screen is derived
// from real orchestrator data — no invented activity. Agents stand at the board
// while talking, sit at desks while working, argue when the skeptic blocks, and
// go home when the shift is over.
export type WorldAgent = {
  id: number;
  name: string;
  role: string;
  color: string;
  isActive: boolean;
};

export type WorldLine = {
  id: string;
  agentId: number;
  name: string;
  role: string;
  color: string;
  text: string;
  stance: "approve" | "change" | "blocker" | "none";
};

type Spot = { x: number; y: number; label: string };

// Where each role stands in the room. `home` is the doorway.
const SPOTS: Record<string, Spot> = {
  main: { x: 210, y: 286, label: "у доски" },
  architect: { x: 320, y: 246, label: "у схемы" },
  uiux: { x: 470, y: 252, label: "у макета" },
  reviewer: { x: 570, y: 316, label: "за столом" },
  tester: { x: 660, y: 292, label: "на проверке" },
  security: { x: 620, y: 240, label: "у замка" },
  skeptic: { x: 740, y: 300, label: "на стрёме" },
  advisor: { x: 300, y: 316, label: "рядом" },
  observer: { x: 780, y: 246, label: "следит" },
  auto: { x: 400, y: 300, label: "в цикле" },
};

const DOOR: Spot = { x: 872, y: 300, label: "домой" };
const COUCH: Spot = { x: 726, y: 392, label: "на диване" };

const ROLE_ICON: Record<string, string> = {
  main: "★", advisor: "?", architect: "△", reviewer: "☑", tester: "✓",
  uiux: "◐", security: "⛨", skeptic: "!", observer: "◉", auto: "∞",
};

const SKIN = ["#f3c9a6", "#e2ac86", "#c98d63", "#f6d8bd", "#d9a273"];
const HAIR = ["#2b2b31", "#5a3a22", "#8a5a2b", "#1d1d22", "#6b4423"];

type Mood = "talking" | "working" | "blocked" | "walking" | "home" | "idle";

function moodOf(agent: WorldAgent, currentId: number | null, running: boolean, blockers: number): Mood {
  if (!agent.isActive) return "home";
  if (!running) return "idle";
  if (agent.id === currentId) return "talking";
  if (agent.role === "skeptic" && blockers > 0) return "blocked";
  return "working";
}

function Figure({ agent, spot, mood, index, speaking, onSelect }: {
  agent: WorldAgent;
  spot: Spot;
  mood: Mood;
  index: number;
  speaking: boolean;
  onSelect: () => void;
}) {
  const skin = SKIN[index % SKIN.length];
  const hair = HAIR[(index + 1) % HAIR.length];
  const angry = mood === "blocked";
  const atDesk = mood === "working" || mood === "idle";
  const talking = mood === "talking";
  const going = mood === "home";

  return (
    <g
      transform={`translate(${going ? DOOR.x : spot.x} ${going ? DOOR.y : spot.y})`}
      style={{ transition: "transform 1600ms cubic-bezier(.4,0,.2,1)", cursor: "pointer", opacity: going ? 0.85 : 1 }}
      onClick={onSelect}
    >
      <ellipse cx="0" cy="54" rx="26" ry="7" fill="#000" opacity="0.3" />
      {speaking || talking ? <circle cx="0" cy="6" r="46" fill="#fde68a" opacity="0.14" /> : null}

      {/* chair when seated */}
      {atDesk ? <rect x="-25" y="4" width="50" height="44" rx="10" fill="#3b2f26" opacity="0.75" /> : null}

      {/* legs */}
      {going ? (
        <>
          <path d="M-8 36 l-10 18" stroke={agent.color} strokeWidth="8" strokeLinecap="round" />
          <path d="M8 36 l10 16" stroke={agent.color} strokeWidth="8" strokeLinecap="round" />
        </>
      ) : atDesk ? (
        <>
          <path d="M-9 40 h18" stroke={agent.color} strokeWidth="9" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-7 36 l-3 18" stroke={agent.color} strokeWidth="8" strokeLinecap="round" />
          <path d="M7 36 l3 18" stroke={agent.color} strokeWidth="8" strokeLinecap="round" />
        </>
      )}

      <rect x="-16" y="6" width="32" height="34" rx="11" fill={agent.color} />

      {/* arms by mood */}
      {angry ? (
        <>
          <path d="M-14 16 q-18 -10 -14 -26" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="-29" cy="-13" r="6" fill={skin} />
          <path d="M14 18 q16 -6 18 -20" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="33" cy="-5" r="6" fill={skin} />
        </>
      ) : talking ? (
        <>
          <path d="M-14 18 q-20 2 -24 -12" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="-40" cy="2" r="6" fill={skin} />
          <path d="M14 20 q14 6 20 14" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-14 18 q-12 8 -14 20" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M14 18 q12 8 14 20" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="-30" cy="40" r="5.5" fill={skin} />
          <circle cx="30" cy="40" r="5.5" fill={skin} />
        </>
      )}

      {/* head */}
      <rect x="-4" y="2" width="8" height="8" fill={skin} />
      <ellipse cx="0" cy="-8" rx="14" ry="15" fill={skin} />
      <path d="M-14 -10 q14 -17 28 0 q-6 -11 -14 -11 q-8 0 -14 11 z" fill={hair} />
      {index % 3 === 0 ? <path d="M-11 2 q11 12 22 0 q-3 12 -11 12 q-8 0 -11 -12 z" fill={hair} opacity="0.9" /> : null}
      {index % 3 === 1 ? (
        <g stroke="#cbd5e1" strokeWidth="1.3" fill="none">
          <circle cx="-5.5" cy="-8" r="4.2" /><circle cx="5.5" cy="-8" r="4.2" /><path d="M-1.3 -8 h2.6" />
        </g>
      ) : null}
      {index % 3 === 2 ? <circle cx="12" cy="-18" r="4.6" fill={hair} /> : null}
      <circle cx="-5" cy="-8" r="1.6" fill="#23232a" />
      <circle cx="5" cy="-8" r="1.6" fill="#23232a" />
      {angry ? (
        <>
          <path d="M-10 -14 l5 3" stroke="#23232a" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10 -14 l-5 3" stroke="#23232a" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M-4 0 q4 -4 8 0" stroke="#8b1d2c" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </>
      ) : talking ? (
        <ellipse cx="0" cy="1" rx="3.4" ry="2.6" fill="#8b1d2c" />
      ) : (
        <path d="M-3 -1 q3 3 6 0" stroke="#8a5a4a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}

      {/* accessory per role */}
      {agent.role === "architect" && talking ? (
        <path d="M-16 24 l-34 -18" stroke="#e2c19a" strokeWidth="3" strokeLinecap="round" />
      ) : null}
      {agent.role === "uiux" ? <rect x="16" y="20" width="14" height="18" rx="2" fill="#f6f3ea" /> : null}
      {agent.role === "tester" ? <circle cx="34" cy="30" r="7" fill="none" stroke="#a7f3d0" strokeWidth="2.5" /> : null}
      {agent.role === "security" ? <rect x="-26" y="18" width="12" height="14" rx="2" fill="#fbbf24" /> : null}

      {/* role badge */}
      <g transform="translate(-34 -22)">
        <circle r="8.5" fill="#0f1319" stroke={agent.color} strokeWidth="1.4" />
        <text y="3.2" textAnchor="middle" fontSize="8.5" fill={agent.color} fontFamily="ui-sans-serif, system-ui">{ROLE_ICON[agent.role] ?? "•"}</text>
      </g>

      {/* name tag */}
      <g transform="translate(0 -46)">
        <rect x={-Math.max(30, agent.name.length * 3.6)} y="-10" width={Math.max(60, agent.name.length * 7.2)} height="15" rx="7.5" fill="#0f1319" opacity="0.9" />
        <text y="1.5" textAnchor="middle" fontSize="9" fill="#e7e3dc" fontFamily="ui-sans-serif, system-ui">
          {agent.name.length > 16 ? `${agent.name.slice(0, 15)}…` : agent.name}
        </text>
      </g>

      {angry ? (
        <g transform="translate(0 -70)">
          <rect x="-26" y="-9" width="52" height="14" rx="7" fill="#7f1d1d" stroke="#fca5a5" strokeWidth="1" />
          <text y="2" textAnchor="middle" fontSize="8" fill="#fee2e2" fontFamily="ui-sans-serif, system-ui">не согласен</text>
        </g>
      ) : null}
    </g>
  );
}

export function AgentWorld({
  agents,
  lines,
  running,
  blockers,
  task,
  locale,
  onSelectAgent,
  onRename,
  onQuickStart,
}: {
  agents: WorldAgent[];
  lines: WorldLine[];
  running: boolean;
  blockers: number;
  task: string | null;
  locale: "ru" | "en";
  onSelectAgent: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onQuickStart: () => void;
}) {
  const ru = locale === "ru";
  const current = lines.length > 0 ? lines[lines.length - 1] : null;
  const [renaming, setRenaming] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [quietSince, setQuietSince] = useState(0);
  const [wentHome, setWentHome] = useState(false);
  const [clockLabel, setClockLabel] = useState("--:--");

  // A heartbeat drives the room: after ninety quiet seconds the shift is over
  // and everyone walks to the door. All state updates live in timers so the
  // render stays pure.
  useEffect(() => {
    const tick = () => {
      const stamp = Date.now();
      setClockLabel(`${String(new Date(stamp).getHours()).padStart(2, "0")}:${String(new Date(stamp).getMinutes()).padStart(2, "0")}`);
      setWentHome(!running && quietSince > 0 && stamp - quietSince > 90_000);
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 15_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [running, quietSince]);

  // Any sign of life resets the shift clock (kept in a timer, not in render).
  const activityKey = `${running}:${current?.id ?? "none"}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setQuietSince(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [activityKey]);

  const visible = useMemo(() => agents.filter((agent) => agent.isActive || agent.role === "main").slice(0, 8), [agents]);

  const skyTop = wentHome ? "#0b1220" : running ? "#1c3a5e" : "#243b55";
  const sceneLabel = wentHome
    ? (ru ? "Рабочий день закончился — все ушли домой" : "The shift is over — everyone went home")
    : running
      ? (ru ? "Работа идёт: команда в комнате" : "Work in progress: the team is in the room")
      : (ru ? "Тишина. Дайте задачу — и все вернутся" : "Quiet. Give a task and they come back");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">{ru ? "Студия: живые агенты" : "Studio: living agents"}</h3>
          <p className="text-[10px] text-[var(--text-muted)]">{sceneLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            {wentHome ? "21:40" : clockLabel}
          </span>
          <button type="button" onClick={() => setRenaming((value) => !value)} className="rounded border border-[var(--border-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-blue-400">
            ✏ {ru ? "Имена" : "Names"}
          </button>
          <button type="button" onClick={onQuickStart} className="rounded border border-[var(--border-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-blue-400">
            🎓 {ru ? "Как начать" : "How to start"}
          </button>
        </div>
      </div>

      {renaming ? (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
          <p className="mb-1 text-[10px] text-[var(--text-muted)]">{ru ? "Назовите агентов по-своему — Михалыч, Людочка, как удобно. Имя видно и в комнате, и в чате." : "Name the agents however you like — it shows in the room and in the chat."}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {visible.map((agent) => (
              <div key={agent.id} className="flex items-center gap-1">
                <span className="w-4 text-center text-[11px]" style={{ color: agent.color }}>{ROLE_ICON[agent.role] ?? "•"}</span>
                <input
                  value={drafts[agent.id] ?? agent.name}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [agent.id]: event.target.value }))}
                  className="min-w-0 flex-1 rounded border border-[var(--border-input)] bg-[var(--bg-app)] px-2 py-1 text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => { onRename(agent.id, (drafts[agent.id] ?? agent.name).trim() || agent.name); }}
                  className="rounded border border-[var(--border-default)] px-1.5 py-1 text-[10px] hover:border-blue-400"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-default)]">
        <svg viewBox="0 0 920 430" preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skyTop} />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="wfloor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#243145" />
              <stop offset="100%" stopColor="#141c28" />
            </linearGradient>
            <linearGradient id="wscreen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          <rect width="920" height="430" fill="#0e1520" />
          <rect y="300" width="920" height="130" fill="url(#wfloor)" />
          <path d="M0 300 h920" stroke="#2b3a52" strokeWidth="2" />

          {/* window with the sky and the city */}
          <g>
            <rect x="640" y="34" width="150" height="110" rx="8" fill="url(#wsky)" stroke="#334155" strokeWidth="3" />
            {wentHome ? <circle cx="700" cy="62" r="8" fill="#fde68a" opacity="0.9" /> : <circle cx="712" cy="58" r="9" fill="#fde68a" opacity="0.75" />}
            <g fill="#0f172a" stroke="#334155" strokeWidth="1.2" opacity="0.9">
              <rect x="655" y="100" width="24" height="44" /><rect x="686" y="88" width="20" height="56" />
              <rect x="712" y="104" width="22" height="40" /><rect x="740" y="94" width="18" height="50" />
            </g>
            <path d="M715 34 v110" stroke="#334155" strokeWidth="2.5" />
          </g>

          {/* whiteboard: what the user asked for */}
          <g>
            <rect x="26" y="34" width="290" height="120" rx="8" fill="#e8e4dc" stroke="#3b4a61" strokeWidth="3" />
            <text x="42" y="56" fontSize="9.5" fill="#5b6472" fontFamily="ui-sans-serif, system-ui">{ru ? "ЗАДАЧА" : "TASK"}</text>
            <text x="42" y="76" fontSize="11.5" fill="#23272e" fontFamily="ui-sans-serif, system-ui">
              {(task ?? (ru ? "Пока задачи нет" : "No task yet")).slice(0, 44)}
            </text>
            <g stroke="#c3bcae" strokeWidth="1.6">
              <path d="M42 90 h240" /><path d="M42 104 h200" /><path d="M42 118 h220" />
            </g>
            <g transform="translate(250 108)">
              <circle r="10" fill="none" stroke="#e11d48" strokeWidth="1.8" />
              <path d="M-4 0 h8 M0 -4 v8" stroke="#e11d48" strokeWidth="1.8" />
            </g>
          </g>

          {/* desks */}
          <g>
            <rect x="486" y="286" width="130" height="9" rx="4" fill="#3b4a61" />
            <rect x="516" y="236" width="70" height="46" rx="5" fill="#0b1220" stroke="#334155" strokeWidth="2" />
            <rect x="521" y="241" width="60" height="36" rx="3" fill="url(#wscreen)" />
            <g stroke="#60a5fa" strokeWidth="2.6" opacity="0.85">
              <path d="M527 250 h36" /><path d="M527 257 h44" /><path d="M527 264 h26" />
            </g>
          </g>

          {/* couch + plant, for the quiet hours */}
          <g>
            <rect x="768" y="368" width="118" height="26" rx="10" fill="#334155" />
            <rect x="768" y="352" width="14" height="30" rx="6" fill="#3b4a61" />
            <rect x="872" y="352" width="14" height="30" rx="6" fill="#3b4a61" />
            <g transform="translate(700 344)">
              <rect x="-9" y="24" width="18" height="22" rx="4" fill="#7c4a2a" />
              <path d="M0 24 q-16 -9 -12 -27 q14 4 12 27" fill="#166534" />
              <path d="M0 24 q16 -11 12 -29 q-14 6 -12 29" fill="#15803d" />
            </g>
          </g>

          {/* door */}
          <g>
            <rect x="846" y="232" width="58" height="112" rx="4" fill="#6b4a2e" stroke="#3f2c1c" strokeWidth="3" />
            <circle cx="856" cy="290" r="3.5" fill="#e7c07a" />
            {wentHome ? <text x="875" y="222" textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{ru ? "все дома" : "all home"}</text> : null}
          </g>

          {visible.map((agent, index) => {
            const spot = SPOTS[agent.role] ?? { x: 400 + index * 60, y: 300, label: "" };
            const mood = wentHome ? "home" : moodOf(agent, current?.agentId ?? null, running, blockers);
            return (
              <Figure
                key={agent.id}
                agent={agent}
                spot={mood === "idle" && index % 3 === 0 ? COUCH : spot}
                mood={mood}
                index={index}
                speaking={current?.agentId === agent.id}
                onSelect={() => onSelectAgent(agent.id)}
              />
            );
          })}

          {/* speech bubble of whoever is talking */}
          {current && !wentHome ? (
            <g transform="translate(300 150)">
              <rect x="0" y="0" width="330" height="64" rx="14" fill="#fffdf6" stroke="#2f2a25" strokeWidth="2.5" />
              <path d="M40 64 l-10 18 l26 -18 z" fill="#fffdf6" stroke="#2f2a25" strokeWidth="2.5" />
              <text x="14" y="22" fontSize="10" fontWeight="bold" fill={current.color} fontFamily="ui-sans-serif, system-ui">
                {current.name.toUpperCase()}{current.stance === "blocker" ? (ru ? " · БЛОКЕР" : " · BLOCKER") : ""}
              </text>
              <foreignObject x="14" y="28" width="302" height="32">
                <div style={{ font: "11.5px ui-sans-serif, system-ui", color: "#23232a", lineHeight: 1.25 }}>
                  {current.text.replace(/\s+/g, " ").replace(/\[[^\]]*\]/g, "").slice(0, 150)}
                </div>
              </foreignObject>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--text-secondary)]">
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">★ {ru ? "у доски" : "at the board"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">☑ {ru ? "за столом" : "at the desk"}</span>
        <span className="rounded-full border border-rose-500/40 px-2 py-0.5 text-rose-300">! {ru ? "блокер" : "blocker"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">🚪 {ru ? "ушли домой" : "went home"}</span>
        <span className="ml-auto">{ru ? "Нажмите на человека — откроется чат с ним" : "Click a person to open their chat"}</span>
      </div>
    </div>
  );
}
