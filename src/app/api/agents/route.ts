import { createAgent, getWorkspaceSnapshot } from "@/lib/workspace";

export async function GET() {
  try {
    const workspace = await getWorkspaceSnapshot();
    return Response.json(workspace.agents, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agents load failed";
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
      locale?: "ru" | "en";
    };

    if (!body.name?.trim()) {
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
      },
      body.locale,
    );

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent creation failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
