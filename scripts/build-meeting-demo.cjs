// Builds design/meeting-demo.html with static SVG (no runtime JS), so the
// mockup screenshot is deterministic. Mirrors src/components/team-meeting.tsx.
const fs = require("node:fs");
const path = require("node:path");

const SEATS = [
  { x: 196, y: 96, front: false },
  { x: 316, y: 78, front: false },
  { x: 436, y: 96, front: false },
  { x: 132, y: 246, front: true },
  { x: 300, y: 258, front: true },
  { x: 468, y: 246, front: true },
];

const CAST = [
  { name: "Архитектор", role: "architect", color: "#f59e0b", badge: "△" },
  { name: "Главный", role: "main", color: "#8b5cf6", badge: "★" },
  { name: "UI/UX", role: "uiux", color: "#ec4899", badge: "◐" },
  { name: "Ревьюер", role: "reviewer", color: "#22c55e", badge: "☑" },
  { name: "Тестер", role: "tester", color: "#14b8a6", badge: "✓" },
  { name: "Фома неверующий", role: "skeptic", color: "#e11d48", badge: "!" },
];

const SKIN = ["#f3c9a6", "#e2ac86", "#c98d63", "#f6d8bd"];
const HAIR = ["#2b2b31", "#5a3a22", "#8a5a2b", "#1d1d22"];

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function actor(seat, index) {
  const person = CAST[index];
  const skin = SKIN[index % SKIN.length];
  const hair = HAIR[(index + 1) % HAIR.length];
  const skeptic = person.role === "skeptic";
  const name = person.name.length > 14 ? `${person.name.slice(0, 13)}…` : person.name;
  const chipWidth = Math.max(52, name.length * 6.8);

  const parts = [
    `<g transform="translate(${seat.x} ${seat.y})">`,
    `<rect x="-26" y="0" width="52" height="48" rx="12" fill="#3f3126" opacity="0.6"/>`,
    `<path d="M-24 52 q24 -32 48 0 z" fill="${person.color}" opacity="0.9"/>`,
    `<rect x="-18" y="12" width="36" height="36" rx="13" fill="${person.color}"/>`,
  ];

  if (skeptic) {
    parts.push(
      `<path d="M-16 24 q-20 -14 -16 -34" stroke="${person.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
      `<circle cx="-32" cy="-13" r="6.5" fill="${skin}"/>`,
      `<path d="M16 26 q19 -8 22 -26" stroke="${person.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
      `<circle cx="39" cy="-2" r="6.5" fill="${skin}"/>`,
    );
  } else {
    parts.push(
      `<path d="M-17 30 q-17 4 -21 12" stroke="${person.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
      `<path d="M17 30 q17 4 21 12" stroke="${person.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
      `<circle cx="-39" cy="45" r="6" fill="${skin}"/>`,
      `<circle cx="39" cy="45" r="6" fill="${skin}"/>`,
    );
  }

  parts.push(
    `<rect x="-5" y="4" width="10" height="9" fill="${skin}"/>`,
    `<ellipse cx="0" cy="-8" rx="15" ry="16" fill="${skin}"/>`,
    `<path d="M-15 -10 q15 -18 30 0 q-6 -12 -15 -12 q-9 0 -15 12 z" fill="${hair}"/>`,
    `<circle cx="-5.5" cy="-8" r="1.7" fill="#23232a"/>`,
    `<circle cx="5.5" cy="-8" r="1.7" fill="#23232a"/>`,
  );

  if (skeptic) {
    parts.push(
      `<path d="M-11 -14 l6 3" stroke="#23232a" stroke-width="1.6" stroke-linecap="round"/>`,
      `<path d="M11 -14 l-6 3" stroke="#23232a" stroke-width="1.6" stroke-linecap="round"/>`,
      `<path d="M-5 0 q5 -5 10 0" stroke="#8b1d2c" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    );
  } else {
    parts.push(`<path d="M-4 -1 q4 3 8 0" stroke="#8a5a4a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
  }

  parts.push(
    `<g transform="translate(-37 -20)">`,
    `<circle cx="0" cy="0" r="9" fill="#111418" stroke="${person.color}" stroke-width="1.5"/>`,
    `<text x="0" y="3.4" text-anchor="middle" font-size="9" fill="${person.color}" font-family="ui-sans-serif, system-ui">${person.badge}</text>`,
    `</g>`,
    `<g transform="translate(0 ${seat.front ? 40 : -50})">`,
    `<rect x="${-chipWidth / 2}" y="-11" width="${chipWidth}" height="16" rx="8" fill="#111418" opacity="0.82"/>`,
    `<text x="0" y="1" text-anchor="middle" font-size="9.5" fill="#e7e3dc" font-family="ui-sans-serif, system-ui">${esc(name)}</text>`,
    `</g>`,
    `</g>`,
  );

  return parts.join("");
}

const backRow = [0, 1, 2].map((index) => actor(SEATS[index], index)).join("");
const frontRow = [3, 4, 5].map((index) => actor(SEATS[index], index)).join("");

const scene = `
<svg viewBox="0 0 600 330" width="100%" style="display:block" role="img" aria-label="Заседание команды">
  <defs>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a2118"/><stop offset="100%" stop-color="#171310"/></linearGradient>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#463424"/><stop offset="100%" stop-color="#2b2016"/></linearGradient>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a67c52"/><stop offset="100%" stop-color="#7a5636"/></linearGradient>
  </defs>
  <rect width="600" height="330" fill="url(#w)"/>
  <rect y="206" width="600" height="124" fill="url(#f)"/>

  <rect x="468" y="22" width="100" height="74" rx="6" fill="#0f172a" stroke="#4b3a2f" stroke-width="4"/>
  <circle cx="520" cy="44" r="9" fill="#fde68a" opacity="0.9"/>
  <circle cx="505" cy="64" r="1.6" fill="#e2e8f0"/>
  <circle cx="542" cy="70" r="1.3" fill="#e2e8f0"/>
  <path d="M518 22 v74" stroke="#4b3a2f" stroke-width="3"/>

  <rect x="20" y="26" width="124" height="80" rx="6" fill="#e7e3dc" stroke="#4b3a2f" stroke-width="4"/>
  <text x="32" y="48" font-size="10" fill="#3f3a34" font-family="ui-sans-serif, system-ui">ПЛАН ЗАСЕДАНИЯ</text>
  <path d="M32 58 h84" stroke="#c8c1b6" stroke-width="2"/>
  <path d="M32 70 h70" stroke="#c8c1b6" stroke-width="2"/>
  <path d="M32 82 h76" stroke="#c8c1b6" stroke-width="2"/>
  <text x="32" y="97" font-size="9" fill="#8a2c2c" font-family="ui-sans-serif, system-ui">Фома ищет дыры</text>

  ${backRow}

  <ellipse cx="300" cy="204" rx="186" ry="58" fill="#5c412c"/>
  <ellipse cx="300" cy="198" rx="186" ry="58" fill="url(#t)"/>
  <ellipse cx="300" cy="194" rx="158" ry="44" fill="#b98c5f" opacity="0.35"/>

  <rect x="236" y="168" width="48" height="27" rx="3" fill="#20242b" stroke="#0f1216" stroke-width="2"/>
  <rect x="241" y="172" width="38" height="19" rx="2" fill="#3b82f6" opacity="0.6"/>
  <rect x="230" y="195" width="60" height="5" rx="2.5" fill="#0f1216"/>
  <g transform="rotate(-8 306 180)">
    <rect x="300" y="168" width="44" height="24" rx="2" fill="#f2efe8"/>
    <path d="M306 176 h30 M306 183 h24" stroke="#b3aca2" stroke-width="1.7"/>
  </g>
  <rect x="356" y="172" width="19" height="14" rx="2" fill="#f5f5f4"/>
  <rect x="360" y="163" width="17" height="12" rx="2" fill="#efeae2"/>
  <rect x="382" y="174" width="15" height="13" rx="3" fill="#c2410c" opacity="0.9"/>
  <ellipse cx="389" cy="174" rx="7.5" ry="2.6" fill="#7c2d12"/>

  ${frontRow}

  <path d="M114 204 a186 58 0 0 0 372 0" fill="none" stroke="#432f1e" stroke-width="2.5" opacity="0.8"/>

  <rect x="482" y="112" width="106" height="28" rx="14" fill="#7f1d1d" stroke="#fca5a5" stroke-width="1.5"/>
  <text x="535" y="130" text-anchor="middle" font-size="11" fill="#fee2e2" font-family="ui-sans-serif, system-ui">блокеров: 1</text>
</svg>`;

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Заседание команды — демо</title>
<style>
  body { margin: 0; background: #101010; font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; padding: 16px; }
  .wrap { width: 760px; margin: 0 auto; }
  h1 { color: #fff; font-size: 19px; margin: 0 0 2px; }
  p.sub { color: #9aa3ad; font-size: 12px; margin: 0 0 12px; }
  .stage { background: #171310; border: 1px solid #2a2a2e; border-radius: 18px; padding: 14px; }
  .bubble { position: relative; margin-top: 10px; border-radius: 16px; padding: 11px 15px; background: #fffdf6;
    color: #23232a; border: 2px solid #2f2a25; box-shadow: 4px 4px 0 rgba(47,42,37,.85); }
  .bubble::after { content: ""; position: absolute; left: 26px; top: -12px; border: 8px solid transparent; border-bottom-color: #2f2a25; }
  .who { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 3px; }
  .txt { font-size: 12.5px; line-height: 1.35; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🎬 Заседание команды</h1>
  <p class="sub">Сцена собрана из последних реплик группы: кто за столом, кто стучит кулаком.</p>
  <div class="stage">
    ${scene}
    <div class="bubble">
      <div class="who" style="color:#e11d48">Фома неверующий · ! · блокер</div>
      <div class="txt">Ты уверен, что это работает на пустом проекте? Где проверка на пустой список файлов и что будет при повторном нажатии «Создать»?</div>
    </div>
  </div>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, "..", "design", "meeting-demo.html"), html, "utf8");
console.log("written", html.length, "bytes");
