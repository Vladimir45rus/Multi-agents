import { updateAgentProfile } from "@/lib/workspace";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const agentId = Number(id);

    if (!Number.isFinite(agentId)) {
      await recordApiError("agents.update", 400, "Invalid agent id");
      return Response.json({ error: "Invalid agent id" }, { status: 400 });
    }

    const body = (await request.json()) as {
      provider?: string;
      baseUrl?: string;
      model?: string;
      skill?: string;
      systemPrompt?: string;
      description?: string;
      role?: string;
      color?: string;
      locale?: "ru" | "en";
    };

    await updateAgentProfile(
      agentId,
      {
        provider: body.provider,
        baseUrl: body.baseUrl,
        model: body.model,
        skill: body.skill ?? "",
        systemPrompt: body.systemPrompt ?? "",
        description: body.description,
        role: body.role,
        color: body.color,
      },
      body.locale,
    );

    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("agents.update", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
