import { createCustomProvider, listCustomProviders } from "@/lib/custom-providers";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mask(rows: Array<{ id: number; name: string; baseUrl: string; apiKey: string; models: string[] }>) {
  return rows.map(({ apiKey, ...row }) => ({ ...row, apiKeyConfigured: Boolean(apiKey.trim()) }));
}

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    return Response.json({ providers: mask(await listCustomProviders()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = await recordApiError("custom-providers.list", 500, error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as { name?: string; baseUrl?: string; apiKey?: string; models?: string[] | string };
    await createCustomProvider({
      name: body.name ?? "",
      baseUrl: body.baseUrl ?? "",
      apiKey: body.apiKey,
      models: body.models,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("custom-providers.create", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
