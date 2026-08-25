import { searchWorkspaceFiles } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { query?: string };
    return Response.json({ matches: await searchWorkspaceFiles(body.query ?? "") });
  } catch (error) {
    const message = await recordApiError("workspace.search", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
