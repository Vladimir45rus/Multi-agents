// Патч шаблона NSIS из app-builder-lib.
//
// Стандартная проверка «приложение запущено» (allowOnlyOneInstallerInstance.nsh)
// на некоторых машинах находит несуществующий процесс и после двух неудачных
// попыток показать «Не удалось закрыть Multi-Agent Code Studio» — даже когда
// приложение не запущено. Подключить свой макрос через nsis.include не помогает:
// !ifmacrodef вычисляется раньше, чем подключается пользовательский .nsh.
//
// Поэтому мы заменяем тело макроса на «пытаемся прибить остатки и идём дальше».
// Скрипт идемпотентен и вызывается из postinstall.
const fs = require("node:fs");
const path = require("node:path");

const template = path.join(
  __dirname,
  "..",
  "node_modules",
  "app-builder-lib",
  "templates",
  "nsis",
  "include",
  "allowOnlyOneInstallerInstance.nsh",
);

const MARKER = "; [patched by scripts/patch-nsis.cjs]";

const replacement = `!macro _CHECK_APP_RUNNING
  ${MARKER}
  DetailPrint "Закрываю предыдущую версию (если запущена)..."
  nsExec::Exec 'taskkill /IM "\${APP_EXECUTABLE_FILENAME}" /T /F'
  Pop $0
  Sleep 1200
!macroend`;

function main() {
  if (!fs.existsSync(template)) {
    console.log("[patch-nsis] шаблон не найден — пропускаю");
    return;
  }
  let text = fs.readFileSync(template, "utf8");
  if (text.includes(MARKER)) {
    console.log("[patch-nsis] уже пропатчен");
    return;
  }

  const start = text.indexOf("!macro _CHECK_APP_RUNNING");
  const end = text.indexOf("!macroend", start);
  if (start === -1 || end === -1) {
    console.log("[patch-nsis] макрос не найден — шаблон изменился, пропускаю");
    return;
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const block = replacement.replace(/\n/g, eol);
  text = text.slice(0, start) + block + text.slice(end + "!macroend".length);
  fs.writeFileSync(template, text, "utf8");
  console.log("[patch-nsis] проверка «приложение запущено» отключена");
}

main();
