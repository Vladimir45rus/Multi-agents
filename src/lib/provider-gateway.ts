import "server-only";

import { getProviderPreset } from "@/lib/providers";
import { extractJson } from "@/lib/json-extract";

export { extractJson };

export type GatewayRole = "system" | "user" | "assistant";

export type GatewayMessage = {
  role: GatewayRole;
  content: string;
};

export type ProviderRequest = {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
};

export type ProviderGatewayOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  tools?: Array<Record<string, unknown>>;
  fallbackModels?: string[];
  onFallback?: (model: string, error: ProviderGatewayError) => void | Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;
const MAX_KEY_LENGTH = 2_048;
const MAX_MODEL_LENGTH = 256;

export class ProviderGatewayError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: { provider: string; status?: number; retryable?: boolean }) {
    super(message);
    this.name = "ProviderGatewayError";
    this.provider = options.provider;
    this.status = options.status;
    this.retryable = Boolean(options.retryable);
  }
}

function compact(value: string | undefined) {
  return (value ?? "").trim();
}

function providerLabel(provider: string) {
  return getProviderPreset(provider).label || provider;
}

function connectionErrorMessage(provider: string) {
  return `Ошибка подключения к модели ${providerLabel(provider)}. Повторите попытку`;
}

export function validateApiKey(apiKey: string | undefined) {
  const value = compact(apiKey);
  if (!value) throw new Error("API key is required");
  if (value.length > MAX_KEY_LENGTH) throw new Error("API key is too long");
  if(/[\u0000-\u001f\u007f]/.test(value)) throw new Error("API key contains invalid control characters");
  return value;
}

function normalizeBaseUrl(provider: string, requestedBaseUrl?: string) {
  const preset = getProviderPreset(provider);
  const raw = compact(requestedBaseUrl) || preset.baseUrl;
  if (!raw) throw new Error(`Base URL is required for ${providerLabel(provider)}`);
  if (raw.startsWith("local://")) return raw;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid Base URL for ${providerLabel(provider)}`);
  }

  const localHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
    throw new Error("Provider Base URL must use HTTPS (HTTP is allowed only for localhost)");
  }

  return parsed.toString().replace(/\/+$/, "").replace(/\/chat\/completions$/, "").replace(/\/models$/, "");
}

function validateRequest(request: ProviderRequest) {
  const provider = compact(request.provider) || "custom";
  const model = compact(request.model);
  if (!model) throw new Error("Model is required");
  if (model.length > MAX_MODEL_LENGTH) throw new Error("Model name is too long");
  if (provider === "mock") throw new Error("Mock provider is disabled for real API requests");

  return {
    provider,
    model,
    apiKey: validateApiKey(request.apiKey),
    baseUrl: normalizeBaseUrl(provider, request.baseUrl),
  };
}

export function validateProviderBaseUrl(provider: string, requestedBaseUrl?: string) {
  return normalizeBaseUrl(provider, requestedBaseUrl);
}

function isAnthropic(provider: string) {
  return provider === "anthropic";
}

function isNativeGemini(provider: string, baseUrl: string) {
  return provider === "google" && !baseUrl.includes("/openai");
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(_response: Response, _attempt: number) {
  return RETRY_DELAY_MS;
}

function redact(value: string, apiKey: string) {
  const safe = value.replace(/\s+/g, " ").trim().slice(0, 700);
  return apiKey && safe.includes(apiKey) ? safe.replaceAll(apiKey, "[redacted]") : safe;
}

async function responseError(response: Response, provider: string, apiKey: string, attempt: number, maxRetries: number) {
  const body = await response.text().catch(() => "");
  const detail = redact(body, apiKey);
  const message = detail ? `${providerLabel(provider)} returned HTTP ${response.status}: ${detail}` : `${providerLabel(provider)} returned HTTP ${response.status}`;
  return new ProviderGatewayError(message, {
    provider,
    status: response.status,
    retryable: retryableStatus(response.status) && attempt < maxRetries,
  });
}

function abortError(provider: string) {
  return new ProviderGatewayError(connectionErrorMessage(provider), {
    provider,
    retryable: false,
  });
}

function buildOpenAiUrl(baseUrl: string) {
  return `${baseUrl}/chat/completions`;
}

function buildAnthropicUrl(baseUrl: string) {
  return `${baseUrl}/messages`;
}

function buildGeminiUrl(baseUrl: string, model: string) {
  return `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
}

