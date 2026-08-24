import { listOrchestratorReports } from "@/lib/orchestrator";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.round(limitParam), 50)) : 10;

    return Response.json({ reports: await listOrchestratorReports(limit) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = await recordApiError("orchestrate.reports", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
