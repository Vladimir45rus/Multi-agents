import "server-only";

import { getWorkspaceSettingsRow } from "@/lib/workspace";
import { decryptSecret } from "@/lib/secret-vault";
import { recordSystemEvent } from "@/lib/system-events";
import { resolveConfirmation } from "@/lib/orchestrator";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };
type TelegramUpdate = {
  update_id: number;
  callback_query?: { id: string; data?: string; message?: { chat?: { id?: number | string } } };
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

export async function notifyTelegramRelease(status: "RELEASE_READY" | "WAITING", summary: string, confirmationId?: string) {
  const prefix = status === "RELEASE_READY" ? "✅ RELEASE_READY" : "⏳ Ожидается решение пользователя";
  return sendTelegramMessage(`${prefix}\n\n${summary}`, confirmationId ? { confirmationId } : undefined);
}

async function pollOnce() {
  const { token } = await credentials();
  if (!token) return;
  const updates = await telegramRequest<TelegramUpdate[]>(token, "getUpdates", { offset, timeout: 1, allowed_updates: ["callback_query"] });
  for (const update of updates ?? []) {
    offset = Math.max(offset, update.update_id + 1);
    const callback = update.callback_query;
    if (!callback?.data) continue;
    const callbackChatId = callback.message?.chat?.id;
    if (callbackChatId !== undefined && String(callbackChatId) !== String((await credentials()).chatId)) {
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
