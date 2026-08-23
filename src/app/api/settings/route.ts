import { NextResponse } from "next/server";
import { getWorkspaceSnapshot, updateWorkspaceSettings } from "@/lib/workspace";

async function handleUpdate(request: Request) {
  const body = (await request.json()) as {
    apiKeys?: Record<string, string>;
    githubToken?: string;
    githubRepo?: string;
    githubAutoPush?: boolean;
    autoApprove?: boolean;
    mobileAuthToken?: string;
    localtunnelEnabled?: boolean;
    localtunnelUrl?: string;
    telegramToken?: string;
    telegramChatId?: string;
    fallbackModels?: string[];
    previewCommand?: string;
    previewPort?: number;
    previewUrl?: string;
    projectTemplate?: string;
    projectTemplatePrompt?: string;
    removeApiKeys?: string[];
  };
  await updateWorkspaceSettings(body);
  if (body.telegramToken || body.telegramChatId) {
    void import("@/lib/telegram").then(({ ensureTelegramPolling }) => ensureTelegramPolling()).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  try { return await handleUpdate(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Settings update failed" }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try { return await handleUpdate(request); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Settings update failed" }, { status: 400 }); }
}

export async function GET() {
  try {
    const workspace = await getWorkspaceSnapshot();
    return NextResponse.json(workspace.settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Settings load failed" }, { status: 500 });
  }
}
