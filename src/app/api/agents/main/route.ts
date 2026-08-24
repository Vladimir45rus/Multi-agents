import { assignMainCoder } from "@/lib/workspace";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { agentId?: number; locale?: "ru" | "en" };
    if (!body.agentId) {
      await recordApiError("agents.assign-main", 400, "agentId is required");
      return Response.json({ error: "agentId is required" }, { status: 400 });
    }

    await assignMainCoder(body.agentId, body.locale);
    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("agents.assign-main", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
