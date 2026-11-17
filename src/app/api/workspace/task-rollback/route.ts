import { latestWorkspaceHistoryId, listHistorySince, rollbackWorkspaceTask } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";
import { writeAccessError } from "@/lib/studio-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: how much of the current task can be rolled back.
export async function GET(request: Request) {
  const accessError = await writeAccessError(request);
  if (accessError) return accessError;
  try {
    const sinceId = Number(new URL(request.url).searchParams.get("sinceId") ?? "0");
    const baseline = Number.isFinite(sinceId) && sinceId >= 0 ? sinceId : 0;
    const rows = await listHistorySince(baseline);
    return Response.json({
      sinceId: baseline,
      files: [...new Set(rows.map((row) => row.filePath))],
      changes: rows.length,
      latestId: await latestWorkspaceHistoryId(),
    });
  } catch (error) {
    const message = await recordApiError("workspace.task.rollback.get", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}

// POST: restore every file the agents touched since the checkpoint.
export async function POST(request: Request) {
  const accessError = await writeAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { actorAgentId?: number; sinceId?: number };
    if (!body.actorAgentId || !Number.isInteger(body.actorAgentId)) {
      await recordApiError("workspace.task.rollback", 400, "actorAgentId is required");
      return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    }
    const sinceId = Number(body.sinceId ?? 0);
    if (!Number.isFinite(sinceId) || sinceId < 0) {
      await recordApiError("workspace.task.rollback", 400, "sinceId must be a non-negative number");
      return Response.json({ error: "sinceId must be a non-negative number" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await rollbackWorkspaceTask(body.actorAgentId, sinceId)) });
  } catch (error) {
    const message = await recordApiError("workspace.task.rollback", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
