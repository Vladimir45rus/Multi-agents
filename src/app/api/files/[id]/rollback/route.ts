import { getWorkspaceSnapshot, rollbackFileContent } from "@/lib/workspace";
import { getWorkspaceRoot, rollbackWorkspaceFile } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const { id } = await params;
    const fileId = Number(id);
    if (!Number.isFinite(fileId)) {
      await recordApiError("files.rollback", 400, "Invalid file id");
      return Response.json({ error: "Invalid file id" }, { status: 400 });
    }

    const body = (await request.json()) as { actorAgentId?: number; locale?: "ru" | "en" };
    if (!body.actorAgentId || !Number.isFinite(body.actorAgentId)) {
      await recordApiError("files.rollback", 400, "actorAgentId is required");
      return Response.json({ error: "actorAgentId is required" }, { status: 400 });
    }

    const workspace = await getWorkspaceSnapshot();
    const file = workspace.files.find((item) => item.id === fileId);
    if (!file) return Response.json({ error: "File not found" }, { status: 404 });

    try {
      await getWorkspaceRoot();
      await rollbackWorkspaceFile(body.actorAgentId, file.path);
    } catch (error) {
      if (error instanceof Error && error.message === "Connect a project directory first") {
        await rollbackFileContent(fileId, body.actorAgentId, body.locale);
      } else {
        throw error;
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("files.rollback", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
