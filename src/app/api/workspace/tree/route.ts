import { listWorkspaceTree } from "@/lib/workspace-files";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listWorkspaceTree(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to list workspace" }, { status: 400 });
  }
}
