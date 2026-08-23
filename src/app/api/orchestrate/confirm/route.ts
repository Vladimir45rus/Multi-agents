import { resolveConfirmation } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { confirmationId?: string; approved?: boolean };
    const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId.trim() : "";
    if (!confirmationId) return Response.json({ error: "confirmationId is required" }, { status: 400 });

    const resolved = resolveConfirmation(confirmationId, Boolean(body.approved));
    return Response.json({ ok: true, resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
