// Runs once when the Next server boots. Telegram commands must work after a
// restart without waiting for the user to open Settings again.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureWorkspaceBootstrap, getWorkspaceSettingsRow } = await import("@/lib/workspace");
    await ensureWorkspaceBootstrap();
    const settings = await getWorkspaceSettingsRow();
    if (!settings?.telegramToken) return;
    const { ensureTelegramPolling } = await import("@/lib/telegram");
    ensureTelegramPolling();
  } catch {
    // Telegram is optional: a missing/broken database must never block startup.
  }
}
