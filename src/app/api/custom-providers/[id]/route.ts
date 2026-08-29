import { deleteCustomProvider, updateCustomProvider } from "@/lib/custom-providers";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const { id } = await params;
    const providerId = Number(id);
    if (!Number.isFinite(providerId)) {
      await recordApiError("custom-providers.update", 400, "Invalid provider id");
      return Response.json({ error: "Invalid provider id" }, { status: 400 });
    }
    const body = (await request.json()) as { providerId?: string; name?: string; baseUrl?: string; apiKey?: string; models?: Array<{ id: string; name: string }> | string; headers?: Array<{ name: string; value: string }>; removeApiKey?: boolean };
    await updateCustomProvider(providerId, {
      name: body.name ?? "",
      providerId: body.providerId,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      models: body.models,
      headers: body.headers,
      removeApiKey: body.removeApiKey,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("custom-providers.update", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const { id } = await params;
    const providerId = Number(id);
    if (!Number.isFinite(providerId)) {
      await recordApiError("custom-providers.delete", 400, "Invalid provider id");
      return Response.json({ error: "Invalid provider id" }, { status: 400 });
    }
    await deleteCustomProvider(providerId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("custom-providers.delete", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
