import { NextResponse } from "next/server";
import { testTelegramConnection } from "@/lib/telegram";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    return NextResponse.json({ ok: true, ...(await testTelegramConnection()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Telegram connection failed" }, { status: 400 });
  }
}
