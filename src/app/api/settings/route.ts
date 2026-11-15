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
    teamMode?: boolean;
    decisionMode?: string;
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
    removeGithubToken?: boolean;
    removeTelegramToken?: boolean;
  };
  // Audit M15: rotating the remote-access token must stay a local decision —
  // otherwise anyone holding the current token could lock the owner out.
  if (body.mobileAuthToken !== undefined && !isLoopbackRequest(request)) {
    return NextResponse.json({ error: "The mobile access token can only be changed from the host machine" }, { status: 403 });
  }
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
