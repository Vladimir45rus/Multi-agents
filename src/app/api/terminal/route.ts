import { runSandboxCommand } from "@/lib/terminal-sandbox";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { command?: string; locale?: "ru" | "en"; timeoutMs?: number; actorAgentId?: number };
    if (!body.command?.trim()) {
      return Response.json({ error: "command is required" }, { status: 400 });
    }

    const result = await runSandboxCommand(body.command, body.locale, { timeoutMs: body.timeoutMs, actorAgentId: body.actorAgentId });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terminal command failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
