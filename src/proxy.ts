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

// Security fix (S1): X-Forwarded-For is fully client-controlled and must never
// be used to decide whether a request originates from the local machine.
// Loopback detection now relies solely on the Host header of direct
// connections; tunneled traffic is additionally verified per-route via the
// mobile access token (see src/lib/mobile-auth.ts).

function isSameOriginRequest(request: NextRequest) {
  const originHeader = request.headers.get("origin");
  const hostHeader = request.headers.get("host") ?? "";

  if (originHeader) {
    try {
      const origin = new URL(originHeader);
      if (origin.host === hostHeader) return true;
      // Local aliases of the same machine are equivalent (e.g. an Electron
      // window on 127.0.0.1 talking to a localhost-bound server).
      return LOOPBACK_HOSTS.has(hostWithoutPort(origin.host)) && LOOPBACK_HOSTS.has(hostWithoutPort(hostHeader));
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite !== "cross-site";
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

  // Security fix (S2): block cross-site browser requests (CSRF) against the
  // localhost API. Browsers always attach Origin or Sec-Fetch-Site on
  // state-changing requests; non-browser clients carry no such headers and
  // remain subject to the per-route mobile access token checks.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !isSameOriginRequest(request)) {
    return new NextResponse(JSON.stringify({ error: "Forbidden: cross-origin API requests are not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const host = request.headers.get("host");
  const fromLoopback = Boolean(host && LOOPBACK_HOSTS.has(hostWithoutPort(host)));
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
