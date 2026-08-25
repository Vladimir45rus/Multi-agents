import { clearChatHistory, ensureWorkspaceBootstrap } from "@/lib/workspace";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    await ensureWorkspaceBootstrap();
    const channel = new URL(request.url).searchParams.get("channel");
    if (channel !== null && channel !== "lead" && channel !== "group") {
      return Response.json({ error: "Invalid chat channel" }, { status: 400 });
    }
    await clearChatHistory(channel === "lead" || channel === "group" ? channel : undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Chat history clear failed" }, { status: 400 });
  }
}
