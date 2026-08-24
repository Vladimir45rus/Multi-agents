import { connectWorkspaceDirectory, getWorkspaceRoot } from "@/lib/workspace-files";
import { recordSystemEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ root: await getWorkspaceRoot() });
  } catch (error) {
    return Response.json({ root: "", error: error instanceof Error ? error.message : "Workspace root is not configured" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { directory?: string };
    if (!body.directory?.trim()) return Response.json({ error: "directory is required" }, { status: 400 });
    const result = await connectWorkspaceDirectory(body.directory);
    await recordSystemEvent("success", "workspace", `Workspace connected: ${result.root}`);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect workspace";
    await recordSystemEvent("error", "workspace", message).catch(() => undefined);
    return Response.json({ error: message }, { status: 400 });
  }
}
