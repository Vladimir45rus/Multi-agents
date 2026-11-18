"use client";

import { useEffect, useMemo, useState } from "react";

// "Студия": the team as people in a room. Every pose is derived from real
// orchestrator data: talking = standing at the board, working = at the desk,
// blocker = on their feet, idle = coffee / papers / plant, and after a quiet
// spell everyone walks out of the door.
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

type Spot = { x: number; y: number };

// Standing places around the room (y is the floor line of the figure's feet).
const SPOTS: Record<string, Spot> = {
  main: { x: 250, y: 356 },
  architect: { x: 352, y: 330 },
  uiux: { x: 470, y: 336 },
  reviewer: { x: 604, y: 372 },
  tester: { x: 690, y: 352 },
  security: { x: 540, y: 320 },
  skeptic: { x: 760, y: 366 },
  advisor: { x: 196, y: 400 },
  observer: { x: 812, y: 330 },
  auto: { x: 430, y: 386 },
};

// Idle life: coffee corner, papers on the table, the plant, the couch.
const IDLE_SPOTS: Spot[] = [
  { x: 856, y: 392 }, // у кофемашины
  { x: 520, y: 416 }, // с бумагами у стола
  { x: 286, y: 424 }, // у доски, издалека
  { x: 748, y: 432 }, // у дивана
  { x: 168, y: 428 }, // у окна слева
];

const DOOR: Spot = { x: 918, y: 372 };

const ROLE_ICON: Record<string, string> = {
  main: "★", advisor: "?", architect: "△", reviewer: "☑", tester: "✓",
  uiux: "◐", security: "⛨", skeptic: "!", observer: "◉", auto: "∞",
};

const SKIN = ["#f0c8a4", "#dcab84", "#c68a60", "#f6d8bd", "#d09a70"];
const HAIR = ["#2b2b31", "#5a3a22", "#8a5a2b", "#1d1d22", "#6b4423", "#a16207"];
const SHIRT = ["#e2e8f0", "#f1f5f9", "#cbd5e1"];

type Mood = "talking" | "working" | "blocked" | "coffee" | "reading" | "home" | "idle";

function moodOf(agent: WorldAgent, currentId: number | null, running: boolean, blockers: number, index: number): Mood {
  if (!agent.isActive) return "home";
  if (running) {
    if (agent.id === currentId) return "talking";
    if (agent.role === "skeptic" && blockers > 0) return "blocked";
    return "working";
  }
  if (index % 3 === 0) return "coffee";
  if (index % 3 === 1) return "reading";
  return "idle";
}

