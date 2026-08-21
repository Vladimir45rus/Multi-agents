import { extractJson } from "@/lib/json-extract";
import type { WorkspacePatchFile } from "@/lib/workspace-files";

export type PatchInstruction = {
  decision: string;
  patches: WorkspacePatchFile[];
};

export function normalizePatchInstruction(value: unknown): PatchInstruction {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const decision = typeof obj.decision === "string" ? obj.decision.trim() : "";
  const rawPatches = Array.isArray(obj.patches) ? obj.patches : [];

  const patches: WorkspacePatchFile[] = [];
  for (const item of rawPatches) {
    if (!item || typeof item !== "object") continue;
    const patch = item as Record<string, unknown>;
    const filePath = typeof patch.path === "string" ? patch.path.trim() : "";
    const operation = patch.operation;
    if (!filePath || (operation !== "create" && operation !== "modify" && operation !== "delete")) continue;
    const content = typeof patch.content === "string" ? patch.content : undefined;
    if (operation !== "delete" && content === undefined) continue;
    patches.push({ path: filePath, operation, content });
  }

  return { decision, patches };
}

export function parsePatchInstruction(raw: string): PatchInstruction {
  try {
    return normalizePatchInstruction(extractJson<unknown>(raw));
  } catch {
    return { decision: raw.trim(), patches: [] };
  }
}
