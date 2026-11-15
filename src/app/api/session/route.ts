import { NextResponse } from "next/server";
import { isLoopbackRequest } from "@/lib/mobile-auth";
import { getStudioSessionToken } from "@/lib/studio-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // The session secret is a local capability: never hand it to tunnel traffic.
  if (!isLoopbackRequest(request)) {
    return NextResponse.json({ error: "Session token is only available on the host machine" }, { status: 403 });
  }
  return NextResponse.json({ token: getStudioSessionToken() }, { headers: { "Cache-Control": "no-store" } });
}
