import { buildSnapshot, loadSnapshot, renderSnapshot, saveSnapshot, snapshotTokenEstimate } from "@/lib/context-memory";
import { db } from "@/db";
import { chatMessages, workspaceSettings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { mobileAccessError } from "@/lib/mobile-auth";
import { recordApiError } from "@/lib/api-errors";
import { writeAccessError } from "@/lib/studio-session";
import { recordSystemEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(senderType: string) {
  if (senderType === "user") return "user";
  if (senderType === "system") return "system";
  return "assistant";
}

async function projectRoot() {
  const [settings] = await db.select({ projectRoot: workspaceSettings.projectRoot }).from(workspaceSettings).limit(1);
  return settings?.projectRoot ?? "";
}

// GET: what the agents currently remember about the project.
export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const root = await projectRoot();
    if (!root) return Response.json({ error: "Connect a project directory first" }, { status: 400 });
    const snapshot = await loadSnapshot(root);
    if (!snapshot) return Response.json({ ready: false, snapshot: null });
    return Response.json({
      ready: true,
      snapshot,
      prompt: renderSnapshot(snapshot),
      promptTokens: snapshotTokenEstimate(snapshot),
    });
  } catch (error) {
    const message = await recordApiError("memory.get", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}

// POST: rebuild the snapshot from the project and the dialogue.
export async function POST(request: Request) {
  const accessError = await writeAccessError(request);
  if (accessError) return accessError;
  try {
    const root = await projectRoot();
    if (!root) return Response.json({ error: "Connect a project directory first" }, { status: 400 });

    const rows = await db
      .select({ senderType: chatMessages.senderType, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.chatChannel, "lead"))
      .orderBy(desc(chatMessages.id))
      .limit(120);

    const previous = await loadSnapshot(root);
    const snapshot = await buildSnapshot({
      projectRoot: root,
      messages: rows.reverse().map((row) => ({ role: roleOf(row.senderType), content: row.content })),
      previous,
    });
    const target = await saveSnapshot(snapshot);
    await recordSystemEvent(
      "info",
      "memory",
      [
        `Контекстная память обновлена: ${snapshot.files.length} ключевых файлов, ${snapshot.stack.length} технологий,`,
        `${snapshot.dependencies.length} связей, сэкономлено ~${snapshot.stats.savedTokens} токенов.`,
      ].join(" "),
    ).catch(() => undefined);

    return Response.json({
      ok: true,
      path: target,
      snapshot,
      prompt: renderSnapshot(snapshot),
      promptTokens: snapshotTokenEstimate(snapshot),
    });
  } catch (error) {
    const message = await recordApiError("memory.post", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
