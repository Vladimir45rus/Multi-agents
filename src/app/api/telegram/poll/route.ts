import { NextResponse } from "next/server";
import { ensureTelegramPolling } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  ensureTelegramPolling();
  return NextResponse.json({ ok: true, running: true });
}
