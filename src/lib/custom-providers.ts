import "server-only";

import { asc, eq } from "drizzle-orm";

import { db, runMigrations } from "@/db";
import { customProviders } from "@/db/schema";
import { encryptSecret } from "@/lib/secret-cipher";
import { decryptSecret } from "@/lib/secret-vault";
import { recordSystemEvent } from "@/lib/system-events";

export type CustomProviderModel = { id: string; name: string };
export type CustomProviderHeader = { name: string; value: string };

export type CustomProviderInput = {
  name: string;
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: Array<CustomProviderModel | string> | string;
  headers?: Array<CustomProviderHeader>;
  removeApiKey?: boolean;
};

function compact(value: string | null | undefined) {
  return (value ?? "").trim();
}

function slugify(value: string) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Legacy rows stored models as plain strings; normalize both shapes here so
// the rest of the app can rely on {id, name} pairs.
function normalizeModels(value: unknown): CustomProviderModel[] {
  const list = Array.isArray(value) ? value : [];
  const models: CustomProviderModel[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      const id = entry.trim();
      if (id) models.push({ id, name: id });
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const id = compact(typeof record.id === "string" ? record.id : "");
      if (!id) continue;
      models.push({ id, name: compact(typeof record.name === "string" ? record.name : "") || id });
    }
  }
  const unique = new Map<string, CustomProviderModel>();
  for (const model of models) unique.set(model.id, model);
  return [...unique.values()].slice(0, 64);
}

function parseModelsInput(value: CustomProviderInput["models"]): CustomProviderModel[] {
  if (typeof value === "string") {
    return normalizeModels(value.split(/[\n,;]/).map((id) => id.trim()).filter(Boolean));
  }
  return normalizeModels(value ?? []);
}

function normalizeHeaders(value: unknown): CustomProviderHeader[] {
  const list = Array.isArray(value) ? value : [];
  const headers: CustomProviderHeader[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name = compact(typeof record.name === "string" ? record.name : "");
    const headerValue = typeof record.value === "string" ? record.value : "";
    if (!name) continue;
    headers.push({ name, value: headerValue });
  }
  return headers.slice(0, 24);
}

// The gateway enforces the same rule at request time; validating here gives
// the user a friendly error in the constructor form instead.
function validateCustomBaseUrl(value: string | undefined) {
  const raw = compact(value).replace(/\/+$/, "");
  if (!raw) throw new Error("Base URL is required");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Base URL must be a valid absolute URL, for example https://api.myprovider.com/v1");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Base URL must use HTTPS (HTTP is allowed only for localhost)");
  }
  return raw;
}

function rowProviderId(row: { id: number; providerId: string; name: string }) {
  return compact(row.providerId) || slugify(row.name) || `provider-${row.id}`;
}

function serializeRow(row: typeof customProviders.$inferSelect) {
  return {
    id: row.id,
    providerId: rowProviderId(row),
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    models: normalizeModels(row.models),
    headers: normalizeHeaders(row.headers),
  };
}

export async function listCustomProviders() {
  await runMigrations();
  const rows = await db.select().from(customProviders).orderBy(asc(customProviders.id));
  return rows.map(serializeRow);
}

async function ensureUniqueProviderId(candidate: string, selfId?: number) {
  const rows = await db.select({ id: customProviders.id, providerId: customProviders.providerId, name: customProviders.name }).from(customProviders);
  const taken = new Set(
    rows
      .filter((row) => row.id !== selfId)
      .map((row) => rowProviderId(row)),
  );
  if (!taken.has(candidate)) return candidate;
  for (let suffix = 2; ; suffix += 1) {
    const next = `${candidate}-${suffix}`;
    if (!taken.has(next)) return next;
  }
}

