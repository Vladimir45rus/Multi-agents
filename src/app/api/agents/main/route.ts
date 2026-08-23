import { assignMainCoder } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { agentId?: number; locale?: "ru" | "en" };
    if (!body.agentId) {
      return Response.json({ error: "agentId is required" }, { status: 400 });
    }

    await assignMainCoder(body.agentId, body.locale);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
