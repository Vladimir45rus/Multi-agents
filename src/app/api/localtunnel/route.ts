import { NextResponse } from "next/server";
import { getWorkspaceSettingsRow, updateWorkspaceSettings } from "@/lib/workspace";
import { ensureMobileAccessToken } from "@/lib/mobile-auth";
import { recordSystemEvent } from "@/lib/system-events";
import { startLocalTunnel, type LocalTunnelHandle } from "@/lib/localtunnel";
import { setTunnelActive } from "@/lib/tunnel-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PORT = 3000;

function applicationPort() {
  const configured = Number(process.env.ELECTRON_SERVER_PORT || process.env.PORT || DEFAULT_PORT);
  return Number.isInteger(configured) && configured > 0 && configured <= 65535 ? configured : DEFAULT_PORT;
}
let tunnel: LocalTunnelHandle | null = null;
let starting: Promise<LocalTunnelHandle> | null = null;

async function start() {
  if (tunnel) return tunnel;
  if (starting) return starting;

  const port = applicationPort();
  starting = startLocalTunnel(port)
    .then(async (handle) => {
      tunnel = handle;
      setTunnelActive(true);
      await updateWorkspaceSettings({ localtunnelUrl: handle.url });
      await recordSystemEvent("success", "localtunnel", `Tunnel started: ${handle.url}`);
      return handle;
    })
    .finally(() => {
      starting = null;
    });

  return starting;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: "start" | "stop" };

    if (body.action === "stop") {
      if (tunnel) {
        await tunnel.close();
        tunnel = null;
      }
      setTunnelActive(false);
      await updateWorkspaceSettings({ localtunnelEnabled: false, localtunnelUrl: "" });
      await recordSystemEvent("info", "localtunnel", "Tunnel stopped by user");
      return NextResponse.json({ ok: true, running: false, url: "" });
    }

    await ensureMobileAccessToken();
    const handle = await start();
    await updateWorkspaceSettings({ localtunnelEnabled: true, localtunnelUrl: handle.url });
    return NextResponse.json({ ok: true, running: true, url: handle.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Localtunnel error";
    await recordSystemEvent("error", "localtunnel", `Tunnel error: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  const settings = await getWorkspaceSettingsRow();
  return NextResponse.json({
    running: tunnel !== null,
    enabled: Boolean(settings.localtunnelEnabled),
    url: tunnel?.url ?? settings.localtunnelUrl ?? "",
  });
}
