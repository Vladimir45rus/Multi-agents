import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { visualEdits } from "@/db/schema";
import {
  buildVisualBrief,
  describeOffset,
  normalizeVisualEdit,
  type VisualAction,
  type VisualEdit,
  type VisualEditInput,
} from "@/lib/visual-brief";

export { buildVisualBrief, describeOffset, normalizeVisualEdit };
export type { VisualAction, VisualEdit, VisualEditInput };

const ACTIONS: VisualAction[] = ["move", "hide", "resize", "style"];

function toVisualEdit(row: typeof visualEdits.$inferSelect): VisualEdit {
  return {
    id: row.id,
    selector: row.selector,
    label: row.label,
    action: (ACTIONS.includes(row.action as VisualAction) ? row.action : "move") as VisualAction,
    offsetX: row.offsetX,
    offsetY: row.offsetY,
    note: row.note,
    pageUrl: row.pageUrl,
    domPath: row.domPath,
    styles: row.styles,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function listVisualEdits(): Promise<VisualEdit[]> {
  const rows = await db.select().from(visualEdits).orderBy(asc(visualEdits.id));
  return rows.map(toVisualEdit);
}

/**
 * One element = one row: dragging the same node again updates its offsets
 * instead of piling up duplicates in the brief.
 */
export async function saveVisualEdit(input: VisualEditInput): Promise<VisualEdit> {
  const normalized = normalizeVisualEdit(input);
  const [existing] = await db
    .select()
    .from(visualEdits)
    .where(eq(visualEdits.selector, normalized.selector))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(visualEdits)
      .set({ ...normalized, createdAt: new Date() })
      .where(eq(visualEdits.id, existing.id))
      .returning();
    return toVisualEdit(updated);
  }

  const [created] = await db.insert(visualEdits).values(normalized).returning();
  return toVisualEdit(created);
}

export async function deleteVisualEdit(id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  const [removed] = await db.delete(visualEdits).where(eq(visualEdits.id, id)).returning({ id: visualEdits.id });
  return Boolean(removed);
}

export async function clearVisualEdits(): Promise<number> {
  const rows = await db.delete(visualEdits).returning({ id: visualEdits.id });
  return rows.length;
}
