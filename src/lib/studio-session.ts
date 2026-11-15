import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { isLoopbackRequest, mobileAccessError } from "@/lib/mobile-auth";

// Audit M14: mutating routes used to trust `actorAgentId` coming from the
// client, so any local script (or a remote caller holding the mobile token)
// could write files "as the Lead". A per-process session secret is issued to
// the desktop UI over loopback and required for every write.
const sessionToken = randomBytes(32).toString("hex");

export function getStudioSessionToken() {
  return sessionToken;
}

export function hasStudioSession(request: Request) {
  const provided = (request.headers.get("x-studio-session") ?? "").trim();
  if (!provided) return false;
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(sessionToken, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Allows a write when it comes from the host machine or carries the studio
 * session (the tunnel makes even local requests look remote).
 */
export function studioWriteError(request: Request): Response | null {
  if (isLoopbackRequest(request) || hasStudioSession(request)) return null;
  return Response.json({ error: "Studio session required for this operation" }, { status: 403 });
}

/** Mobile token + studio session in one call for mutating routes. */
export async function writeAccessError(request: Request): Promise<Response | null> {
  const mobileError = await mobileAccessError(request);
  if (mobileError) return mobileError;
  return studioWriteError(request);
}