export async function createCustomProvider(input: CustomProviderInput) {
  await runMigrations();
  const name = compact(input.name);
  if (!name) throw new Error("Display name is required");
  if (name.length > 80) throw new Error("Display name is too long");
  const baseUrl = validateCustomBaseUrl(input.baseUrl);
  const requestedProviderId = slugify(input.providerId ?? "") || slugify(name);
  if (!requestedProviderId) throw new Error("Provider ID is required (lowercase letters, digits, hyphens or underscores)");
  const providerId = await ensureUniqueProviderId(requestedProviderId);
  const [created] = await db
    .insert(customProviders)
    .values({
      providerId,
      name,
      baseUrl,
      apiKey: compact(input.apiKey) ? encryptSecret(compact(input.apiKey)) : "",
      models: parseModelsInput(input.models),
      headers: normalizeHeaders(input.headers),
    })
    .returning({ id: customProviders.id });
  await recordSystemEvent("success", "custom-providers", `Custom provider added: ${name} (${providerId})`);
  return created;
}

export async function updateCustomProvider(id: number, input: CustomProviderInput) {
  await runMigrations();
  const [existing] = await db.select().from(customProviders).where(eq(customProviders.id, id)).limit(1);
  if (!existing) throw new Error("Custom provider not found");

  const name = compact(input.name) || existing.name;
  const baseUrl = input.baseUrl === undefined ? existing.baseUrl : validateCustomBaseUrl(input.baseUrl);
  const requestedProviderId = slugify(input.providerId ?? "") || slugify(name) || rowProviderId(existing);
  const providerId = await ensureUniqueProviderId(requestedProviderId, id);
  const apiKey = input.removeApiKey
    ? ""
    : compact(input.apiKey)
      ? encryptSecret(compact(input.apiKey))
      : existing.apiKey;
  const models = input.models === undefined ? normalizeModels(existing.models) : parseModelsInput(input.models);
  const headers = input.headers === undefined ? normalizeHeaders(existing.headers) : normalizeHeaders(input.headers);

  await db
    .update(customProviders)
    .set({ providerId, name, baseUrl, apiKey, models, headers })
    .where(eq(customProviders.id, id));
  await recordSystemEvent("info", "custom-providers", `Custom provider updated: ${name} (${providerId})`);
}

export async function deleteCustomProvider(id: number) {
  await runMigrations();
  const [existing] = await db.select().from(customProviders).where(eq(customProviders.id, id)).limit(1);
  await db.delete(customProviders).where(eq(customProviders.id, id));
  if (existing) {
    await recordSystemEvent("warning", "custom-providers", `Custom provider deleted: ${existing.name}`);
  }
}

// Routing helper: agents assigned to "custom:<id>" take the key from the
// registry (unless the agent carries its own key).
export async function getCustomProviderKey(providerRef: string) {
  const row = await getCustomProviderRow(providerRef);
  const stored = compact(row?.apiKey);
  return stored ? decryptSecret(stored) : "";
}

async function getCustomProviderRow(providerRef: string) {
  const id = Number(providerRef);
  if (!Number.isInteger(id) || id <= 0) return null;
  await runMigrations();
  const [row] = await db.select().from(customProviders).where(eq(customProviders.id, id)).limit(1);
  return row ?? null;
}

export type CustomAgentRequestMeta = {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  fallbackModels: string[];
};

/**
 * Resolve everything needed to call a model of a custom registry provider:
 * base URL (registry wins over the agent snapshot), the decrypted API key,
 * user-defined headers and the sibling models for fallback.
 */
export async function resolveCustomAgentRequest(agent: { provider: string; baseUrl: string }): Promise<CustomAgentRequestMeta | null> {
  if (!agent.provider.startsWith("custom:")) return null;
  const row = await getCustomProviderRow(agent.provider.slice("custom:".length));
  if (!row) return null;
  const serialized = serializeRow(row);
  const stored = compact(row.apiKey);
  const apiKey = stored ? await decryptSecret(stored) : "";
  const headers: Record<string, string> = {};
  for (const header of serialized.headers) headers[header.name] = header.value;
  return {
    providerId: serialized.providerId,
    baseUrl: compact(serialized.baseUrl) || compact(agent.baseUrl),
    apiKey,
    headers,
    fallbackModels: serialized.models.map((model) => model.id),
  };
}
