"use client";

import { useEffect, useMemo, useState } from "react";

export type MeetingStance = "approve" | "change" | "blocker" | "none";

export type MeetingLine = {
  id: string;
  agentId: number;
  name: string;
  role: string;
  color: string;
  text: string;
  stance: MeetingStance;
};

type Seat = { x: number; y: number; front: boolean };

// Three seats behind the table, three at the near edge. Everyone sits
// upright; the near edge is drawn over their bodies so they read as
// "sitting at the table" instead of standing behind it.
const SEATS: Seat[] = [
  { x: 196, y: 96, front: false },
  { x: 316, y: 78, front: false },
  { x: 436, y: 96, front: false },
  { x: 132, y: 246, front: true },
  { x: 300, y: 258, front: true },
  { x: 468, y: 246, front: true },
];

const ROLE_ICON: Record<string, string> = {
  main: "★",
  advisor: "?",
  architect: "△",
  reviewer: "☑",
  tester: "✓",
  uiux: "◐",
  security: "⛨",
  skeptic: "!",
  observer: "◉",
  auto: "∞",
};

const SKIN = ["#f3c9a6", "#e2ac86", "#c98d63", "#f6d8bd"];
const HAIR = ["#2b2b31", "#5a3a22", "#8a5a2b", "#1d1d22"];

