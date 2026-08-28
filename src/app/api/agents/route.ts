import { createAgent, getWorkspaceSnapshot } from "@/lib/workspace";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const workspace = await getWorkspaceSnapshot();
    return Response.json(workspace.agents, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = await recordApiError("agents.list", 500, error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      provider?: string;
      baseUrl?: string;
      model?: string;
      role?: string;
      description?: string;
      skill?: string;
      systemPrompt?: string;
      apiKey?: string;
      locale?: "ru" | "en";
    };

    if (!body.name?.trim()) {
      await recordApiError("agents.create", 400, "name is required");
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    await createAgent(
      {
        name: body.name,
        provider: body.provider ?? "openrouter",
        baseUrl: body.baseUrl,
        model: body.model,
        role: body.role,
        description: body.description,
        skill: body.skill,
        systemPrompt: body.systemPrompt,
        color: (body as Record<string, unknown>).color as string | undefined,
        apiKey: body.apiKey,
      },
      body.locale,
    );

    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("agents.create", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
