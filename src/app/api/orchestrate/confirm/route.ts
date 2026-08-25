import { resolveConfirmation } from "@/lib/orchestrator";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { confirmationId?: string; approved?: boolean };
    const confirmationId = typeof body.confirmationId === "string" ? body.confirmationId.trim() : "";
    if (!confirmationId) {
      await recordApiError("orchestrate.confirm", 400, "confirmationId is required");
      return Response.json({ error: "confirmationId is required" }, { status: 400 });
    }

    const resolved = resolveConfirmation(confirmationId, Boolean(body.approved));
    return Response.json({ ok: true, resolved });
  } catch (error) {
    const message = await recordApiError("orchestrate.confirm", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
