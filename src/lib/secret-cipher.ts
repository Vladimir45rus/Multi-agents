import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// H2 fix: server-side at-rest encryption for API keys and GitHub tokens stored
// in SQLite. Uses AES-256-GCM with a locally generated key persisted under the
// user profile (outside the repository), so plaintext secrets never sit in the
// database file. Values encrypted by the Electron SafeStorage vault ("enc:v1:")
// keep flowing through the existing IPC bridge and are never re-wrapped here.

const MARKER = "enc:s2:";
let cachedKey: Buffer | null = null;

function keyFilePath() {
  return path.join(os.homedir(), ".multi-agent-studio", "secret.key");
}

function loadOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;
  const file = keyFilePath();
  try {
    const hex = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      cachedKey = Buffer.from(hex, "hex");
      return cachedKey;
    }
  } catch {
    // Missing or unreadable key file: fall through and create a fresh one.
  }
  const key = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${key.toString("hex")}\n`, { encoding: "utf8", mode: 0o600 });
  cachedKey = key;
  return cachedKey;
}

/** True for any value already carrying an encryption marker (local or Electron vault). */
export function hasSecretMarker(value: string) {
  return value.startsWith("enc:");
}

export function isLocalCipherSecret(value: string) {
  return value.startsWith(MARKER);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext || hasSecretMarker(plaintext)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadOrCreateKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${MARKER}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptLocalSecret(stored: string): string {
  const body = stored.slice(MARKER.length);
  const [ivPart, tagPart, dataPart] = body.split(":");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", loadOrCreateKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString("utf8");
}
