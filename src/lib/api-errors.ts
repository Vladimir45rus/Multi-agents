import "server-only";

import { recordSystemEvent, type SystemEventLevel } from "@/lib/system-events";

export async function recordApiError(source: string, status: number, error: unknown, details = "") {
  const message = error instanceof Error ? error.message : String(error || "API request failed");
  const level: SystemEventLevel = status >= 500 || status === 429 || status === 403 || status === 401 ? "error" : "warning";
  await recordSystemEvent(level, source, `HTTP ${status}: ${message}`, details || (error instanceof Error ? error.stack ?? "" : ""));
  return message;
}