function legs(color: string, skin: string, pose: "stand" | "sit" | "walk") {
  if (pose === "sit") {
    return [
      `<path d="M-9 30 h18" stroke="${color}" strokeWidth="11" strokeLinecap="round"/>`,
      `<path d="M-11 34 l-6 14" stroke="#2f3a4b" strokeWidth="7" strokeLinecap="round"/>`,
      `<path d="M11 34 l6 14" stroke="#2f3a4b" strokeWidth="7" strokeLinecap="round"/>`,
    ].join("");
  }
  if (pose === "walk") {
    return [
      `<path d="M-7 28 l-9 20" stroke="#2f3a4b" strokeWidth="8" strokeLinecap="round"/>`,
      `<path d="M7 28 l10 18" stroke="#2f3a4b" strokeWidth="8" strokeLinecap="round"/>`,
      `<ellipse cx="-18" cy="50" rx="6" ry="3" fill="#111827"/>`,
      `<ellipse cx="19" cy="48" rx="6" ry="3" fill="#111827"/>`,
    ].join("");
  }
  return [
    `<path d="M-6 28 l-2 20" stroke="#2f3a4b" strokeWidth="8" strokeLinecap="round"/>`,
    `<path d="M6 28 l2 20" stroke="#2f3a4b" strokeWidth="8" strokeLinecap="round"/>`,
    `<ellipse cx="-9" cy="49" rx="6" ry="3" fill="#111827"/>`,
    `<ellipse cx="9" cy="49" rx="6" ry="3" fill="#111827"/>`,
  ].join("");
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
  const shirt = index % 2 === 0 ? agent.color : `${agent.color}`;
  const seated = mood === "working";
  const walking = mood === "home";
  const blocked = mood === "blocked";
  const cup = mood === "coffee";
  const paper = mood === "reading";
  const pose = seated ? "sit" : walking ? "walk" : "stand";

  return (
    <g
      transform={`translate(${spot.x} ${spot.y})`}
      style={{ transition: "transform 1800ms cubic-bezier(.35,0,.2,1)", cursor: "pointer", opacity: walking ? 0.9 : 1 }}
      onClick={onSelect}
    >
      <ellipse cx="0" cy={seated ? 50 : 52} rx="26" ry="7" fill="#000" opacity="0.32" />
      {speaking ? <circle cx="0" cy="4" r="48" fill="#fde68a" opacity="0.13" /> : null}

      <g className="aw-bob">
        {/* chair for the seated ones */}
        {seated ? (
          <>
            <rect x="-25" y="-4" width="50" height="40" rx="10" fill="#3b2f26" opacity="0.8" />
            <rect x="-25" y="30" width="50" height="7" rx="3" fill="#2a211a" />
          </>
        ) : null}

        {legs(shirt, skin, pose)}

        {/* torso */}
        <rect x="-16" y="-8" width="32" height="38" rx="11" fill={shirt} />
        <rect x="-16" y="-8" width="9" height="38" rx="5" fill="#000" opacity="0.08" />
        {/* collar */}
        <path d="M-6 -8 l6 7 l6 -7" fill="none" stroke={SHIRT[index % SHIRT.length]} strokeWidth="2.4" strokeLinecap="round" />

        {/* arms */}
        {blocked ? (
          <>
            <path d="M-14 -2 q-20 -10 -16 -28" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="-31" cy="-31" r="6" fill={skin} />
            <path d="M14 0 q16 -6 18 -22" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="33" cy="-23" r="6" fill={skin} />
          </>
        ) : cup ? (
          <>
            <path d="M-14 2 q-14 8 -16 18" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M14 -2 q10 -6 10 -14" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="24" cy="-18" r="6" fill={skin} />
            <g transform="translate(24 -30)">
              <rect x="-6" y="0" width="12" height="10" rx="2" fill="#f5f5f4" />
              <path d="M6 2 q5 3 0 6" fill="none" stroke="#e5e7eb" strokeWidth="2" />
              <path d="M-3 -4 q2 -4 0 -7 M3 -4 q2 -4 0 -7" stroke="#cbd5e1" strokeWidth="1.3" fill="none" opacity="0.8" />
            </g>
          </>
        ) : paper ? (
          <>
            <path d="M-14 2 q-10 8 -12 16" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M14 2 q10 8 12 16" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <g transform="translate(0 12)">
              <rect x="-16" y="-8" width="32" height="20" rx="2" fill="#f8fafc" transform="rotate(-6)" />
              <path d="M-11 -1 h20 M-11 4 h14" stroke="#94a3b8" strokeWidth="1.4" transform="rotate(-6)" />
            </g>
          </>
        ) : walking ? (
          <>
            <path d="M-14 -2 q-12 6 -16 2" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M14 -2 q12 8 16 4" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M-14 2 q-12 8 -14 18" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M14 2 q12 8 14 18" stroke={shirt} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="-30" cy="22" r="5.5" fill={skin} />
            <circle cx="30" cy="22" r="5.5" fill={skin} />
          </>
        )}

        {/* head */}
        <rect x="-4" y="-16" width="8" height="9" fill={skin} />
        <ellipse cx="0" cy="-26" rx="14" ry="15" fill={skin} />
        <path d="M-14 -28 q14 -17 28 0 q-6 -11 -14 -11 q-8 0 -14 11 z" fill={hair} />

        {/* face variety */}
        {index % 3 === 0 ? <path d="M-11 -16 q11 12 22 0 q-3 12 -11 12 q-8 0 -11 -12 z" fill={hair} opacity="0.92" /> : null}
        {index % 3 === 1 ? (
          <g stroke="#cbd5e1" strokeWidth="1.3" fill="none">
            <circle cx="-5.5" cy="-26" r="4.2" /><circle cx="5.5" cy="-26" r="4.2" /><path d="M-1.3 -26 h2.6" />
          </g>
        ) : null}
        {index % 3 === 2 ? <circle cx="12" cy="-36" r="4.6" fill={hair} /> : null}
        <circle cx="-5" cy="-26" r="1.6" fill="#23232a" />
        <circle cx="5" cy="-26" r="1.6" fill="#23232a" />
        {blocked ? (
          <>
            <path d="M-10 -32 l5 3" stroke="#23232a" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 -32 l-5 3" stroke="#23232a" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M-4 -18 q4 -4 8 0" stroke="#8b1d2c" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          </>
        ) : speaking ? (
          <ellipse cx="0" cy="-17" rx="3.4" ry="2.6" fill="#8b1d2c" />
        ) : (
          <path d="M-3 -19 q3 3 6 0" stroke="#8a5a4a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        )}

        {/* role badge */}
        <g transform="translate(-34 -40)">
          <circle r="8.5" fill="#0f1319" stroke={agent.color} strokeWidth="1.4" />
          <text y="3.2" textAnchor="middle" fontSize="8.5" fill={agent.color} fontFamily="ui-sans-serif, system-ui">{ROLE_ICON[agent.role] ?? "•"}</text>
        </g>

        {/* name tag */}
        <g transform="translate(0 -62)">
          <rect x={-Math.max(31, agent.name.length * 3.7)} y="-10" width={Math.max(62, agent.name.length * 7.4)} height="15" rx="7.5" fill="#0f1319" opacity="0.9" />
          <text y="1.5" textAnchor="middle" fontSize="9" fill="#e7e3dc" fontFamily="ui-sans-serif, system-ui">
            {agent.name.length > 16 ? `${agent.name.slice(0, 15)}…` : agent.name}
          </text>
        </g>

        {blocked ? (
          <g transform="translate(0 -86)">
            <rect x="-27" y="-9" width="54" height="14" rx="7" fill="#7f1d1d" stroke="#fca5a5" strokeWidth="1" />
            <text y="2" textAnchor="middle" fontSize="8" fill="#fee2e2" fontFamily="ui-sans-serif, system-ui">не согласен</text>
          </g>
        ) : null}
      </g>
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
  // and everyone walks to the door.
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

  const activityKey = `${running}:${current?.id ?? "none"}`;
  useEffect(() => {
    const timer = window.setTimeout(() => setQuietSince(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [activityKey]);

  const visible = useMemo(() => agents.filter((agent) => agent.isActive || agent.role === "main").slice(0, 8), [agents]);

  const sceneLabel = wentHome
    ? (ru ? "Рабочий день закончился — все ушли домой" : "The shift is over — everyone went home")
    : running
      ? (ru ? "Работа идёт: кто-то у доски, кто-то за кодом" : "Work in progress: someone at the board, someone in code")
      : (ru ? "Тишина: пьют кофе и читают бумаги. Дайте задачу — вернутся за столы" : "Quiet: coffee and papers. Give a task and they get back to work");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <style>{`
        @keyframes aw-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }
        .aw-bob { animation: aw-bob 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .aw-bob { animation: none; } }
      `}</style>

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
          <p className="mb-1 text-[10px] text-[var(--text-muted)]">
            {ru ? "Назовите агентов по-своему — Михалыч, Людочка, как удобно. Имя сразу видно в комнате и в чате." : "Name the agents however you like — it shows in the room and in the chat."}
          </p>
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
                  onClick={() => onRename(agent.id, (drafts[agent.id] ?? agent.name).trim() || agent.name)}
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
        <svg viewBox="0 0 980 520" preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="aw-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#182232" /><stop offset="100%" stopColor="#101825" />
            </linearGradient>
            <linearGradient id="aw-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a3648" /><stop offset="100%" stopColor="#161e2b" />
            </linearGradient>
            <linearGradient id="aw-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={wentHome ? "#0a1020" : running ? "#1b3a5c" : "#243a52"} />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="aw-screen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="aw-board" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f1efe8" /><stop offset="100%" stopColor="#ddd8cc" />
            </linearGradient>
          </defs>

          <rect width="980" height="520" fill="url(#aw-wall)" />
          <rect y="372" width="980" height="148" fill="url(#aw-floor)" />
          <path d="M0 372 h980" stroke="#33425a" strokeWidth="2" />
          {/* floor boards */}
          <g stroke="#1e2836" strokeWidth="1.4" opacity="0.75">
            <path d="M0 404 h980" /><path d="M0 440 h980" /><path d="M0 476 h980" />
          </g>

          {/* window with the city */}
          <g>
            <rect x="676" y="40" width="164" height="126" rx="10" fill="url(#aw-sky)" stroke="#33425a" strokeWidth="4" />
            <circle cx="742" cy="74" r="10" fill="#fde68a" opacity="0.85" />
            <g fill="#0d1524" stroke="#33425a" strokeWidth="1.2">
              <rect x="692" y="112" width="26" height="54" /><rect x="724" y="96" width="22" height="70" />
              <rect x="752" y="118" width="24" height="48" /><rect x="782" y="104" width="20" height="62" />
            </g>
            <g fill="#fbbf24" opacity="0.55">
              <rect x="698" y="120" width="4" height="5" /><rect x="708" y="132" width="4" height="5" />
              <rect x="730" y="106" width="4" height="5" /><rect x="738" y="122" width="4" height="5" />
              <rect x="760" y="128" width="4" height="5" /><rect x="788" y="116" width="4" height="5" />
            </g>
            <path d="M758 40 v126" stroke="#33425a" strokeWidth="3" />
          </g>

          {/* whiteboard with the task */}
          <g>
            <rect x="30" y="44" width="316" height="132" rx="10" fill="url(#aw-board)" stroke="#3c4b60" strokeWidth="3" />
            <text x="48" y="68" fontSize="9.5" fill="#5b6472" fontFamily="ui-sans-serif, system-ui" letterSpacing="1">
              {ru ? "ЗАДАЧА" : "TASK"}
            </text>
            <text x="48" y="90" fontSize="12" fill="#23272e" fontFamily="ui-sans-serif, system-ui">
              {(task ?? (ru ? "Пока задачи нет" : "No task yet")).slice(0, 42)}
            </text>
            <g stroke="#c8c1b2" strokeWidth="1.6">
              <path d="M48 104 h250" /><path d="M48 119 h206" /><path d="M48 134 h232" />
            </g>
            <g transform="translate(298 140)">
              <circle r="11" fill="none" stroke="#e11d48" strokeWidth="1.8" />
              <path d="M-4 0 h8 M0 -4 v8" stroke="#e11d48" strokeWidth="1.8" />
            </g>
            {/* magnets */}
            <circle cx="56" cy="56" r="4" fill="#60a5fa" /><circle cx="320" cy="56" r="4" fill="#f472b6" />
          </g>

          {/* coffee corner */}
          <g transform="translate(880 300)">
            <rect x="-30" y="0" width="60" height="72" rx="6" fill="#26313f" stroke="#3c4b60" strokeWidth="2" />
            <rect x="-22" y="10" width="44" height="26" rx="4" fill="#0f172a" stroke="#4b5b72" strokeWidth="1.5" />
            <rect x="-14" y="18" width="28" height="10" rx="2" fill="#c2410c" opacity="0.85" />
            <circle cx="0" cy="52" r="6" fill="none" stroke="#94a3b8" strokeWidth="2" />
            <rect x="-24" y="66" width="48" height="8" rx="3" fill="#1b2532" />
            <g transform="translate(-34 40)">
              <rect x="-6" y="0" width="12" height="9" rx="2" fill="#f5f5f4" />
              <rect x="-6" y="12" width="12" height="9" rx="2" fill="#e2e8f0" />
            </g>
          </g>

          {/* desks */}
          <g>
            <rect x="524" y="330" width="150" height="10" rx="5" fill="#3c4b60" />
            <rect x="558" y="272" width="82" height="54" rx="6" fill="#0b1220" stroke="#3c4b60" strokeWidth="2" />
            <rect x="564" y="278" width="70" height="42" rx="3" fill="url(#aw-screen)" />
            <g stroke="#60a5fa" strokeWidth="2.4" opacity="0.85">
              <path d="M570 288 h42" /><path d="M570 296 h52" /><path d="M570 304 h30" />
            </g>
            <rect x="596" y="326" width="10" height="6" rx="2" fill="#334155" />

            <rect x="694" y="352" width="128" height="9" rx="4" fill="#3c4b60" />
            <rect x="722" y="304" width="70" height="46" rx="5" fill="#0b1220" stroke="#3c4b60" strokeWidth="2" />
            <rect x="727" y="309" width="60" height="36" rx="3" fill="url(#aw-screen)" />
            <g stroke="#34d399" strokeWidth="2.2" opacity="0.85">
              <path d="M733 318 h34" /><path d="M733 325 h24" /><path d="M733 332 h42" />
            </g>
            {/* papers + cup on the desk */}
            <g transform="translate(742 346)">
              <rect x="-14" y="-6" width="28" height="16" rx="2" fill="#eef2f7" transform="rotate(-7)" />
              <path d="M-9 0 h18" stroke="#b6c0cc" strokeWidth="1.4" transform="rotate(-7)" />
            </g>
          </g>

          {/* plant */}
          <g transform="translate(846 356)">
            <rect x="-11" y="22" width="22" height="26" rx="5" fill="#7c4a2a" />
            <path d="M0 22 q-19 -10 -14 -30 q17 4 14 30" fill="#166534" />
            <path d="M0 22 q19 -12 14 -34 q-17 6 -14 34" fill="#15803d" />
            <path d="M0 22 q-4 -18 2 -30" stroke="#14532d" strokeWidth="1.6" fill="none" />
          </g>

          {/* couch */}
          <g transform="translate(806 430)">
            <rect x="-58" y="-6" width="116" height="26" rx="10" fill="#334155" />
            <rect x="-58" y="-26" width="14" height="32" rx="6" fill="#3c4b60" />
            <rect x="44" y="-26" width="14" height="32" rx="6" fill="#3c4b60" />
            <rect x="-44" y="-12" width="26" height="14" rx="5" fill="#475569" />
            <rect x="8" y="-12" width="26" height="14" rx="5" fill="#475569" />
          </g>

          {/* door */}
          <g>
            <rect x="902" y="286" width="62" height="118" rx="4" fill="#6b4a2e" stroke="#3f2c1c" strokeWidth="3" />
            <rect x="908" y="292" width="50" height="46" rx="3" fill="#5b3d25" opacity="0.7" />
            <circle cx="912" cy="348" r="3.6" fill="#e7c07a" />
            <path d="M902 404 h62" stroke="#3f2c1c" strokeWidth="3" />
            {wentHome ? (
              <text x="933" y="276" textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                {ru ? "все дома" : "all home"}
              </text>
            ) : null}
          </g>

          {visible.map((agent, index) => {
            const mood = wentHome ? "home" : moodOf(agent, current?.agentId ?? null, running, blockers, index);
            const base = SPOTS[agent.role] ?? { x: 380 + index * 54, y: 400 };
            const spot = wentHome
              ? DOOR
              : mood === "coffee" || mood === "reading" || mood === "idle"
                ? IDLE_SPOTS[index % IDLE_SPOTS.length]
                : base;
            return (
              <Figure
                key={agent.id}
                agent={agent}
                spot={spot}
                mood={mood}
                index={index}
                speaking={current?.agentId === agent.id}
                onSelect={() => onSelectAgent(agent.id)}
              />
            );
          })}

          {current && !wentHome ? (
            <g transform="translate(360 196)">
              <rect x="0" y="0" width="356" height="66" rx="14" fill="#fffdf6" stroke="#2f2a25" strokeWidth="2.5" />
              <path d="M46 66 l-10 18 l26 -18 z" fill="#fffdf6" stroke="#2f2a25" strokeWidth="2.5" />
              <text x="14" y="22" fontSize="10" fontWeight="bold" fill={current.color} fontFamily="ui-sans-serif, system-ui">
                {current.name.toUpperCase()}{current.stance === "blocker" ? (ru ? " · БЛОКЕР" : " · BLOCKER") : ""}
              </text>
              <foreignObject x="14" y="28" width="328" height="34">
                <div style={{ font: "11.5px ui-sans-serif, system-ui", color: "#23232a", lineHeight: 1.25 }}>
                  {current.text.replace(/\s+/g, " ").replace(/\[[^\]]*\]/g, "").slice(0, 160)}
                </div>
              </foreignObject>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--text-secondary)]">
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">★ {ru ? "у доски" : "at the board"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">☕ {ru ? "кофе" : "coffee"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">📄 {ru ? "бумаги" : "papers"}</span>
        <span className="rounded-full border border-rose-500/40 px-2 py-0.5 text-rose-300">! {ru ? "блокер" : "blocker"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">🚪 {ru ? "домой" : "home"}</span>
        <span className="ml-auto">{ru ? "Нажмите на человека — откроется чат" : "Click a person to open the chat"}</span>
      </div>
    </div>
  );
}
