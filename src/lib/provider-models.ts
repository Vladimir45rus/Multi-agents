import "server-only";

import { getProviderPreset } from "@/lib/providers";
import { validateProviderBaseUrl } from "@/lib/provider-gateway";

export type ProviderModelResult = {
  provider: string;
  baseUrl: string;
  models: string[];
  fetchedAt: string;
  source: "provider" | "fallback";
  error?: string;
};

type ProviderPayload = { data?: Array<{ id?: string; name?: string }>; models?: Array<{ name?: string; displayName?: string } | string> };

const TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const cache = new Map<string, ProviderModelResult>();

function authHeaders(provider: string, apiKey?: string, nativeGemini = false) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey && nativeGemini) headers["x-goog-api-key"] = apiKey;
  else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (provider === "anthropic" && apiKey) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    delete headers.Authorization;
  }
  return headers;
}

function extractModels(payload: ProviderPayload) {
  const values = [
    ...(payload.data ?? []).map((item) => item.id || item.name || ""),
    ...(payload.models ?? []).map((item) => typeof item === "string" ? item : item.name || item.displayName || ""),
  ];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function endpointFor(provider: string, baseUrl: string) {
  if (provider === "anthropic") return `${baseUrl}/models`;
  if (provider === "google") return `${baseUrl}/models`;
  return `${baseUrl}/models`;
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchModelsWithRetry(url: string, headers: Record<string, string>) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
      if (response.ok) return response;
      if (!retryableStatus(response.status) || attempt >= MAX_RETRIES) return response;

      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 8000) : Math.min(500 * 2 ** attempt, 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 8000)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Provider model request failed");
}

export async function fetchProviderModels(provider: string, apiKey?: string, requestedBaseUrl?: string, force = false): Promise<ProviderModelResult> {
  const preset = getProviderPreset(provider);
  const baseUrl = validateProviderBaseUrl(provider, requestedBaseUrl);
  const cacheKey = `${provider}:${baseUrl}:${apiKey ? "key" : "public"}`;
  const previous = cache.get(cacheKey);
  if (!force && previous && Date.now() - new Date(previous.fetchedAt).getTime() < TTL_MS) return previous;

  if (provider === "mock" || baseUrl.startsWith("local://")) {
    const result = { provider, baseUrl, models: preset.fallbackModels, fetchedAt: new Date().toISOString(), source: "fallback" as const };
    cache.set(cacheKey, result);
    return result;
  }

  try {
    const response = await fetchModelsWithRetry(endpointFor(provider, baseUrl), authHeaders(provider, apiKey, provider === "google" && !baseUrl.includes("/openai")));
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    const models = extractModels((await response.json()) as ProviderPayload);
    if (!models.length) throw new Error("Provider returned no models");
    const result = { provider, baseUrl, models, fetchedAt: new Date().toISOString(), source: "provider" as const };
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    const result = {
      provider,
      baseUrl,
      models: previous?.models?.length ? previous.models : preset.fallbackModels,
      fetchedAt: previous?.fetchedAt || new Date().toISOString(),
      source: "fallback" as const,
      error: error instanceof Error ? error.message : "Provider model request failed",
    };
    cache.set(cacheKey, result);
    return result;
  }
}

export function clearProviderModelCache() {
  cache.clear();
}

export function providerCacheTtlMs() {
  return TTL_MS;
}
