import { connectWorkspaceDirectory, getWorkspaceRoot } from "@/lib/workspace-files";
import { recordSystemEvent } from "@/lib/system-events";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    return Response.json({ root: await getWorkspaceRoot() });
  } catch (error) {
    const message = await recordApiError("workspace.root.get", 400, error);
    return Response.json({ root: "", error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { directory?: string };
    if (!body.directory?.trim()) {
      await recordApiError("workspace.root.put", 400, "directory is required");
      return Response.json({ error: "directory is required" }, { status: 400 });
    }
    const result = await connectWorkspaceDirectory(body.directory);
    await recordSystemEvent("success", "workspace", `Workspace connected: ${result.root}`);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect workspace";
    await recordApiError("workspace.root.put", 400, error).catch(() => undefined);
    return Response.json({ error: message }, { status: 400 });
  }
}
