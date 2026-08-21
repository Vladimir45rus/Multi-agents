import { NextResponse } from "next/server";
import { fetchProviderModels } from "@/lib/provider-models";
import { getStoredProviderApiKey } from "@/lib/workspace";
import { validateApiKey } from "@/lib/provider-gateway";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      force?: boolean;
    };
    const provider = (body.provider || "custom").trim().toLowerCase();
    const requestedApiKey = body.apiKey?.trim();
    const apiKey = requestedApiKey ? validateApiKey(requestedApiKey) : await getStoredProviderApiKey(provider);
    const result = await fetchProviderModels(provider, apiKey || undefined, body.baseUrl, Boolean(body.force));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Model request failed" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "provider is required" }, { status: 400 });
}
