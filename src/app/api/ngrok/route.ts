import { NextResponse } from "next/server";
import { getWorkspaceSettingsRow, updateWorkspaceSettings } from "@/lib/workspace";
import { recordSystemEvent } from "@/lib/system-events";
import { startTunnel } from "@/lib/ngrok-tunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let tunnel: { url: string; close: () => Promise<void> } | null = null;

async function getToken() {
  const s = await getWorkspaceSettingsRow();
  return (s as any).ngrokToken || "";
}

export async function POST(request: Request) {
  try {
    const { action, port } = (await request.json()) as { action: "start" | "stop"; port?: number };

    if (action === "start") {
      if (tunnel) return NextResponse.json({ ok: true, url: tunnel.url, message: "Already running" });
      const token = await getToken();
      if (!token) {
        const errMsg = "Ngrok token not configured. Get one at https://dashboard.ngrok.com/get-started/your-authtoken";
        await recordSystemEvent("error", "ngrok", errMsg, "");
        return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
      }

      tunnel = await startTunnel(token, port || 3210);
      if (tunnel.url) {
        await updateWorkspaceSettings({ ngrokUrl: tunnel.url } as any);
        await recordSystemEvent("success", "ngrok", `Tunnel started: ${tunnel.url}`, "");
      }
      return NextResponse.json({ ok: true, url: tunnel.url });
    }

    if (action === "stop") {
      if (tunnel) { await tunnel.close(); tunnel = null; }
      await updateWorkspaceSettings({ ngrokUrl: "" } as any);
      await recordSystemEvent("info", "ngrok", "Tunnel stopped by user", "");
      return NextResponse.json({ ok: true, message: "Tunnel stopped" });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Ngrok error";
    await recordSystemEvent("error", "ngrok", `Tunnel error: ${errMsg}`, "");
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ running: tunnel !== null, url: tunnel?.url ?? "" });
}