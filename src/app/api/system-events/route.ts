import { NextResponse } from "next/server";
import { clearSystemEvents, listSystemEvents } from "@/lib/system-events";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.round(requestedLimit), 200)) : 100;
  return NextResponse.json({ events: await listSystemEvents(limit) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  try {
    await clearSystemEvents();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("system-events.delete", 500, error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
