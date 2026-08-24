import { applyWorkspacePatch, type WorkspacePatchFile } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { actorAgentId?: number; patch?: WorkspacePatchFile[] };
    if (!body.actorAgentId || !Number.isInteger(body.actorAgentId)) {
      await recordApiError("workspace.patch", 400, "actorAgentId is required");
      return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await applyWorkspacePatch(body.actorAgentId, body.patch ?? [])) });
  } catch (error) {
    const message = await recordApiError("workspace.patch", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
