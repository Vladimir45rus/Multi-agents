import { NextResponse } from "next/server";
import { ensureTelegramPolling } from "@/lib/telegram";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  ensureTelegramPolling();
  return NextResponse.json({ ok: true, running: true });
}
