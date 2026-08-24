import { NextResponse } from "next/server";
import { clearSystemEvents, listSystemEvents } from "@/lib/system-events";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  return NextResponse.json({ events: await listSystemEvents(Number.isFinite(limit) ? limit : 100) }, { headers: { "Cache-Control": "no-store" } });
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
