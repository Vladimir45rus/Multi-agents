import "server-only";

import { randomUUID } from "node:crypto";
import { decryptLocalSecret, isLocalCipherSecret } from "@/lib/secret-cipher";

// Stored secrets that were encrypted by Electron's safeStorage are prefixed with this marker.
const ENC_PREFIX = "enc:v1:";
const DECRYPT_TIMEOUT_MS = 15_000;

type VaultMessage = {
  type?: string;
  id?: string;
  data?: string;
  plaintext?: string;
  error?: string;
};

export function isEncryptedSecret(value: string) {
  return value.startsWith(ENC_PREFIX);
}

/**
 * True when this Next.js server is running as a child of the Electron main process
 * (embedded production server) with a SafeStorage decrypt IPC channel available.
 */
export function hasElectronVault() {
  return process.env.ELECTRON_VAULT === "1" && typeof process.send === "function";
}

function decryptViaIpc(encryptedBase64: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const id = randomUUID();

    const timeout = setTimeout(() => {
      process.off("message", onMessage);
      reject(new Error("Secret decryption timed out"));
    }, DECRYPT_TIMEOUT_MS);

    const onMessage = (message: unknown) => {
      const msg = message as VaultMessage;
      if (!msg || msg.type !== "vault:decrypt:reply" || msg.id !== id) return;
      clearTimeout(timeout);
      process.off("message", onMessage);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.plaintext ?? "");
    };

    process.on("message", onMessage);
    process.send?.({ type: "vault:decrypt", id, data: encryptedBase64 });
  });
}

/**
 * Returns the plaintext of a stored secret. Values are dispatched by marker:
 * `enc:s2:` — local AES-GCM at-rest encryption; `enc:v1:` — Electron SafeStorage
 * via IPC bridge; anything else is legacy plaintext returned unchanged.
 */
export async function decryptSecret(stored: string): Promise<string> {
  // H2 fix: locally encrypted values are decrypted without the Electron vault.
  if (isLocalCipherSecret(stored)) return decryptLocalSecret(stored);
  if (!isEncryptedSecret(stored)) return stored;

  const encoded = stored.slice(ENC_PREFIX.length);
  if (!hasElectronVault()) {
    throw new Error("Encrypted API key found, but the Electron SafeStorage vault is unavailable.");
  }

  return decryptViaIpc(encoded);
}
