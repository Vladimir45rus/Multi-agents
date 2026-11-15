import "server-only";

import { getWorkspaceSettingsRow } from "@/lib/workspace";
import { decryptSecret } from "@/lib/secret-vault";
import { listSystemEvents, recordSystemEvent } from "@/lib/system-events";
import { resolveConfirmation } from "@/lib/orchestrator";
import {
  formatTelegramStatus,
  isAllowedTelegramChat,
  parseTelegramCommand,
  telegramHelpText,
} from "@/lib/telegram-commands";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };
type TelegramUpdate = {
  update_id: number;
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number | string } } };
  message?: { chat?: { id?: number | string }; text?: string };
};

let polling = false;
let pollPromise: Promise<void> | null = null;
let offset = 0;

async function credentials() {
  const settings = await getWorkspaceSettingsRow();
  const token = settings.telegramToken ? await decryptSecret(settings.telegramToken) : "";
  return { token, chatId: settings.telegramChatId ?? "" };
}

async function telegramRequest<T>(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram API ${response.status}`);
  return payload.result as T;
}

async function replyToChat(token: string, chatId: string | number, text: string) {
  await telegramRequest(token, "sendMessage", { chat_id: chatId, text: text.slice(0, 3_900) });
}

export async function testTelegramConnection() {
  const { token, chatId } = await credentials();
  if (!token || !chatId) throw new Error("Telegram Bot Token and Chat ID are required");
  const bot = await telegramRequest<{ username?: string }>(token, "getMe", {});
  await telegramRequest(token, "sendMessage", { chat_id: chatId, text: `Multi-Agent Code Studio: связь проверена${bot.username ? ` (@${bot.username})` : ""}.` });
  await recordSystemEvent("success", "telegram", "Telegram connection verified");
  return { username: bot.username ?? "" };
}

export async function sendTelegramMessage(text: string, options?: { confirmationId?: string }) {
  const { token, chatId } = await credentials();
  if (!token || !chatId) return false;
  const replyMarkup = options?.confirmationId ? {
    inline_keyboard: [[
      { text: "✅ Утвердить", callback_data: `orchestrator:approve:${options.confirmationId}` },
      { text: "🔄 На доработку", callback_data: `orchestrator:rework:${options.confirmationId}` },
    ]],
  } : undefined;
  try {
    await telegramRequest(token, "sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });
    return true;
  } catch (error) {
    await recordSystemEvent("error", "telegram", error instanceof Error ? error.message : "Telegram send failed");
    return false;
  }
}

/** Milestone ping without buttons (task started, patch applied, checks failed…). */
export async function notifyTelegramEvent(text: string) {
  return sendTelegramMessage(text);
}

export async function notifyTelegramRelease(status: "RELEASE_READY" | "WAITING", summary: string, confirmationId?: string) {
  const prefix = status === "RELEASE_READY" ? "✅ RELEASE_READY" : "⏳ Ожидается решение пользователя";
  return sendTelegramMessage(`${prefix}\n\n${summary}`, confirmationId ? { confirmationId } : undefined);
}

async function handleTelegramCommand(token: string, chatId: string | number, text: string, configuredChatId: string) {
  const command = parseTelegramCommand(text);

  // Bootstrap: until a chat id is saved, the bot only reveals the caller's id.
  if (!configuredChatId) {
    await replyToChat(token, chatId, `Ваш chat id: ${chatId}\nВставьте его в Настройки → Telegram и нажмите «Проверить связь».`);
    return;
  }
  if (!isAllowedTelegramChat(chatId, configuredChatId)) {
    await replyToChat(token, chatId, "Этот чат не привязан к студии.");
    return;
  }

  if (command.kind === "start") {
    await replyToChat(token, chatId, `Chat id: ${chatId}\n\n${telegramHelpText()}`);
    return;
  }
  if (command.kind === "help") {
    await replyToChat(token, chatId, telegramHelpText());
    return;
  }
  if (command.kind === "text") {
    await replyToChat(token, chatId, `Я понимаю команды.\n\n${telegramHelpText()}`);
    return;
  }
  if (command.kind === "unknown") {
    await replyToChat(token, chatId, `Неизвестная команда /${command.raw}.\n\n${telegramHelpText()}`);
    return;
  }

  if (command.kind === "status") {
    const settings = await getWorkspaceSettingsRow();
    const { loadActiveTaskState } = await import("@/lib/orchestrator-state");
    const { hasRunningTask, listOrchestratorReports } = await import("@/lib/orchestrator");
    const state = await loadActiveTaskState();
    const running = state && hasRunningTask(state.taskId) ? state : null;
    const reports = await listOrchestratorReports(1);
    await replyToChat(token, chatId, formatTelegramStatus({
      projectRoot: settings.projectRoot ?? "",
      activeTask: running ? { task: running.task, step: running.step, iteration: running.iteration, maxIterations: running.maxIterations } : null,
      lastReport: reports[0] ? { status: reports[0].status, summary: reports[0].summary, createdAt: reports[0].createdAt } : null,
      autoApprove: Boolean(settings.autoApprove),
    }));
    return;
  }

  if (command.kind === "log") {
    const events = await listSystemEvents(10);
    const text = events
      .map((event) => `${new Date(event.createdAt).toLocaleTimeString("ru-RU")} [${event.level}] ${event.source}: ${event.message.slice(0, 160)}`)
      .join("\n");
    await replyToChat(token, chatId, text ? `🗒 Последние события:\n${text}` : "Событий пока нет.");
    return;
  }

  if (command.kind === "stop") {
    const { loadActiveTaskState } = await import("@/lib/orchestrator-state");
    const { abortTask } = await import("@/lib/orchestrator");
    const state = await loadActiveTaskState();
    if (!state) {
      await replyToChat(token, chatId, "Активной задачи нет.");
      return;
    }
    const aborted = abortTask(state.taskId);
    await replyToChat(token, chatId, aborted ? "⏹ Останавливаю задачу." : "Задача уже не выполняется.");
    await recordSystemEvent("info", "telegram", "Stop requested from Telegram");
    return;
  }

  if (command.kind === "task") {
    const { randomUUID } = await import("node:crypto");
    const { loadActiveTaskState } = await import("@/lib/orchestrator-state");
    const { registerTaskController, releaseTaskController, runOrchestrator, hasRunningTask } = await import("@/lib/orchestrator");
    const state = await loadActiveTaskState();
    if (state && hasRunningTask(state.taskId)) {
      await replyToChat(token, chatId, `Уже выполняется: ${state.task.slice(0, 200)} (${state.step}, ${state.iteration}/${state.maxIterations})`);
      return;
    }
    const settings = await getWorkspaceSettingsRow();
    const taskId = randomUUID();
    const controller = registerTaskController(taskId);
    void (async () => {
      try {
        for await (const event of runOrchestrator({
          task: command.task,
          taskId,
          mode: Boolean(settings.autoApprove) ? "autonomous" : "controlled",
          locale: "ru",
          signal: controller.signal,
        })) {
          void event;
        }
      } catch (error) {
        await recordSystemEvent("error", "telegram", error instanceof Error ? error.message : "Telegram task failed").catch(() => undefined);
      } finally {
        releaseTaskController(taskId);
      }
    })();
    await replyToChat(token, chatId, `🚀 Принял задачу:\n${command.task.slice(0, 500)}`);
    await recordSystemEvent("info", "telegram", "Task started from Telegram");
  }
}

async function pollOnce() {
  const { token, chatId } = await credentials();
  if (!token) return;
  const updates = await telegramRequest<TelegramUpdate[]>(token, "getUpdates", {
    offset,
    timeout: 1,
    allowed_updates: ["callback_query", "message"],
  });
  for (const update of updates ?? []) {
    offset = Math.max(offset, update.update_id + 1);

    const incomingText = update.message?.text;
    if (incomingText && update.message?.chat?.id !== undefined) {
      await handleTelegramCommand(token, update.message.chat.id, incomingText, chatId).catch(async (error) => {
        await recordSystemEvent("error", "telegram", error instanceof Error ? error.message : "Telegram command failed").catch(() => undefined);
      });
    }

    const callback = update.callback_query;
    if (!callback?.data) continue;
    const callbackChatId = callback.message?.chat?.id;
    if (callbackChatId !== undefined && !isAllowedTelegramChat(callbackChatId, chatId)) {
      await telegramRequest(token, "answerCallbackQuery", { callback_query_id: callback.id, text: "Недоступно для этого чата", show_alert: true });
      continue;
    }
    const match = callback.data.match(/^orchestrator:(approve|rework):(.+)$/);
    if (!match) continue;
    const approved = match[1] === "approve";
    resolveConfirmation(match[2], approved);
    await telegramRequest(token, "answerCallbackQuery", { callback_query_id: callback.id, text: approved ? "Утверждено" : "Отправлено на доработку" });
    await recordSystemEvent("info", "telegram", approved ? "Telegram approval received" : "Telegram rework request received");
  }
}

export function ensureTelegramPolling() {
  if (polling || pollPromise) return;
  polling = true;
  pollPromise = (async () => {
    while (polling) {
      try { await pollOnce(); }
      catch (error) { await recordSystemEvent("error", "telegram", error instanceof Error ? error.message : "Telegram polling failed"); }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  })().finally(() => { polling = false; pollPromise = null; });
}

export function stopTelegramPolling() {
  polling = false;
}
