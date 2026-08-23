import { NextRequest, NextResponse } from "next/server";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hostWithoutPort(host: string) {
  const trimmed = host.trim();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return trimmed.slice(1, end).toLowerCase();
  }
  const colon = trimmed.lastIndexOf(":");
  return (colon > -1 ? trimmed.slice(0, colon) : trimmed).toLowerCase();
}

function isLoopbackIp(ip: string) {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/mobile" && !request.nextUrl.searchParams.get("token")?.trim()) {
    return new NextResponse(JSON.stringify({ error: "Mobile access token is required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  const host = request.headers.get("host");
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim() ?? "";

  const fromLoopback = (host && LOOPBACK_HOSTS.has(hostWithoutPort(host))) || (forwardedIp && isLoopbackIp(forwardedIp));
  const isRemoteMobileRoute = pathname === "/api/workspace"
    || pathname === "/api/settings"
    || pathname === "/api/chat/stream"
    || pathname === "/api/preview"
    || pathname.startsWith("/api/preview/proxy");
  if (fromLoopback || isRemoteMobileRoute) return NextResponse.next();

  return new NextResponse(JSON.stringify({ error: "Forbidden: API is only accessible from localhost" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = {
  matcher: "/api/:path*",
};
