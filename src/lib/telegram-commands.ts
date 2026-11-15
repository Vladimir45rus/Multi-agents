export type TelegramCommand =
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "stop" }
  | { kind: "log" }
  | { kind: "task"; task: string }
  | { kind: "unknown"; raw: string }
  | { kind: "text"; text: string };

const KNOWN = new Set(["start", "help", "status", "stop", "log", "task"]);

/**
 * Telegram sends commands as `/status@MyBotName`. Anything that does not start
 * with "/" is treated as a plain message so the bot can answer with help.
 */
export function parseTelegramCommand(input: string): TelegramCommand {
  const text = String(input ?? "").trim();
  if (!text.startsWith("/")) return { kind: "text", text };

  const spaceIndex = text.search(/\s/);
  const head = (spaceIndex === -1 ? text : text.slice(0, spaceIndex)).slice(1);
  const rest = spaceIndex === -1 ? "" : text.slice(spaceIndex).trim();
  const name = head.split("@")[0].toLowerCase();

  if (!KNOWN.has(name)) return { kind: "unknown", raw: head };
  if (name === "task") {
    if (!rest) return { kind: "unknown", raw: "task" };
    return { kind: "task", task: rest.slice(0, 4_000) };
  }
  return { kind: name as "start" | "help" | "status" | "stop" | "log" };
}

/** Only the chat that was configured in Settings may command the studio. */
export function isAllowedTelegramChat(
  incomingChatId: string | number | undefined,
  configuredChatId: string,
): boolean {
  if (incomingChatId === undefined || incomingChatId === null) return false;
  const configured = String(configuredChatId ?? "").trim();
  if (!configured) return false;
  return String(incomingChatId).trim() === configured;
}

export function telegramHelpText(): string {
  return [
    "Multi-Agent Code Studio — удалённое управление",
    "",
    "/status — что происходит сейчас",
    "/task <задача> — запустить оркестратор",
    "/stop — остановить текущую задачу",
    "/log — последние события",
    "/help — эта справка",
  ].join("\n");
}

export function formatTelegramStatus(payload: {
  projectRoot: string;
  activeTask: { task: string; step: string; iteration: number; maxIterations: number } | null;
  lastReport: { status: string; summary: string; createdAt: string } | null;
  autoApprove: boolean;
}): string {
  const lines = ["📊 Статус"];
  lines.push(`Проект: ${payload.projectRoot || "(не подключён)"}`);
  lines.push(`AUTO: ${payload.autoApprove ? "включён" : "выключен"}`);
  if (payload.activeTask) {
    lines.push(`Задача: ${payload.activeTask.task.slice(0, 300)}`);
    lines.push(`Шаг: ${payload.activeTask.step}, итерация ${payload.activeTask.iteration}/${payload.activeTask.maxIterations}`);
  } else {
    lines.push("Активной задачи нет.");
  }
  if (payload.lastReport) {
    lines.push(`Последний отчёт: ${payload.lastReport.status} (${payload.lastReport.createdAt})`);
    lines.push(payload.lastReport.summary.slice(0, 600));
  }
  return lines.join("\n").slice(0, 3_900);
}
