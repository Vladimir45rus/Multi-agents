import { listWorkspaceTree } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listWorkspaceTree(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = await recordApiError("workspace.tree", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
