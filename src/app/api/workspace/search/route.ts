import { searchWorkspaceFiles } from "@/lib/workspace-files";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string };
    return Response.json({ matches: await searchWorkspaceFiles(body.query ?? "") });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workspace search failed" }, { status: 400 });
  }
}
