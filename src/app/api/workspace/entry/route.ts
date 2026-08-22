import { createWorkspaceEntry, deleteWorkspaceEntry, renameWorkspaceEntry } from "@/lib/workspace-files";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string; kind?: "file" | "directory"; content?: string };
    if (!body.actorAgentId || !body.path || !body.kind) return Response.json({ error: "actorAgentId, path and kind are required" }, { status: 400 });
    return Response.json({ ok: true, ...(await createWorkspaceEntry(body.actorAgentId, body.path, body.kind, body.content ?? "")) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace entry creation failed" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string; nextPath?: string };
    if (!body.actorAgentId || !body.path || !body.nextPath) return Response.json({ error: "actorAgentId, path and nextPath are required" }, { status: 400 });
    return Response.json({ ok: true, ...(await renameWorkspaceEntry(body.actorAgentId, body.path, body.nextPath)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace entry rename failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string };
    if (!body.actorAgentId || !body.path) return Response.json({ error: "actorAgentId and path are required" }, { status: 400 });
    return Response.json({ ok: true, ...(await deleteWorkspaceEntry(body.actorAgentId, body.path)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace entry deletion failed" }, { status: 400 });
  }
}
