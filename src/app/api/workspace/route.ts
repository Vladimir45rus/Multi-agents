import { NextResponse } from "next/server";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { isLoopbackRequest, mobileAccessCookie, mobileAccessError } from "@/lib/mobile-auth";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const accessError = await mobileAccessError(request);
    if (accessError) return accessError;
    const metaOnly = new URL(request.url).searchParams.get("files") === "meta";
    const workspace = await getWorkspaceSnapshot({ includeFileContent: !metaOnly });
    if (!isLoopbackRequest(request)) {
      workspace.settings.mobileAuthToken = "";
    }
    const response = NextResponse.json(workspace, {
      headers: { "Cache-Control": "no-store" },
    });
    // Audit M2: hand the desktop an HttpOnly cookie instead of letting the
    // client write the token into a JS-readable one.
    if (isLoopbackRequest(request) && workspace.settings.mobileAuthToken) {
      response.headers.append("set-cookie", mobileAccessCookie(workspace.settings.mobileAuthToken));
    }
    return response;
  } catch (error) {
    const message = await recordApiError("workspace.snapshot", 500, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
