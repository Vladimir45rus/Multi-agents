import { NextResponse } from "next/server";
import { getWorkspaceSnapshot } from "@/lib/workspace";
import { isLoopbackRequest, mobileAccessError } from "@/lib/mobile-auth";

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace load failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
