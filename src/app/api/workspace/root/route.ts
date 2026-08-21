import { connectWorkspaceDirectory, getWorkspaceRoot } from "@/lib/workspace-files";

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
    return Response.json({ ok: true, ...(await connectWorkspaceDirectory(body.directory)) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to connect workspace" }, { status: 400 });
  }
}