function shorten(text: string, limit: number) {
  const clean = text
    .replace(/\[STANCE:[^\]]*\]/gi, "")
    .replace(/\[[А-ЯA-Z ]+:?\s*[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function shortName(name: string) {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

// One cartoon colleague: chair, torso, arms, head, face, role badge and a
// caption chip above the head. No flipping: the near edge hides the torso.
function Actor({ seat, line, active }: { seat: Seat; line: MeetingLine; active: boolean }) {
  const skin = SKIN[line.agentId % SKIN.length];
  const hair = HAIR[(line.agentId + 1) % HAIR.length];
  const skeptic = line.role === "skeptic";
  const angry = line.stance === "blocker";

  return (
    <g transform={`translate(${seat.x} ${seat.y})`}>
      {active ? <circle cx="0" cy="2" r="46" fill="#fde68a" opacity="0.16" /> : null}

      <rect x="-26" y="0" width="52" height="48" rx="12" fill="#3f3126" opacity="0.6" />
      <path d="M-24 52 q24 -32 48 0 z" fill={line.color} opacity="0.9" />
      <rect x="-18" y="12" width="36" height="36" rx="13" fill={line.color} />

      {skeptic ? (
        <>
          <path d="M-16 24 q-20 -14 -16 -34" stroke={line.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="-32" cy="-13" r="6.5" fill={skin} />
          <path d="M16 26 q19 -8 22 -26" stroke={line.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="39" cy="-2" r="6.5" fill={skin} />
        </>
      ) : (
        <>
          <path d="M-17 30 q-17 4 -21 12" stroke={line.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M17 30 q17 4 21 12" stroke={line.color} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="-39" cy="45" r="6" fill={skin} />
          <circle cx="39" cy="45" r="6" fill={skin} />
        </>
      )}

      <rect x="-5" y="4" width="10" height="9" fill={skin} />
      <ellipse cx="0" cy="-8" rx="15" ry="16" fill={skin} />
      <path d="M-15 -10 q15 -18 30 0 q-6 -12 -15 -12 q-9 0 -15 12 z" fill={hair} />

      <circle cx="-5.5" cy="-8" r="1.7" fill="#23232a" />
      <circle cx="5.5" cy="-8" r="1.7" fill="#23232a" />
      {angry ? (
        <>
          <path d="M-11 -14 l6 3" stroke="#23232a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M11 -14 l-6 3" stroke="#23232a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M-5 0 q5 -5 10 0" stroke="#8b1d2c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <path d="M-4 -1 q4 3 8 0" stroke="#8a5a4a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}

      {/* role badge */}
      <g transform="translate(-37 -20)">
        <circle cx="0" cy="0" r="9" fill="#111418" stroke={line.color} strokeWidth="1.5" />
        <text x="0" y="3.4" textAnchor="middle" fontSize="9" fill={line.color} fontFamily="ui-sans-serif, system-ui">
          {ROLE_ICON[line.role] ?? "•"}
        </text>
      </g>

      {/* name chip: above the head for the back row, on the chest for the near row */}
      <g transform={seat.front ? "translate(0 40)" : "translate(0 -50)"}>
        <rect x={-Math.max(26, shortName(line.name).length * 3.4)} y="-11" width={Math.max(52, shortName(line.name).length * 6.8)} height="16" rx="8" fill="#111418" opacity="0.85" />
        <text x="0" y="1" textAnchor="middle" fontSize="9.5" fill="#e7e3dc" fontFamily="ui-sans-serif, system-ui">
          {shortName(line.name)}
        </text>
      </g>
    </g>
  );
}

export function TeamMeeting({ lines, locale, title }: { lines: MeetingLine[]; locale: "ru" | "en"; title?: string }) {
  const speakers = useMemo(() => {
    const seen = new Map<number, MeetingLine>();
    for (const line of lines) if (!seen.has(line.agentId)) seen.set(line.agentId, line);
    return [...seen.values()].slice(0, SEATS.length);
  }, [lines]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  // The timer advances the scene; no setState runs synchronously in an effect.
  useEffect(() => {
    if (!playing || lines.length === 0 || step >= lines.length) return;
    const timer = window.setTimeout(() => {
      setStep((value) => {
        const next = value + 1;
        if (next >= lines.length) setPlaying(false);
        return next;
      });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [playing, step, lines.length]);

  const current = lines[Math.min(step, Math.max(lines.length - 1, 0))];
  const blockers = lines.filter((line) => line.stance === "blocker");

  const backSeats = SEATS.filter((seat) => !seat.front);
  const frontSeats = SEATS.filter((seat) => seat.front);
  const backCast = speakers.slice(0, backSeats.length);
  const frontCast = speakers.slice(backSeats.length, backSeats.length + frontSeats.length);

  return (
    <div className="team-meeting">
      <style>{`
        .tm-bubble { position: relative; margin-top: 10px; border-radius: 16px; padding: 10px 14px;
          background: #fffdf6; color: #23232a; border: 2px solid #2f2a25;
          box-shadow: 4px 4px 0 rgba(47,42,37,.85); min-height: 62px; }
        .tm-bubble::after { content: ""; position: absolute; left: 26px; top: -12px;
          border: 8px solid transparent; border-bottom-color: #2f2a25; }
        .tm-line { animation: tm-in .32s ease-out both; }
        @keyframes tm-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .tm-active { filter: drop-shadow(0 0 7px rgba(253,224,71,.7)); }
        @media (prefers-reduced-motion: reduce) { .tm-line { animation: none; } }
      `}</style>

      <svg viewBox="0 0 600 330" role="img" aria-label={title ?? (locale === "ru" ? "Заседание команды" : "Team meeting")} style={{ display: "block", width: "100%", height: "auto", borderRadius: 14 }}>
        <defs>
          <linearGradient id="tm-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a2118" />
            <stop offset="100%" stopColor="#171310" />
          </linearGradient>
          <linearGradient id="tm-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#463424" />
            <stop offset="100%" stopColor="#2b2016" />
          </linearGradient>
          <linearGradient id="tm-table" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a67c52" />
            <stop offset="100%" stopColor="#7a5636" />
          </linearGradient>
        </defs>

        <rect width="600" height="330" fill="url(#tm-wall)" />
        <rect y="206" width="600" height="124" fill="url(#tm-floor)" />

        <g opacity="0.95">
          <rect x="468" y="22" width="100" height="74" rx="6" fill="#0f172a" stroke="#4b3a2f" strokeWidth="4" />
          <circle cx="520" cy="44" r="9" fill="#fde68a" opacity="0.9" />
          <circle cx="505" cy="64" r="1.6" fill="#e2e8f0" />
          <circle cx="542" cy="70" r="1.3" fill="#e2e8f0" />
          <path d="M518 22 v74" stroke="#4b3a2f" strokeWidth="3" />
        </g>

        <g>
          <rect x="20" y="26" width="124" height="80" rx="6" fill="#e7e3dc" stroke="#4b3a2f" strokeWidth="4" />
          <text x="32" y="48" fontSize="10" fill="#3f3a34" fontFamily="ui-sans-serif, system-ui">
            {locale === "ru" ? "ПЛАН ЗАСЕДАНИЯ" : "AGENDA"}
          </text>
          <path d="M32 58 h84" stroke="#c8c1b6" strokeWidth="2" />
          <path d="M32 70 h70" stroke="#c8c1b6" strokeWidth="2" />
          <path d="M32 82 h76" stroke="#c8c1b6" strokeWidth="2" />
          <text x="32" y="97" fontSize="9" fill="#8a2c2c" fontFamily="ui-sans-serif, system-ui">
            {locale === "ru" ? "Фома ищет дыры" : "Skeptic hunts holes"}
          </text>
        </g>

        {/* back row sits behind the table */}
        {backSeats.map((seat, index) => {
          const speaker = backCast[index];
          if (!speaker) return null;
          return (
            <g key={`back-${speaker.agentId}`} className={current?.agentId === speaker.agentId ? "tm-active" : undefined}>
              <Actor seat={seat} line={speaker} active={current?.agentId === speaker.agentId} />
            </g>
          );
        })}

        {/* table */}
        <ellipse cx="300" cy="204" rx="186" ry="58" fill="#5c412c" />
        <ellipse cx="300" cy="198" rx="186" ry="58" fill="url(#tm-table)" />
        <ellipse cx="300" cy="194" rx="158" ry="44" fill="#b98c5f" opacity="0.35" />

        {/* props */}
        <g>
          <rect x="236" y="168" width="48" height="27" rx="3" fill="#20242b" stroke="#0f1216" strokeWidth="2" />
          <rect x="241" y="172" width="38" height="19" rx="2" fill="#3b82f6" opacity="0.6" />
          <rect x="230" y="195" width="60" height="5" rx="2.5" fill="#0f1216" />
          <g transform="rotate(-8 306 180)">
            <rect x="300" y="168" width="44" height="24" rx="2" fill="#f2efe8" />
            <path d="M306 176 h30 M306 183 h24" stroke="#b3aca2" strokeWidth="1.7" />
          </g>
          <rect x="356" y="172" width="19" height="14" rx="2" fill="#f5f5f4" />
          <rect x="360" y="163" width="17" height="12" rx="2" fill="#efeae2" />
          <rect x="382" y="174" width="15" height="13" rx="3" fill="#c2410c" opacity="0.9" />
          <ellipse cx="389" cy="174" rx="7.5" ry="2.6" fill="#7c2d12" />
        </g>

        {/* near row sits at the edge; the lip below hides their torso */}
        {frontSeats.map((seat, index) => {
          const speaker = frontCast[index];
          if (!speaker) return null;
          return (
            <g key={`front-${speaker.agentId}`} className={current?.agentId === speaker.agentId ? "tm-active" : undefined}>
              <Actor seat={seat} line={speaker} active={current?.agentId === speaker.agentId} />
            </g>
          );
        })}

        {/* near edge highlight only: the actors in front stay fully visible */}
        <path d="M114 204 a186 58 0 0 0 372 0" fill="none" stroke="#432f1e" strokeWidth="2.5" opacity="0.8" />

        {blockers.length > 0 ? (
          <g>
            <rect x="482" y="112" width="106" height="28" rx="14" fill="#7f1d1d" stroke="#fca5a5" strokeWidth="1.5" />
            <text x="535" y="130" textAnchor="middle" fontSize="11" fill="#fee2e2" fontFamily="ui-sans-serif, system-ui">
              {locale === "ru" ? `блокеров: ${blockers.length}` : `blockers: ${blockers.length}`}
            </text>
          </g>
        ) : null}
      </svg>

      {current ? (
        <div className="tm-bubble">
          <div key={current.id} className="tm-line">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: current.color }}>
              {current.name} · {ROLE_ICON[current.role] ?? ""}
              {current.stance === "blocker" ? (locale === "ru" ? " · блокер" : " · blocker") : ""}
            </p>
            <p className="text-[12px] leading-snug">{shorten(current.text, 260)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-center text-xs opacity-70">
          {locale === "ru" ? "Пока тишина — отправьте задачи, и команда соберётся." : "Nothing yet — send a task and the team will gather."}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] opacity-80">
        <span>{locale === "ru" ? `Реплика ${Math.min(step + 1, lines.length) || 0} из ${lines.length}` : `Line ${Math.min(step + 1, lines.length) || 0} of ${lines.length}`}</span>
        <span className="flex gap-1">
          <button type="button" onClick={() => { setStep(0); setPlaying(true); }} className="rounded border border-white/25 px-2 py-0.5 hover:border-white/60">
            {locale === "ru" ? "↺ Заново" : "↺ Replay"}
          </button>
          <button type="button" onClick={() => { setPlaying(false); setStep(lines.length); }} className="rounded border border-white/25 px-2 py-0.5 hover:border-white/60">
            {locale === "ru" ? "Показать всё" : "Show all"}
          </button>
        </span>
      </div>
    </div>
  );
}
