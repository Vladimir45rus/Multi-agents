import { getWorkspaceSnapshot, rollbackFileContent } from "@/lib/workspace";
import { getWorkspaceRoot, rollbackWorkspaceFile } from "@/lib/workspace-files";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fileId = Number(id);
    if (!Number.isFinite(fileId)) return Response.json({ error: "Invalid file id" }, { status: 400 });

    const body = (await request.json()) as { actorAgentId?: number; locale?: "ru" | "en" };
    if (!body.actorAgentId || !Number.isFinite(body.actorAgentId)) return Response.json({ error: "actorAgentId is required" }, { status: 400 });

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
    return Response.json({ error: error instanceof Error ? error.message : "Rollback failed" }, { status: 400 });
  }
}
