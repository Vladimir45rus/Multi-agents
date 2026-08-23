import { listOrchestratorReports } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.round(limitParam), 50)) : 10;

    return Response.json({ reports: await listOrchestratorReports(limit) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load orchestrator reports";
    return Response.json({ error: message }, { status: 400 });
  }
}
