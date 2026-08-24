import { NextResponse } from "next/server";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { isLoopbackRequest, mobileAccessError } from "@/lib/mobile-auth";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const accessError = await mobileAccessError(request);
    if (accessError) return accessError;
    const workspace = await getWorkspaceSnapshot();
    if (!isLoopbackRequest(request)) {
      workspace.settings.mobileAuthToken = "";
    }
    return NextResponse.json(workspace, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = await recordApiError("workspace.snapshot", 500, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
