import { NextResponse } from "next/server";
import { getWorkspaceSettingsRow } from "@/lib/workspace";
import { getMobileAccessToken, mobileAccessError } from "@/lib/mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLocalPreviewUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function proxy(request: Request, pathParts: string[] = []) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  const settings = await getWorkspaceSettingsRow();
  const base = settings.previewUrl ?? "";
  if (!isLocalPreviewUrl(base)) return NextResponse.json({ error: "Preview is not running" }, { status: 404 });

  const target = new URL(base);
  const suffix = pathParts.map((part) => encodeURIComponent(part)).join("/");
  if (suffix) target.pathname = `${target.pathname.replace(/\/$/, "")}/${suffix}`;
  const requestUrl = new URL(request.url);
  requestUrl.searchParams.delete("token");
  target.search = requestUrl.search;

  const response = await fetch(target, { method: request.method, cache: "no-store", redirect: "manual" });
  const headers = new Headers();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType) headers.set("content-type", contentType);
  const cacheControl = response.headers.get("cache-control");
  if (cacheControl) headers.set("cache-control", cacheControl);

  if (contentType.includes("text/html")) {
    const html = await response.text();
    const proxyPrefix = "/api/preview/proxy/";
    const rewritten = html
      .replace(/(src|href|action)=(["'])\/(?!\/)/g, `$1=$2${proxyPrefix}`)
      .replace(/url\(\s*\/(?!\/)/g, `url(${proxyPrefix}`);
    // Visual builder: every proxied page gets the element inspector, which
    // listens for postMessage from the IDE (see /api/preview/inspect.js).
    const inspector = '<script src="/api/preview/inspect.js" data-multi-agent-visual="1"></script>';
    const withInspector = /<\/body>/i.test(rewritten)
      ? rewritten.replace(/<\/body>/i, `${inspector}</body>`)
      : `${rewritten}${inspector}`;
    const mobileToken = getMobileAccessToken(request);
    if (mobileToken) headers.append("set-cookie", `mobile_access_token=${encodeURIComponent(mobileToken)}; Path=/; HttpOnly; SameSite=Lax`);
    return new NextResponse(withInspector, { status: response.status, headers });
  }

  const mobileToken = getMobileAccessToken(request);
  if (mobileToken) headers.append("set-cookie", `mobile_access_token=${encodeURIComponent(mobileToken)}; Path=/; HttpOnly; SameSite=Lax`);
  return new NextResponse(response.body, { status: response.status, headers });
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const params = await context.params;
    return await proxy(request, params.path ?? []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview proxy failed" }, { status: 502 });
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return GET(request, context);
}
