"use client";

import { useEffect, useMemo, useState } from "react";

// «Студия»: команда как живые люди в комнате. Сцена постоянно живёт: кто-то
// идёт за кофе, кто-то читает, кто-то отходит к двери и возвращается. Позы и
// реплики берутся из реальных данных оркестратора, но движение не замирает,
// даже когда задач нет.
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

// Рабочие места: уникальные координаты, никто ни с кем не пересекается.
const WORK_SPOTS: Spot[] = [
  { x: 214, y: 372 }, // у доски — Главный
  { x: 330, y: 356 }, // схема — Архитектор
  { x: 452, y: 366 }, // макет — Дизайнер
  { x: 566, y: 392 }, // стол ревью
  { x: 660, y: 372 }, // проверка — Тестер
  { x: 528, y: 336 }, // безопасность
  { x: 742, y: 388 }, // Фома
  { x: 168, y: 408 }, // советник
];

// Свободные занятия: кофемашина, бумаги, диван, окно, стол с настолкой.
const IDLE_SPOTS: Spot[] = [
  { x: 858, y: 402 }, // кофемашина
  { x: 560, y: 424 }, // бумаги на столе
  { x: 288, y: 430 }, // у доски с мелом
  { x: 764, y: 434 }, // диван
  { x: 150, y: 436 }, // у окна
  { x: 430, y: 442 }, // настолка на полу
  { x: 646, y: 440 }, // у plants
  { x: 96, y: 400 }, // у стеллажа
];

const DOOR: Spot = { x: 916, y: 392 };

const ROLE_ICON: Record<string, string> = {
  main: "★", advisor: "?", architect: "△", reviewer: "☑", tester: "✓",
  uiux: "◐", security: "⛨", skeptic: "!", observer: "◉", auto: "∞",
};

const SKIN = ["#f0c8a4", "#dcab84", "#c68a60", "#f6d8bd", "#d09a70"];
const HAIR = ["#2b2b31", "#5a3a22", "#8a5a2b", "#1d1d22", "#6b4423", "#a16207"];
const TROUSERS = ["#475569", "#3f4b5f", "#525f75", "#3b4658"];

type Mood = "talking" | "working" | "blocked" | "coffee" | "reading" | "playing" | "away" | "home" | "idle";

const MOOD_LABEL: Record<Mood, [string, string]> = {
  talking: ["говорит", "talking"],
  working: ["за кодом", "coding"],
  blocked: ["не согласен", "blocked"],
  coffee: ["пьёт кофе", "coffee"],
  reading: ["читает", "reading"],
  playing: ["играет", "playing"],
  away: ["вышел", "away"],
  home: ["дома", "home"],
  idle: ["ждёт", "idle"],
};

function moodOf(agent: WorldAgent, currentId: number | null, running: boolean, blockers: number): Mood {
  if (!agent.isActive) return "home";
  if (running) {
    if (agent.id === currentId) return "talking";
    if (agent.role === "skeptic" && blockers > 0) return "blocked";
    return "working";
  }
  return "idle";
}

