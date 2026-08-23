import { rollbackWorkspaceFile } from "@/lib/workspace-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string };
    if (!body.actorAgentId || !Number.isInteger(body.actorAgentId)) return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    if (!body.path?.trim()) return Response.json({ error: "path is required" }, { status: 400 });
    return Response.json({ ok: true, ...(await rollbackWorkspaceFile(body.actorAgentId, body.path)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace rollback failed" }, { status: 400 });
  }
}
