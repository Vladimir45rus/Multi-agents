import { listOrchestratorEvents } from "@/lib/orchestrator";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.round(limitParam), 200)) : 100;

    return Response.json({ events: await listOrchestratorEvents(limit) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = await recordApiError("orchestrate.events", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
