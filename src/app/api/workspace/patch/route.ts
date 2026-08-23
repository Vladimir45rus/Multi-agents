import { applyWorkspacePatch, type WorkspacePatchFile } from "@/lib/workspace-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { actorAgentId?: number; patch?: WorkspacePatchFile[] };
    if (!body.actorAgentId || !Number.isInteger(body.actorAgentId)) return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    return Response.json({ ok: true, ...(await applyWorkspacePatch(body.actorAgentId, body.patch ?? [])) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace patch failed" }, { status: 400 });
  }
}
