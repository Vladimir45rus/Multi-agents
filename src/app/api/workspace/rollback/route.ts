import { rollbackWorkspaceFile } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string };
    if (!body.actorAgentId || !Number.isInteger(body.actorAgentId)) {
      await recordApiError("workspace.rollback", 400, "actorAgentId is required");
      return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    }
    if (!body.path?.trim()) {
      await recordApiError("workspace.rollback", 400, "path is required");
      return Response.json({ error: "path is required" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await rollbackWorkspaceFile(body.actorAgentId, body.path)) });
  } catch (error) {
    const message = await recordApiError("workspace.rollback", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
