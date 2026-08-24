import { NextResponse } from "next/server";
import { getWorkspaceSnapshot, updateWorkspaceSettings } from "@/lib/workspace";
import { clearProviderModelCache } from "@/lib/provider-models";
import { isLoopbackRequest, mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

async function handleUpdate(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
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

export async function DELETE(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  clearProviderModelCache();
  return NextResponse.json({ ok: true, cleared: "temporary-agent-cache" });
}

export async function GET(request: Request) {
  try {
    const accessError = await mobileAccessError(request);
    if (accessError) return accessError;
    const workspace = await getWorkspaceSnapshot();
    if (!isLoopbackRequest(request)) workspace.settings.mobileAuthToken = "";
    return NextResponse.json(workspace.settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Settings load failed" }, { status: 500 });
  }
}
