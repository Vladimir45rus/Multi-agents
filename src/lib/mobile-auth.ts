import "server-only";

import { randomBytes } from "node:crypto";
import { ensureWorkspaceBootstrap, getWorkspaceSettingsRow, updateWorkspaceSettings } from "@/lib/workspace";

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

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const prefix = `${name}=`;
  const value = cookies.find((cookie) => cookie.trim().startsWith(prefix))?.trim().slice(prefix.length);
  return value ? decodeURIComponent(value) : "";
}

export function getMobileAccessToken(request: Request) {
  const url = new URL(request.url);
  return request.headers.get("x-mobile-access-token")?.trim()
    || url.searchParams.get("token")?.trim()
    || cookieValue(request, "mobile_access_token");
}

export function isLoopbackRequest(request: Request) {
  const host = request.headers.get("host") ?? "";
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return LOOPBACK_HOSTS.has(hostWithoutPort(host)) || forwardedIp === "127.0.0.1" || forwardedIp === "::1";
}

export async function mobileAccessError(request: Request) {
  if (isLoopbackRequest(request)) return null;

  await ensureWorkspaceBootstrap();
  const settings = await getWorkspaceSettingsRow();
  const configuredToken = (settings.mobileAuthToken ?? "").trim();
  if (!configuredToken) return Response.json({ error: "Mobile access is not configured" }, { status: 503 });

  const suppliedToken = getMobileAccessToken(request);
  if (suppliedToken && suppliedToken === configuredToken) return null;

  return Response.json({ error: "Mobile access token is required" }, { status: 401 });
}

export async function ensureMobileAccessToken() {
  await ensureWorkspaceBootstrap();
  const settings = await getWorkspaceSettingsRow();
  const existing = (settings.mobileAuthToken ?? "").trim();
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  await updateWorkspaceSettings({ mobileAuthToken: token });
  return token;
}
