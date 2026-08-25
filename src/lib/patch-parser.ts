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

// B3 fix: detect model responses whose JSON was cut off mid-object (aborted
// stream, gateway timeout or max_tokens truncation). Such responses must not
// be silently treated as "zero patches" / a completed decision.
export function looksLikeTruncatedJson(raw: string): boolean {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.search(/[{[]/);
  if (start < 0) return false;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return depth > 0 || inString;
}
