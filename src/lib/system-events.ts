import "server-only";

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { systemEvents } from "@/db/schema";

export type SystemEventLevel = "info" | "success" | "warning" | "error";

export async function recordSystemEvent(level: SystemEventLevel, source: string, message: string, details = "") {
  await db.insert(systemEvents).values({ level, source, message, details });
}

export async function listSystemEvents(limit = 100) {
  const rows = await db.select().from(systemEvents).orderBy(desc(systemEvents.id)).limit(Math.max(1, Math.min(limit, 500)));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