function buildAnthropicBody(model: string, messages: GatewayMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));

  return {
    model,
    max_tokens: 8_192,
    stream: true,
    ...(system ? { system } : {}),
    messages: conversation,
  };
}

function buildGeminiBody(messages: GatewayMessage[], jsonMode = false) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    contents,
  };
}

function buildOpenAiBody(model: string, messages: GatewayMessage[], jsonMode = false, tools?: Array<Record<string, unknown>>) {
  return {
    model,
    messages,
    stream: true,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
  };
}

function headersFor(provider: string, apiKey: string): Record<string, string> {
  if (isAnthropic(provider)) {
    return {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  return {
    Accept: "text/event-stream",
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/Vladimir45rus/Multi-agents",
    "X-Title": "Multi-Agent Code Studio",
  };
}

async function fetchWithRetry(
  request: ReturnType<typeof validateRequest>,
  messages: GatewayMessage[],
  options: ProviderGatewayOptions,
  tools?: Array<Record<string, unknown>>,
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.max(0, Math.min(options.maxRetries ?? DEFAULT_MAX_RETRIES, 5));

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    let handedOff = false;
    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    };

    try {
      const nativeGemini = isNativeGemini(request.provider, request.baseUrl);
      const url = nativeGemini
        ? buildGeminiUrl(request.baseUrl, request.model)
        : isAnthropic(request.provider)
          ? buildAnthropicUrl(request.baseUrl)
          : buildOpenAiUrl(request.baseUrl);
      const body = nativeGemini
        ? buildGeminiBody(messages, options.jsonMode)
        : isAnthropic(request.provider)
          ? buildAnthropicBody(request.model, messages)
          : buildOpenAiBody(request.model, messages, options.jsonMode, tools);
      const headers = nativeGemini
        ? { Accept: "text/event-stream", "Content-Type": "application/json", "x-goog-api-key": request.apiKey }
        : headersFor(request.provider, request.apiKey);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.ok) {
        handedOff = true;
        return { response, cleanup };
      }

      const error = await responseError(response, request.provider, request.apiKey, attempt, maxRetries);
      if (!error.retryable || attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, attempt)));
    } catch (error) {
      if (options.signal?.aborted) throw abortError(request.provider);
      if (error instanceof ProviderGatewayError) {
        if (!error.retryable || attempt >= maxRetries) throw error;
      } else if (attempt >= maxRetries) {
        if (error instanceof DOMException && error.name === "AbortError") throw abortError(request.provider);
        throw new ProviderGatewayError(connectionErrorMessage(request.provider), {
          provider: request.provider,
          retryable: false,
        });
      }

      if (error instanceof DOMException && error.name === "AbortError" && attempt >= maxRetries) {
        throw abortError(request.provider);
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    } finally {
      if (!handedOff) cleanup();
    }
  }

  throw new ProviderGatewayError(connectionErrorMessage(request.provider), {
    provider: request.provider,
    retryable: false,
  });
}

function parseSseBlock(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  return data || null;
}

async function* readSse(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("Provider returned an empty stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      let separator = buffer.search(/\r?\n\r?\n/);
      while (separator >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator).replace(/^\r?\n\r?\n/, "");
        const data = parseSseBlock(block);
        if (data) yield data;
        separator = buffer.search(/\r?\n\r?\n/);
      }

      if (done) break;
    }

    const finalData = parseSseBlock(buffer);
    if (finalData) yield finalData;
  } finally {
    reader.releaseLock();
  }
}

