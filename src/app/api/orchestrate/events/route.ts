import { listOrchestratorEvents } from "@/lib/orchestrator";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.round(limitParam), 200)) : 100;

    return Response.json({ events: await listOrchestratorEvents(limit) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load orchestrator events";
    return Response.json({ error: message }, { status: 400 });
  }
}