// Ноги и обувь: раньше они были почти чёрными на тёмном полу и «исчезали».
function legs(color: string, pose: "stand" | "sit" | "walk") {
  const shoe = "#0b1220";
  const sole = "#94a3b8";
  if (pose === "sit") {
    return [
      `<path d="M-9 26 h18" stroke="${color}" strokeWidth="12" strokeLinecap="round"/>`,
      `<path d="M-10 30 l-8 12" stroke="${color}" strokeWidth="8" strokeLinecap="round"/>`,
      `<path d="M10 30 l8 12" stroke="${color}" strokeWidth="8" strokeLinecap="round"/>`,
      `<ellipse cx="-20" cy="44" rx="7" ry="3.4" fill="${shoe}"/>`,
      `<ellipse cx="20" cy="44" rx="7" ry="3.4" fill="${shoe}"/>`,
      `<ellipse cx="-20" cy="45" rx="7" ry="1.4" fill="${sole}" opacity="0.8"/>`,
      `<ellipse cx="20" cy="45" rx="7" ry="1.4" fill="${sole}" opacity="0.8"/>`,
    ].join("");
  }
  if (pose === "walk") {
    return [
      `<path d="M-6 26 l-11 18" stroke="${color}" strokeWidth="9" strokeLinecap="round"/>`,
      `<path d="M6 26 l12 16" stroke="${color}" strokeWidth="9" strokeLinecap="round"/>`,
      `<ellipse cx="-19" cy="46" rx="7" ry="3.4" fill="${shoe}"/>`,
      `<ellipse cx="20" cy="44" rx="7" ry="3.4" fill="${shoe}"/>`,
      `<ellipse cx="-19" cy="47" rx="7" ry="1.4" fill="${sole}" opacity="0.8"/>`,
      `<ellipse cx="20" cy="45" rx="7" ry="1.4" fill="${sole}" opacity="0.8"/>`,
    ].join("");
  }
  return [
    `<path d="M-6 26 l-2 18" stroke="${color}" strokeWidth="9" strokeLinecap="round"/>`,
    `<path d="M6 26 l2 18" stroke="${color}" strokeWidth="9" strokeLinecap="round"/>`,
    `<ellipse cx="-9" cy="45" rx="7" ry="3.4" fill="${shoe}"/>`,
    `<ellipse cx="9" cy="45" rx="7" ry="3.4" fill="${shoe}"/>`,
    `<ellipse cx="-9" cy="46" rx="7" ry="1.4" fill="${sole}" opacity="0.8"/>`,
    `<ellipse cx="9" cy="46" rx="7" ry="1.4" fill="${sole}" opacity="0.8"/>`,
  ].join("");
}

