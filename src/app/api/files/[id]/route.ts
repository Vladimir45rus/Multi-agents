import { getWorkspaceSnapshot, saveFileContent } from "@/lib/workspace";
import { applyWorkspacePatch, getWorkspaceRoot } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const { id } = await params;
    const fileId = Number(id);
    if (!Number.isFinite(fileId)) {
      await recordApiError("files.save", 400, "Invalid file id");
      return Response.json({ error: "Invalid file id" }, { status: 400 });
    }

    const body = (await request.json()) as { content?: string; actorAgentId?: number; locale?: "ru" | "en" };
    if (typeof body.content !== "string") {
      await recordApiError("files.save", 400, "content is required");
      return Response.json({ error: "content is required" }, { status: 400 });
    }
    if (!body.actorAgentId || !Number.isFinite(body.actorAgentId)) {
      await recordApiError("files.save", 400, "actorAgentId is required");
      return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    }

    const workspace = await getWorkspaceSnapshot();
    const file = workspace.files.find((item) => item.id === fileId);
    if (!file) return Response.json({ error: "File not found" }, { status: 404 });

    try {
      await getWorkspaceRoot();
      await applyWorkspacePatch(body.actorAgentId, [{ path: file.path, operation: "modify", content: body.content }]);
    } catch (error) {
      if (error instanceof Error && error.message === "Connect a project directory first") {
        await saveFileContent(fileId, body.content, body.actorAgentId, body.locale);
      } else {
        throw error;
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("files.save", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
