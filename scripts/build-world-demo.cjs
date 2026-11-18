// Builds design/world-demo.html: a static frame of the "living studio" scene
// (agents walk around the room, talk, and work). Screenshot -> world-demo.png.
const fs = require("node:fs");
const path = require("node:path");

const W = 1180;
const H = 620;

const AGENTS = [
  { x: 250, y: 420, color: "#8b5cf6", badge: "★", name: "Главный", state: "печатает", skin: "#f3c9a6", hair: "#2b2b31" },
  { x: 400, y: 300, color: "#0ea5e9", badge: "△", name: "Архитектор", state: "идёт к доске", skin: "#e2ac86", hair: "#5a3a22", walking: true },
  { x: 700, y: 360, color: "#22c55e", badge: "☑", name: "Ревьюер", state: "читает дифф", skin: "#c98d63", hair: "#8a5a2b" },
  { x: 900, y: 315, color: "#e11d48", badge: "!", name: "Фома", state: "не согласен", skin: "#f6d8bd", hair: "#1d1d22", angry: true, walking: true },
  { x: 560, y: 400, color: "#ec4899", badge: "◐", name: "UI/UX", state: "правит 30px", skin: "#f3c9a6", hair: "#8a5a2b" },
];

function actor(a, index) {
  const parts = [`<g transform="translate(${a.x} ${a.y})">`];
  // shadow
  parts.push(`<ellipse cx="0" cy="52" rx="26" ry="7" fill="#000" opacity="0.28"/>`);
  // legs / walk pose
  if (a.walking) {
    parts.push(`<path d="M-8 34 l-6 18" stroke="${a.color}" stroke-width="8" stroke-linecap="round"/>`);
    parts.push(`<path d="M8 34 l8 16" stroke="${a.color}" stroke-width="8" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="M-7 34 l-2 18" stroke="${a.color}" stroke-width="8" stroke-linecap="round"/>`);
    parts.push(`<path d="M7 34 l2 18" stroke="${a.color}" stroke-width="8" stroke-linecap="round"/>`);
  }
  // torso
  parts.push(`<rect x="-16" y="4" width="32" height="34" rx="11" fill="${a.color}"/>`);
  // arms
  if (a.angry) {
    parts.push(`<path d="M-14 14 q-18 -10 -14 -26" stroke="${a.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    parts.push(`<circle cx="-29" cy="-13" r="6" fill="${a.skin}"/>`);
    parts.push(`<path d="M14 16 q16 -6 18 -20" stroke="${a.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    parts.push(`<circle cx="33" cy="-5" r="6" fill="${a.skin}"/>`);
  } else {
    parts.push(`<path d="M-14 16 q-14 4 -18 12" stroke="${a.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    parts.push(`<path d="M14 16 q14 4 18 12" stroke="${a.color}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    parts.push(`<circle cx="-33" cy="30" r="5.5" fill="${a.skin}"/>`);
    parts.push(`<circle cx="33" cy="30" r="5.5" fill="${a.skin}"/>`);
  }
  // head
  parts.push(`<rect x="-4" y="0" width="8" height="8" fill="${a.skin}"/>`);
  parts.push(`<ellipse cx="0" cy="-10" rx="14" ry="15" fill="${a.skin}"/>`);
  parts.push(`<path d="M-14 -12 q14 -17 28 0 q-6 -11 -14 -11 q-8 0 -14 11 z" fill="${a.hair}"/>`);
  parts.push(`<circle cx="-5" cy="-10" r="1.6" fill="#23232a"/><circle cx="5" cy="-10" r="1.6" fill="#23232a"/>`);
  if (a.angry) {
    parts.push(`<path d="M-10 -16 l5 3" stroke="#23232a" stroke-width="1.5" stroke-linecap="round"/>`);
    parts.push(`<path d="M10 -16 l-5 3" stroke="#23232a" stroke-width="1.5" stroke-linecap="round"/>`);
    parts.push(`<path d="M-4 -2 q4 -4 8 0" stroke="#8b1d2c" stroke-width="1.7" fill="none" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="M-3 -3 q3 3 6 0" stroke="#8a5a4a" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  }
  // role badge
  parts.push(`<g transform="translate(-34 -22)"><circle r="8.5" fill="#101318" stroke="${a.color}" stroke-width="1.4"/>`);
  parts.push(`<text y="3.2" text-anchor="middle" font-size="8.5" fill="${a.color}" font-family="ui-sans-serif, system-ui">${a.badge}</text></g>`);
  // name + state chip
  const w = Math.max(78, a.name.length * 7 + 26);
  parts.push(`<g transform="translate(0 -44)">`);
  parts.push(`<rect x="${-w / 2}" y="-14" width="${w}" height="26" rx="9" fill="#0f1319" opacity="0.92"/>`);
  parts.push(`<text y="-3" text-anchor="middle" font-size="9.5" fill="#e7e3dc" font-family="ui-sans-serif, system-ui">${a.name}</text>`);
  parts.push(`<text y="8" text-anchor="middle" font-size="8" fill="#8fa3b8" font-family="ui-sans-serif, system-ui">${a.state}</text>`);
  parts.push(`</g>`);
  parts.push(`</g>`);
  return parts.join("");
}

// walking motion lines
const motion = (x, y) => `
  <g opacity="0.5" stroke="#94a3b8" stroke-width="2" stroke-linecap="round">
    <path d="M${x - 46} ${y - 6} h-10"/><path d="M${x - 48} ${y + 4} h-14"/><path d="M${x - 44} ${y + 14} h-8"/>
  </g>`;

const scene = `
<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;border-radius:16px" role="img" aria-label="Живой мир агентов">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#141c2b"/><stop offset="100%" stop-color="#0d1320"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b2537"/><stop offset="100%" stop-color="#131a27"/>
    </linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1220"/><stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <rect y="430" width="${W}" height="${H - 430}" fill="url(#floor)"/>
  <path d="M0 430 h${W}" stroke="#243349" stroke-width="2"/>

  <!-- window with night city -->
  <g>
    <rect x="${W - 250}" y="60" width="180" height="140" rx="10" fill="url(#sky)" stroke="#2b3a52" stroke-width="4"/>
    <circle cx="${W - 150}" cy="98" r="12" fill="#fde68a" opacity="0.9"/>
    <g fill="#0f172a" stroke="#334155" stroke-width="1.5">
      <rect x="${W - 232}" y="150" width="34" height="50"/><rect x="${W - 188}" y="132" width="28" height="68"/>
      <rect x="${W - 150}" y="158" width="30" height="42"/><rect x="${W - 110}" y="140" width="26" height="60"/>
    </g>
    <path d="M${W - 160} 60 v140" stroke="#2b3a52" stroke-width="3"/>
  </g>

  <!-- task board: what the agent was told -->
  <g>
    <rect x="40" y="52" width="330" height="150" rx="12" fill="#101825" stroke="#243349" stroke-width="2"/>
    <text x="58" y="78" font-size="11" fill="#7dd3fc" font-family="ui-sans-serif, system-ui">ЗАДАЧА ОТ ПОЛЬЗОВАТЕЛЯ</text>
    <text x="58" y="102" font-size="14" fill="#e7e3dc" font-family="ui-sans-serif, system-ui">«Подвинь кнопку на 30 пикселей вправо»</text>
    <g font-family="ui-sans-serif, system-ui" font-size="11">
      <circle cx="66" cy="126" r="5" fill="#22c55e"/><text x="80" y="130" fill="#9fb3c8">UI/UX: сдвиг 30px → styles.css, строка 42</text>
      <circle cx="66" cy="148" r="5" fill="#22c55e"/><text x="80" y="152" fill="#9fb3c8">Ревьюер: отступ не ломает сетку</text>
      <circle cx="66" cy="170" r="5" fill="#e11d48"/><text x="80" y="174" fill="#fca5a5">Фома: а на 320px экране кнопка вылезет?</text>
    </g>
  </g>

  <!-- desks with monitors -->
  <g>
    <rect x="120" y="392" width="150" height="10" rx="4" fill="#3b4a61"/>
    <rect x="150" y="330" width="92" height="58" rx="6" fill="#0b1220" stroke="#334155" stroke-width="2"/>
    <rect x="156" y="336" width="80" height="46" rx="3" fill="url(#screen)"/>
    <g stroke="#60a5fa" stroke-width="3" opacity="0.85">
      <path d="M164 348 h50"/><path d="M164 356 h58"/><path d="M164 364 h34"/><path d="M176 372 h44"/>
    </g>

    <rect x="640" y="404" width="160" height="10" rx="4" fill="#3b4a61"/>
    <rect x="676" y="342" width="92" height="58" rx="6" fill="#0b1220" stroke="#334155" stroke-width="2"/>
    <rect x="682" y="348" width="80" height="46" rx="3" fill="url(#screen)"/>
    <g stroke="#34d399" stroke-width="3" opacity="0.85">
      <path d="M690 358 h48"/><path d="M690 366 h30"/><path d="M690 374 h54"/>
    </g>

    <!-- coffee + plant -->
    <rect x="286" y="382" width="16" height="14" rx="3" fill="#c2410c"/>
    <ellipse cx="294" cy="382" rx="8" ry="2.6" fill="#7c2d12"/>
    <g transform="translate(1080 350)">
      <rect x="-10" y="26" width="20" height="24" rx="4" fill="#7c4a2a"/>
      <path d="M0 26 q-18 -10 -14 -30 q16 4 14 30" fill="#166534"/>
      <path d="M0 26 q18 -12 14 -32 q-16 6 -14 32" fill="#15803d"/>
    </g>
  </g>

  <!-- speech bubble from Фома -->
  <g transform="translate(700 120)">
    <rect x="0" y="0" width="300" height="72" rx="14" fill="#fffdf6" stroke="#2f2a25" stroke-width="2.5"/>
    <path d="M232 72 l-10 22 l28 -22 z" fill="#fffdf6" stroke="#2f2a25" stroke-width="2.5"/>
    <text x="16" y="26" font-size="11" fill="#e11d48" font-weight="bold" font-family="ui-sans-serif, system-ui">ФОМА НЕВЕРУЮЩИЙ · БЛОКЕР</text>
    <text x="16" y="47" font-size="12" fill="#23232a" font-family="ui-sans-serif, system-ui">На мобильном кнопка станет 320px —</text>
    <text x="16" y="63" font-size="12" fill="#23232a" font-family="ui-sans-serif, system-ui">проверь перенос, иначе снова правим.</text>
  </g>

  <!-- speech bubble from Главный -->
  <g transform="translate(60 292)">
    <rect x="0" y="0" width="250" height="64" rx="14" fill="#1b2c4a" stroke="#3b82f6" stroke-width="2"/>
    <path d="M118 64 l-6 20 l24 -20 z" fill="#1b2c4a" stroke="#3b82f6" stroke-width="2"/>
    <text x="14" y="25" font-size="11" fill="#93c5fd" font-weight="bold" font-family="ui-sans-serif, system-ui">ГЛАВНЫЙ</text>
    <text x="14" y="48" font-size="12" fill="#e7e3dc" font-family="ui-sans-serif, system-ui">Ок, проверяю 320px и правлю.</text>
  </g>

  ${motion(400, 300)}
  ${motion(900, 315)}

  ${AGENTS.map(actor).join("")}

  <!-- status ticker -->
  <g transform="translate(40 ${H - 92})">
    <rect x="0" y="0" width="${W - 80}" height="56" rx="12" fill="#0f1622" stroke="#243349" stroke-width="2"/>
    <circle cx="26" cy="28" r="6" fill="#22c55e"/>
    <text x="44" y="24" font-size="11" fill="#9fb3c8" font-family="ui-sans-serif, system-ui">Идёт задача: «сдвинуть кнопку на 30 пикселей» · шаг 2 из 4 · изменено: src/components/Button.tsx</text>
    <text x="44" y="42" font-size="11" fill="#64748b" font-family="ui-sans-serif, system-ui">Говорит · идёт · делает — каждое действие видно в комнате, а не только в логах</text>
    <g transform="translate(${W - 260} 14)">
      <rect width="112" height="28" rx="14" fill="#1b2c4a" stroke="#3b82f6"/>
      <text x="56" y="19" text-anchor="middle" font-size="11" fill="#dbeafe" font-family="ui-sans-serif, system-ui">🎬 Запись</text>
      <rect x="120" width="112" height="28" rx="14" fill="#132033" stroke="#334155"/>
      <text x="176" y="19" text-anchor="middle" font-size="11" fill="#9fb3c8" font-family="ui-sans-serif, system-ui">⏸ Пауза</text>
    </g>
  </g>
</svg>`;

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><title>Живой мир агентов</title>
<style>
  body { margin:0; background:#080c14; font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; padding:18px; }
  .wrap { width: ${W}px; margin: 0 auto; }
  h1 { color:#fff; font-size:20px; margin:0 0 4px; }
  p.sub { color:#8fa3b8; font-size:12px; margin:0 0 14px; }
  .stage { background:#0b111c; border:1px solid #1f2b3d; border-radius:20px; padding:12px; }
</style></head>
<body><div class="wrap">
  <h1>Живой мир агентов — набросок</h1>
  <p class="sub">Комната студии: агенты ходят, говорят и работают. То же, что в видео, но про код.</p>
  <div class="stage">${scene}</div>
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, "..", "design", "world-demo.html"), html, "utf8");
console.log("world-demo.html:", html.length, "bytes");