function Figure({ agent, spot, mood, index, walking, onSelect, selected }: {
  agent: WorldAgent;
  spot: Spot;
  mood: Mood;
  index: number;
  walking: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const skin = SKIN[index % SKIN.length];
  const hair = HAIR[(index + 1) % HAIR.length];
  const trousers = TROUSERS[index % TROUSERS.length];
  const seated = mood === "working";
  const blocked = mood === "blocked";
  const coffee = mood === "coffee" || mood === "idle";
  const reading = mood === "reading";
  const playing = mood === "playing";
  const pose = seated ? "sit" : walking ? "walk" : "stand";
  const label = MOOD_LABEL[mood];

  return (
    <g
      transform={`translate(${spot.x} ${spot.y})`}
      style={{ transition: "transform 2200ms cubic-bezier(.4,0,.2,1)", cursor: "pointer" }}
      onClick={onSelect}
    >
      <ellipse cx="0" cy="48" rx="24" ry="6" fill="#000" opacity="0.35" />
      {selected ? <circle cx="0" cy="0" r="52" fill="#38bdf8" opacity="0.16" /> : null}

      <g className="aw-bob">
        {seated ? (
          <>
            <rect x="-24" y="-6" width="48" height="36" rx="10" fill="#3b2f26" opacity="0.85" />
            <rect x="-24" y="26" width="48" height="6" rx="3" fill="#2a211a" />
          </>
        ) : null}

        <g dangerouslySetInnerHTML={{ __html: legs(trousers, pose) }} />

        {/* рубашка */}
        <rect x="-15" y="-10" width="30" height="36" rx="10" fill={agent.color} />
        <rect x="-15" y="-10" width="8" height="36" rx="4" fill="#000" opacity="0.1" />
        <path d="M-5 -10 l5 6 l5 -6" fill="none" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />

        {/* руки */}
        {blocked ? (
          <>
            <path d="M-13 -4 q-19 -10 -15 -27" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="-30" cy="-32" r="5.6" fill={skin} />
            <path d="M13 -2 q15 -6 17 -21" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="31" cy="-24" r="5.6" fill={skin} />
          </>
        ) : coffee ? (
          <>
            <path d="M-13 0 q-13 8 -15 17" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M13 -4 q10 -6 10 -13" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="23" cy="-18" r="5.6" fill={skin} />
            <g transform="translate(23 -30)">
              <rect x="-5.5" y="0" width="11" height="9" rx="2" fill="#f8fafc" />
              <path d="M5.5 2 q4.5 2.5 0 5" fill="none" stroke="#e2e8f0" strokeWidth="1.8" />
              <path d="M-3 -3 q1.6 -3 0 -6 M2 -3 q1.6 -3 0 -6" stroke="#cbd5e1" strokeWidth="1.2" fill="none" opacity="0.7" />
            </g>
          </>
        ) : reading ? (
          <>
            <path d="M-13 0 q-10 6 -12 14" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M13 0 q10 6 12 14" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <g transform="translate(0 10)">
              <rect x="-15" y="-7" width="30" height="18" rx="2" fill="#f8fafc" transform="rotate(-6)" />
              <path d="M-10 0 h18 M-10 5 h12" stroke="#94a3b8" strokeWidth="1.3" transform="rotate(-6)" />
            </g>
          </>
        ) : playing ? (
          <>
            <path d="M-13 -2 q-16 -4 -20 -14" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M13 -2 q16 -4 20 -14" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <rect x="-30" y="-34" width="60" height="18" rx="4" fill="#f1f5f9" transform="rotate(-4)" />
            <circle cx="-8" cy="-25" r="2.4" fill="#ef4444" /><circle cx="6" cy="-25" r="2.4" fill="#3b82f6" />
          </>
        ) : walking ? (
          <>
            <path d="M-13 -2 q-12 6 -17 2" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M13 -2 q12 8 17 4" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M-13 0 q-11 8 -13 16" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M13 0 q11 8 13 16" stroke={agent.color} strokeWidth="7" fill="none" strokeLinecap="round" />
            <circle cx="-27" cy="19" r="5.4" fill={skin} />
            <circle cx="27" cy="19" r="5.4" fill={skin} />
          </>
        )}

        {/* голова */}
        <rect x="-4" y="-16" width="8" height="8" fill={skin} />
        <ellipse cx="0" cy="-26" rx="13.5" ry="14.5" fill={skin} />
        <path d="M-13.5 -28 q13.5 -16 27 0 q-6 -10.5 -13.5 -10.5 q-7.5 0 -13.5 10.5 z" fill={hair} />
        {index % 3 === 0 ? <path d="M-10.5 -16 q10.5 11 21 0 q-3 11 -10.5 11 q-7.5 0 -10.5 -11 z" fill={hair} opacity="0.92" /> : null}
        {index % 3 === 1 ? (
          <g stroke="#cbd5e1" strokeWidth="1.2" fill="none">
            <circle cx="-5" cy="-26" r="4" /><circle cx="5" cy="-26" r="4" /><path d="M-1 -26 h2" />
          </g>
        ) : null}
        {index % 3 === 2 ? <circle cx="11.5" cy="-35" r="4.4" fill={hair} /> : null}
        <circle cx="-5" cy="-26" r="1.5" fill="#23232a" />
        <circle cx="5" cy="-26" r="1.5" fill="#23232a" />
        {blocked ? (
          <>
            <path d="M-9.5 -32 l4.5 2.6" stroke="#23232a" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M9.5 -32 l-4.5 2.6" stroke="#23232a" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M-4 -18 q4 -4 8 0" stroke="#8b1d2c" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        ) : mood === "talking" ? (
          <ellipse cx="0" cy="-17" rx="3" ry="2.4" fill="#8b1d2c" />
        ) : (
          <path d="M-3 -19 q3 3 6 0" stroke="#8a5a4a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        )}

        {/* бейдж роли */}
        <g transform="translate(-32 -38)">
          <circle r="8" fill="#0f1319" stroke={agent.color} strokeWidth="1.3" />
          <text y="3" textAnchor="middle" fontSize="8" fill={agent.color} fontFamily="ui-sans-serif, system-ui">{ROLE_ICON[agent.role] ?? "•"}</text>
        </g>

        {/* имя + занятие */}
        <g transform="translate(0 -58)">
          <rect x={-Math.max(34, agent.name.length * 3.6)} y="-11" width={Math.max(68, agent.name.length * 7.2)} height="23" rx="8" fill="#0f1319" opacity="0.9" />
          <text y="0" textAnchor="middle" fontSize="8.6" fill="#e7e3dc" fontFamily="ui-sans-serif, system-ui">
            {agent.name.length > 16 ? `${agent.name.slice(0, 15)}…` : agent.name}
          </text>
          <text y="8" textAnchor="middle" fontSize="7" fill="#8fa3b8" fontFamily="ui-sans-serif, system-ui">{label[0]}</text>
        </g>

        {blocked ? (
          <g transform="translate(0 -80)">
            <rect x="-27" y="-9" width="54" height="14" rx="7" fill="#7f1d1d" stroke="#fca5a5" strokeWidth="1" />
            <text y="2" textAnchor="middle" fontSize="8" fill="#fee2e2" fontFamily="ui-sans-serif, system-ui">блокер</text>
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
  onOpenChat,
  onRename,
  onQuickStart,
}: {
  agents: WorldAgent[];
  lines: WorldLine[];
  running: boolean;
  blockers: number;
  task: string | null;
  locale: "ru" | "en";
  onOpenChat: (agentId: number) => void;
  onRename: (id: number, name: string) => void;
  onQuickStart: () => void;
}) {
  const ru = locale === "ru";
  const [renaming, setRenaming] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [clock, setClock] = useState("--:--");
  const [night, setNight] = useState(false);

  // Сердце сцены: каждые 9 секунд кто-то меняет занятие, каждые 6.5 — новая
  // реплика. Так в комнате всегда есть движение, даже без задачи.
  useEffect(() => {
    const life = window.setInterval(() => setTick((value) => value + 1), 9000);
    const talk = window.setInterval(() => setLineIndex((value) => value + 1), 6500);
    const clockTimer = window.setInterval(() => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      setNight(now.getHours() >= 20 || now.getHours() < 7);
    }, 20000);
    return () => { window.clearInterval(life); window.clearInterval(talk); window.clearInterval(clockTimer); };
  }, []);

  // Первый тик часов — через таймер, чтобы не менять состояние прямо в эффекте.
  useEffect(() => {
    const first = window.setTimeout(() => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      setNight(now.getHours() >= 20 || now.getHours() < 7);
    }, 0);
    return () => window.clearTimeout(first);
  }, []);

  const visible = useMemo(() => agents.filter((agent) => agent.isActive || agent.role === "main").slice(0, 8), [agents]);
  const current = lines.length > 0 ? lines[lineIndex % lines.length] : null;

  // Позиция: рабочее место по роли, иначе свободное занятие. На каждом тике
  // двое «переезжают», поэтому комната не замирает.
  const layout = useMemo(() => {
    return visible.map((agent, index) => {
      const work = WORK_SPOTS[index % WORK_SPOTS.length];
      const idle = IDLE_SPOTS[(index + tick) % IDLE_SPOTS.length];
      const away = (index + tick) % 7 === 0;
      const mood: Mood = running ? moodOf(agent, current?.agentId ?? null, running, blockers) : away ? "away" : (index % 4 === 0 ? "coffee" : index % 4 === 1 ? "reading" : index % 4 === 2 ? "playing" : "idle");
      const spot = running ? work : away ? DOOR : idle;
      return { agent, mood, spot, walking: !running && (away || (index + tick) % 3 === 0) };
    });
  }, [visible, tick, running, current?.agentId, blockers]);

  const selected = layout.find((item) => item.agent.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <style>{`
        @keyframes aw-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.4px); } }
        .aw-bob { animation: aw-bob 3.4s ease-in-out infinite; }
        @keyframes aw-blink { 0%,100% { opacity: .95; } 45% { opacity: .25; } }
        .aw-lights rect { animation: aw-blink 6s ease-in-out infinite; }
        .aw-lights rect:nth-child(2n) { animation-duration: 8s; animation-delay: 1.2s; }
        .aw-lights rect:nth-child(3n) { animation-duration: 11s; animation-delay: 2.4s; }
        @keyframes aw-steam { 0% { opacity: .1; transform: translateY(0); } 50% { opacity: .5; } 100% { opacity: .1; transform: translateY(-3px); } }
        .aw-steam { animation: aw-steam 2.6s ease-in-out infinite; }
        @keyframes aw-cloud { from { transform: translateX(0); } to { transform: translateX(26px); } }
        .aw-cloud { animation: aw-cloud 18s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .aw-bob, .aw-lights rect, .aw-steam, .aw-cloud { animation: none; } }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">{ru ? "Студия: живые агенты" : "Studio: living agents"}</h3>
          <p className="text-[10px] text-[var(--text-muted)]">
            {running
              ? (ru ? "Работа идёт: кто у доски, кто за кодом" : "Work in progress")
              : (ru ? "Живая комната: кофе, бумаги, настолка — и разговоры" : "Living room: coffee, papers, a board game — and talks")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{night ? "🌙 " : "☀ "}{clock}</span>
          <button type="button" onClick={() => setRenaming((value) => !value)} className="rounded border border-[var(--border-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-blue-400">✏ {ru ? "Имена" : "Names"}</button>
          <button type="button" onClick={onQuickStart} className="rounded border border-[var(--border-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-blue-400">🎓 {ru ? "Как начать" : "How to start"}</button>
        </div>
      </div>

      {renaming ? (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
          <p className="mb-1 text-[10px] text-[var(--text-muted)]">{ru ? "Назовите агентов по-своему — Михалыч, Людочка, как удобно." : "Name the agents however you like."}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {visible.map((agent) => (
              <div key={agent.id} className="flex items-center gap-1">
                <span className="w-4 text-center text-[11px]" style={{ color: agent.color }}>{ROLE_ICON[agent.role] ?? "•"}</span>
                <input value={drafts[agent.id] ?? agent.name} onChange={(event) => setDrafts((prev) => ({ ...prev, [agent.id]: event.target.value }))} className="min-w-0 flex-1 rounded border border-[var(--border-input)] bg-[var(--bg-app)] px-2 py-1 text-[11px]" />
                <button type="button" onClick={() => onRename(agent.id, (drafts[agent.id] ?? agent.name).trim() || agent.name)} className="rounded border border-[var(--border-default)] px-1.5 py-1 text-[10px] hover:border-blue-400">✓</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-default)]" style={{ background: "#141d2c" }}>
        <svg viewBox="0 0 1000 540" preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="aw-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={night ? "#141d2c" : "#1d2a3c"} /><stop offset="100%" stopColor="#0f1724" />
            </linearGradient>
            <linearGradient id="aw-floor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b3748" /><stop offset="100%" stopColor="#161e2b" />
            </linearGradient>
            <linearGradient id="aw-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={night ? "#0a1224" : "#1c3f66"} /><stop offset="100%" stopColor={night ? "#1b2740" : "#2c5b86"} />
            </linearGradient>
            <linearGradient id="aw-screen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="aw-board" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f1efe8" /><stop offset="100%" stopColor="#ddd8cc" />
            </linearGradient>
          </defs>

          <rect width="1000" height="540" fill="url(#aw-wall)" />
          <rect y="392" width="1000" height="148" fill="url(#aw-floor)" />
          <path d="M0 392 h1000" stroke="#33425a" strokeWidth="2" />
          <g stroke="#1e2836" strokeWidth="1.4" opacity="0.7">
            <path d="M0 428 h1000" /><path d="M0 466 h1000" /><path d="M0 504 h1000" />
          </g>

          {/* окно: небо по времени, облака, мигающие окна домов */}
          <g>
            <rect x="672" y="36" width="196" height="146" rx="10" fill="url(#aw-sky)" stroke="#33425a" strokeWidth="4" />
            {night ? <circle cx="742" cy="76" r="11" fill="#fde68a" opacity="0.9" /> : <circle cx="770" cy="70" r="13" fill="#fde68a" opacity="0.95" />}
            <g className="aw-cloud" opacity={night ? 0.25 : 0.5}>
              <ellipse cx="700" cy="66" rx="22" ry="8" fill="#e2e8f0" />
              <ellipse cx="718" cy="62" rx="16" ry="7" fill="#e2e8f0" />
            </g>
            <g fill="#0d1524" stroke="#33425a" strokeWidth="1.2">
              <rect x="690" y="122" width="28" height="60" /><rect x="724" y="104" width="24" height="78" />
              <rect x="754" y="130" width="26" height="52" /><rect x="786" y="112" width="22" height="70" />
              <rect x="814" y="136" width="22" height="46" />
            </g>
            <g className="aw-lights" fill="#fbbf24" opacity="0.8">
              <rect x="696" y="130" width="5" height="6" /><rect x="706" y="144" width="5" height="6" />
              <rect x="730" y="114" width="5" height="6" /><rect x="740" y="132" width="5" height="6" />
              <rect x="760" y="140" width="5" height="6" /><rect x="792" y="122" width="5" height="6" />
              <rect x="820" y="146" width="5" height="6" /><rect x="708" y="160" width="5" height="6" />
            </g>
            <path d="M770 36 v146" stroke="#33425a" strokeWidth="3" />
          </g>

          {/* доска с задачей */}
          <g>
            <rect x="28" y="42" width="330" height="132" rx="10" fill="url(#aw-board)" stroke="#3c4b60" strokeWidth="3" />
            <text x="46" y="66" fontSize="9.5" fill="#5b6472" fontFamily="ui-sans-serif, system-ui" letterSpacing="1">{ru ? "ЗАДАЧА" : "TASK"}</text>
            <text x="46" y="88" fontSize="12" fill="#23272e" fontFamily="ui-sans-serif, system-ui">{(task ?? (ru ? "Пока задачи нет" : "No task yet")).slice(0, 44)}</text>
            <g stroke="#c8c1b2" strokeWidth="1.6"><path d="M46 102 h250" /><path d="M46 117 h206" /><path d="M46 132 h232" /></g>
            <g transform="translate(312 140)"><circle r="11" fill="none" stroke="#e11d48" strokeWidth="1.8" /><path d="M-4 0 h8 M0 -4 v8" stroke="#e11d48" strokeWidth="1.8" /></g>
            <circle cx="54" cy="54" r="4" fill="#60a5fa" /><circle cx="336" cy="54" r="4" fill="#f472b6" />
          </g>

          {/* кофемашина */}
          <g transform="translate(920 320)">
            <rect x="-32" y="0" width="64" height="76" rx="6" fill="#26313f" stroke="#3c4b60" strokeWidth="2" />
            <rect x="-23" y="10" width="46" height="28" rx="4" fill="#0f172a" stroke="#4b5b72" strokeWidth="1.5" />
            <rect x="-14" y="18" width="28" height="10" rx="2" fill="#c2410c" opacity="0.9" />
            <circle cx="0" cy="56" r="6" fill="none" stroke="#94a3b8" strokeWidth="2" />
            <rect x="-26" y="70" width="52" height="8" rx="3" fill="#1b2532" />
            <g transform="translate(-36 42)">
              <rect x="-6" y="0" width="12" height="9" rx="2" fill="#f5f5f4" />
              <rect x="-6" y="12" width="12" height="9" rx="2" fill="#e2e8f0" />
            </g>
            <path className="aw-steam" d="M0 4 q3 -8 0 -14" stroke="#cbd5e1" strokeWidth="2" fill="none" opacity="0.4" />
          </g>

          {/* столы с мониторами */}
          <g>
            <rect x="512" y="352" width="150" height="10" rx="5" fill="#3c4b60" />
            <rect x="546" y="292" width="84" height="56" rx="6" fill="#0b1220" stroke="#3c4b60" strokeWidth="2" />
            <rect x="552" y="298" width="72" height="44" rx="3" fill="url(#aw-screen)" />
            <g stroke="#60a5fa" strokeWidth="2.4" opacity="0.85"><path d="M558 308 h44" /><path d="M558 316 h54" /><path d="M558 324 h30" /></g>
            <rect x="586" y="348" width="10" height="6" rx="2" fill="#334155" />

            <rect x="690" y="374" width="130" height="9" rx="4" fill="#3c4b60" />
            <rect x="718" y="326" width="72" height="46" rx="5" fill="#0b1220" stroke="#3c4b60" strokeWidth="2" />
            <rect x="723" y="331" width="62" height="36" rx="3" fill="url(#aw-screen)" />
            <g stroke="#34d399" strokeWidth="2.2" opacity="0.85"><path d="M729 340 h36" /><path d="M729 347 h26" /><path d="M729 354 h44" /></g>
            <g transform="translate(738 366)"><rect x="-14" y="-6" width="28" height="16" rx="2" fill="#eef2f7" transform="rotate(-7)" /><path d="M-9 0 h18" stroke="#b6c0cc" strokeWidth="1.4" transform="rotate(-7)" /></g>
          </g>

          {/* растение и диван */}
          <g transform="translate(640 380)">
            <rect x="-11" y="22" width="22" height="26" rx="5" fill="#7c4a2a" />
            <path d="M0 22 q-19 -10 -14 -30 q17 4 14 30" fill="#166534" />
            <path d="M0 22 q19 -12 14 -34 q-17 6 -14 34" fill="#15803d" />
          </g>
          <g transform="translate(796 452)">
            <rect x="-58" y="-8" width="116" height="26" rx="10" fill="#334155" />
            <rect x="-58" y="-28" width="14" height="34" rx="6" fill="#3c4b60" />
            <rect x="44" y="-28" width="14" height="34" rx="6" fill="#3c4b60" />
            <rect x="-44" y="-14" width="26" height="14" rx="5" fill="#475569" />
            <rect x="8" y="-14" width="26" height="14" rx="5" fill="#475569" />
          </g>

          {/* настолка на полу */}
          <g transform="translate(424 470)">
            <rect x="-34" y="-10" width="68" height="20" rx="4" fill="#1f2937" stroke="#475569" strokeWidth="1.5" />
            <circle cx="-14" cy="-2" r="4" fill="#ef4444" /><circle cx="2" cy="-4" r="4" fill="#3b82f6" /><circle cx="16" cy="-1" r="4" fill="#22c55e" />
          </g>

          {/* дверь */}
          <g>
            <rect x="884" y="288" width="64" height="122" rx="4" fill="#6b4a2e" stroke="#3f2c1c" strokeWidth="3" />
            <rect x="890" y="294" width="52" height="48" rx="3" fill="#5b3d25" opacity="0.7" />
            <circle cx="894" cy="352" r="3.6" fill="#e7c07a" />
            <path d="M884 410 h64" stroke="#3f2c1c" strokeWidth="3" />
          </g>

          {layout.map((item, index) => (
            <Figure
              key={item.agent.id}
              agent={item.agent}
              spot={item.spot}
              mood={item.mood}
              index={index}
              walking={item.walking}
              selected={selectedId === item.agent.id}
              onSelect={() => setSelectedId((currentId) => (currentId === item.agent.id ? null : item.agent.id))}
            />
          ))}

          {/* карточка выбранного: раньше клик закрывал мир */}
          {selected ? (
            <g transform="translate(300 210)">
              <rect x="0" y="0" width="400" height="96" rx="14" fill="#0f1622" stroke="#3b82f6" strokeWidth="2" />
              <text x="16" y="26" fontSize="12" fill="#e7e3dc" fontFamily="ui-sans-serif, system-ui" fontWeight="bold">{selected.agent.name}</text>
              <text x="16" y="44" fontSize="10" fill="#8fa3b8" fontFamily="ui-sans-serif, system-ui">{MOOD_LABEL[selected.mood][ru ? 0 : 1]} · {selected.agent.role}</text>
              <text x="16" y="64" fontSize="10" fill="#c7d2de" fontFamily="ui-sans-serif, system-ui">
                {(lines.filter((line) => line.agentId === selected.agent.id).slice(-1)[0]?.text ?? (ru ? "Пока молчит" : "Silent for now")).slice(0, 62)}
              </text>
              <g style={{ cursor: "pointer" }} onClick={() => onOpenChat(selected.agent.id)}>
                <rect x="286" y="58" width="98" height="26" rx="8" fill="#1d4ed8" />
                <text x="335" y="75" textAnchor="middle" fontSize="10" fill="#ffffff" fontFamily="ui-sans-serif, system-ui">{ru ? "Открыть чат" : "Open chat"}</text>
              </g>
            </g>
          ) : null}

          {/* реплика: меняется сама, даже если никто не пишет */}
          {current ? (
            <g transform="translate(372 108)">
              <rect x="0" y="0" width="360" height="70" rx="14" fill="#fffdf6" stroke="#2f2a25" strokeWidth="2.5" />
              <path d="M46 70 l-10 18 l26 -18 z" fill="#fffdf6" stroke="#2f2a25" strokeWidth="2.5" />
              <text x="14" y="22" fontSize="10" fontWeight="bold" fill={current.color} fontFamily="ui-sans-serif, system-ui">
                {current.name.toUpperCase()}{current.stance === "blocker" ? (ru ? " · БЛОКЕР" : " · BLOCKER") : ""}
              </text>
              <foreignObject x="14" y="28" width="332" height="38">
                <div style={{ font: "11.5px ui-sans-serif, system-ui", color: "#23232a", lineHeight: 1.25 }}>
                  {current.text.replace(/\s+/g, " ").replace(/\[[^\]]*\]/g, "").slice(0, 150)}
                </div>
              </foreignObject>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--text-secondary)]">
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">☕ {ru ? "кофе" : "coffee"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">📄 {ru ? "читает" : "reading"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">🎲 {ru ? "играет" : "playing"}</span>
        <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5">🚪 {ru ? "вышел" : "away"}</span>
        <span className="rounded-full border border-rose-500/40 px-2 py-0.5 text-rose-300">! {ru ? "блокер" : "blocker"}</span>
        <span className="ml-auto">{ru ? "Клик по человеку — карточка, а не закрытие мира" : "Click a person for a card, not a close"}</span>
      </div>
    </div>
  );
}
