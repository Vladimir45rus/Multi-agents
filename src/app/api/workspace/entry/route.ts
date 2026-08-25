import { createWorkspaceEntry, deleteWorkspaceEntry, renameWorkspaceEntry } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string; kind?: "file" | "directory"; content?: string };
    if (!body.actorAgentId || !body.path || !body.kind) {
      await recordApiError("workspace.entry.create", 400, "actorAgentId, path and kind are required");
      return Response.json({ error: "actorAgentId, path and kind are required" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await createWorkspaceEntry(body.actorAgentId, body.path, body.kind, body.content ?? "")) });
  } catch (error) {
    const message = await recordApiError("workspace.entry.create", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string; nextPath?: string };
    if (!body.actorAgentId || !body.path || !body.nextPath) {
      await recordApiError("workspace.entry.rename", 400, "actorAgentId, path and nextPath are required");
      return Response.json({ error: "actorAgentId, path and nextPath are required" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await renameWorkspaceEntry(body.actorAgentId, body.path, body.nextPath)) });
  } catch (error) {
    const message = await recordApiError("workspace.entry.rename", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { actorAgentId?: number; path?: string };
    if (!body.actorAgentId || !body.path) {
      await recordApiError("workspace.entry.delete", 400, "actorAgentId and path are required");
      return Response.json({ error: "actorAgentId and path are required" }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await deleteWorkspaceEntry(body.actorAgentId, body.path)) });
  } catch (error) {
    const message = await recordApiError("workspace.entry.delete", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
