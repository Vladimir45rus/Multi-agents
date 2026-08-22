import { listSystemEvents } from "@/lib/system-events";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return Response.json({ events: await listSystemEvents(Number.isFinite(limit) ? limit : 100) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "System events load failed" }, { status: 500 });
  }
}
