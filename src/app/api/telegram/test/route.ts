import { NextResponse } from "next/server";
import { testTelegramConnection } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json({ ok: true, ...(await testTelegramConnection()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Telegram connection failed" }, { status: 400 });
  }
}
