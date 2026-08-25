import { NextResponse } from "next/server";
import { mobileAccessError } from "@/lib/mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;

  const url = new URL(request.url).searchParams.get("url") ?? "";

  if (!url || url.length > 2048) {
    return new NextResponse("Missing or too long ?url param", { status: 400 });
  }

  const QRCode = (await import("qrcode")).default;

  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 2,
    width: 280,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
  });
}