function extractText(provider: string, raw: string) {
  if (raw === "[DONE]") return { done: true, text: "" };

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { done: false, text: raw };
  }

  if (!payload || typeof payload !== "object") return { done: false, text: "" };
  const value = payload as Record<string, unknown>;

  if (typeof value.error === "object" && value.error) {
    const errorMessage = (value.error as Record<string, unknown>).message;
    throw new ProviderGatewayError(typeof errorMessage === "string" ? errorMessage : "Provider returned an error", {
      provider,
      retryable: false,
    });
  }

  if (value.type === "message_stop") return { done: true, text: "" };
  if (value.type === "content_block_delta") {
    const delta = value.delta as Record<string, unknown> | undefined;
    return { done: false, text: typeof delta?.text === "string" ? delta.text : "" };
  }

  const choices = Array.isArray(value.choices) ? value.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const delta = firstChoice?.delta as Record<string, unknown> | undefined;

  // Tool call delta
  const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
  if (toolCalls.length > 0) {
    const tc = toolCalls[0] as Record<string, unknown>;
    const func = tc?.function as Record<string, unknown> | undefined;
    if (typeof func?.name === "string" && typeof func?.arguments === "string") {
      return { done: false, text: JSON.stringify({ function: { name: func.name, arguments: func.arguments } }) };
    }
    if (typeof func?.arguments === "string") {
      return { done: false, text: func.arguments };
    }
    return { done: false, text: JSON.stringify(tc) };
  }

  if (typeof delta?.content === "string") return { done: false, text: delta.content };

  // Check finish_reason for tool_calls
  if (firstChoice?.finish_reason === "tool_calls") return { done: true, text: "" };

  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
  const content = firstCandidate?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) => (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? (part as Record<string, unknown>).text : ""))
    .join("");

  return { done: false, text };
}

export async function* streamProviderResponse(
  request: ProviderRequest,
  messages: GatewayMessage[],
  options: ProviderGatewayOptions = {},
): AsyncGenerator<string> {
  const models = [request.model, ...(options.fallbackModels ?? [])].map(compact).filter((model, index, all) => model && all.indexOf(model) === index);
  let lastError: ProviderGatewayError | null = null;
  for (const model of models) {
    const candidate = { ...request, model };
    try {
      const normalized = validateRequest(candidate);
      const { response, cleanup } = await fetchWithRetry(normalized, messages, options, options.tools);
      try {
        for await (const raw of readSse(response)) {
          const parsed = extractText(normalized.provider, raw);
          if (parsed.text) yield parsed.text;
          if (parsed.done) return;
        }
        return;
      } finally {
        cleanup();
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (error instanceof ProviderGatewayError) {
        lastError = error;
        const canFallback = error.status === 403 || error.status === 408 || error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504 || error.retryable;
        if (canFallback && model !== models[models.length - 1]) {
          await options.onFallback?.(models[models.indexOf(model) + 1], error);
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError ?? new ProviderGatewayError("All fallback models failed", { provider: request.provider, retryable: false });
}

export async function completeProviderResponse(
  request: ProviderRequest,
  messages: GatewayMessage[],
  options: ProviderGatewayOptions = {},
) {
  let result = "";
  for await (const chunk of streamProviderResponse(request, messages, options)) result += chunk;
  return result;
}

export async function completeProviderJson<T>(
  request: ProviderRequest,
  messages: GatewayMessage[],
  options: ProviderGatewayOptions = {},
): Promise<T> {
  const text = await completeProviderResponse(request, messages, { ...options, jsonMode: true });
  return extractJson<T>(text);
}

export function providerRequestFromAgent(agent: { provider: string; baseUrl: string; model: string }, apiKey: string): ProviderRequest {
  return {
    provider: agent.provider,
    baseUrl: agent.baseUrl,
    model: agent.model,
    apiKey,
  };
}
