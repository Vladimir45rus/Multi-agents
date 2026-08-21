import { NextResponse } from "next/server";
import { getWorkspaceSnapshot, updateWorkspaceSettings } from "@/lib/workspace";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      apiKeys?: Record<string, string>;
      githubToken?: string;
      githubRepo?: string;
      githubAutoPush?: boolean;
      removeApiKeys?: string[];
    };
    await updateWorkspaceSettings(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Settings update failed" }, { status: 400 });
  }
}

export async function GET() {
  try {
    const workspace = await getWorkspaceSnapshot();
    return NextResponse.json(workspace.settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Settings load failed" }, { status: 500 });
  }
}
