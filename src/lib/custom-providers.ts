import "server-only";

import { asc, eq } from "drizzle-orm";

import { db, runMigrations } from "@/db";
import { customProviders } from "@/db/schema";
import { encryptSecret } from "@/lib/secret-cipher";
import { decryptSecret } from "@/lib/secret-vault";
import { recordSystemEvent } from "@/lib/system-events";

export type CustomProviderInput = {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[] | string;
  removeApiKey?: boolean;
};

function compact(value: string | null | undefined) {
  return (value ?? "").trim();
}

// Accept "a, b\nc" or ["a","b"] and normalize to a clean unique list.
function parseModels(value: CustomProviderInput["models"]): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  const list = raw
    .split(/[\n,;]/)
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set(list)].slice(0, 64);
}

// The gateway enforces the same rule at request time; validating here gives
// the user a friendly error in the constructor form instead.
function validateCustomBaseUrl(value: string) {
  const raw = compact(value).replace(/\/+$/, "");
  if (!raw) throw new Error("Base URL is required");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Base URL must be a valid absolute URL, for example https://api.example.com/v1");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Base URL must use HTTPS (HTTP is allowed only for localhost)");
  }
  return raw;
}

export async function listCustomProviders() {
  await runMigrations();
  return db.select().from(customProviders).orderBy(asc(customProviders.id));
}

export async function createCustomProvider(input: CustomProviderInput) {
  await runMigrations();
  const name = compact(input.name);
  if (!name) throw new Error("Provider name is required");
  if (name.length > 80) throw new Error("Provider name is too long");
  const baseUrl = validateCustomBaseUrl(input.baseUrl ?? "");
  const [created] = await db
    .insert(customProviders)
    .values({
      name,
      baseUrl,
      apiKey: compact(input.apiKey) ? encryptSecret(compact(input.apiKey)) : "",
      models: parseModels(input.models),
    })
    .returning({ id: customProviders.id });
  await recordSystemEvent("success", "custom-providers", `Custom provider added: ${name} (${baseUrl})`);
  return created;
}

export async function updateCustomProvider(id: number, input: CustomProviderInput) {
  await runMigrations();
  const [existing] = await db.select().from(customProviders).where(eq(customProviders.id, id)).limit(1);
  if (!existing) throw new Error("Custom provider not found");

  const name = compact(input.name) || existing.name;
  const baseUrl = input.baseUrl === undefined ? existing.baseUrl : validateCustomBaseUrl(input.baseUrl);
  const apiKey = input.removeApiKey
    ? ""
    : compact(input.apiKey)
      ? encryptSecret(compact(input.apiKey))
      : existing.apiKey;
  const models = input.models === undefined ? existing.models : parseModels(input.models);

  await db
    .update(customProviders)
    .set({ name, baseUrl, apiKey, models })
    .where(eq(customProviders.id, id));
  await recordSystemEvent("info", "custom-providers", `Custom provider updated: ${name}`);
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
  const id = Number(providerRef);
  if (!Number.isInteger(id) || id <= 0) return "";
  await runMigrations();
  const [row] = await db.select({ apiKey: customProviders.apiKey }).from(customProviders).where(eq(customProviders.id, id)).limit(1);
  const stored = compact(row?.apiKey);
  return stored ? decryptSecret(stored) : "";
}
