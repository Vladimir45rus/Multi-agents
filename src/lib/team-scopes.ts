// Team mode: each advisor owns a slice of the project, writes only inside it,
// and gets the fix request when a check fails in that slice.

export type TeamPatch = {
  path: string;
  operation: "create" | "modify" | "delete";
  content?: string;
};

export type ScopeAgent = { name: string; role: string };

type ScopeRule = { prefixes: string[]; suffixes?: string[] };

// Order matters only for documentation: pickOwner() picks the most specific
// prefix, so `src/app/page.tsx` belongs to UI/UX while `src/app/api/x/route.ts`
// belongs to the architect.
export const SCOPE_RULES: Record<string, ScopeRule> = {
  architect: { prefixes: ["src/app/api/", "src/lib/", "lib/", "server/", "core/", "src/db/"] },
  uiux: {
    prefixes: ["src/components/", "src/app/", "app/", "pages/", "components/", "public/", "styles/"],
    suffixes: [".css", ".scss", ".svg"],
  },
  tester: {
    prefixes: ["tests/", "test/", "__tests__/"],
    suffixes: [".test.ts", ".test.tsx", ".test.js", ".spec.ts", ".spec.tsx", ".spec.js"],
  },
  security: { prefixes: ["src/proxy", "middleware", "src/lib/auth", "src/lib/security", "src/middleware"] },
  // The skeptic never writes: it reviews every zone and challenges the others.
  skeptic: { prefixes: ["src/", "app/", "lib/", "server/"] },
  reviewer: { prefixes: ["src/", "app/", "lib/"] },
};

const UUIDISH = /^[A-Za-z0-9_./-]+$/;

export function normalizeProjectPath(filePath: string) {
  return String(filePath ?? "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
}

export function isPathInScope(role: string, filePath: string): boolean {
  const cleaned = normalizeProjectPath(filePath);
  if (!cleaned || !UUIDISH.test(cleaned)) return false;
  if (role === "main" || role === "orchestrator") return true;
  if (cleaned.includes("..")) return false;

  const rule = SCOPE_RULES[role];
  if (!rule) return false;
  if (rule.suffixes?.some((suffix) => cleaned.toLowerCase().endsWith(suffix))) return true;
  return rule.prefixes.some((prefix) => cleaned.startsWith(prefix));
}

/** The most specific owner for a file (longest matching prefix wins). */
export function pickOwner(agents: ScopeAgent[], filePath: string): ScopeAgent | null {
  const cleaned = normalizeProjectPath(filePath);
  let best: { agent: ScopeAgent; weight: number } | null = null;

  for (const agent of agents) {
    if (agent.role === "main" || agent.role === "orchestrator") continue;
    if (!isPathInScope(agent.role, cleaned)) continue;
    const rule = SCOPE_RULES[agent.role];
    if (!rule) continue;
    // A suffix match ("*.test.ts") is more specific than a folder prefix
    // ("src/lib/"), so it must win the ownership contest.
    const suffixHit = rule.suffixes?.some((suffix) => cleaned.toLowerCase().endsWith(suffix)) ?? false;
    const prefix = rule.prefixes
      .filter((candidate) => cleaned.startsWith(candidate))
      .sort((left, right) => right.length - left.length)[0] ?? "";
    const weight = suffixHit ? 1_000 + prefix.length : prefix.length;
    if (!best || weight > best.weight) best = { agent, weight };
  }

  if (best) return best.agent;
  return agents.find((agent) => agent.role === "main") ?? null;
}

const PATH_PATTERN = /((?:src|app|lib|server|tests?|__tests__|components|pages)\/[A-Za-z0-9_@./-]+\.(?:tsx?|jsx?|json|css|scss|md|sql|ya?ml))/g;

/** Pulls project-relative file paths out of a compiler/test log. */
export function extractFilePaths(log: string): string[] {
  const found = new Set<string>();
  for (const match of String(log ?? "").matchAll(PATH_PATTERN)) {
    found.add(normalizeProjectPath(match[1]));
  }
  return [...found];
}

/**
 * Merges per-agent patch groups. The first group that touches a path wins and
 * later conflicting groups are reported instead of silently overwriting.
 */
export function mergeTeamPatches(
  groups: Array<{ agent: string; patches: TeamPatch[] }>,
): { patches: TeamPatch[]; conflicts: string[] } {
  const byPath = new Map<string, TeamPatch>();
  const conflicts: string[] = [];

  for (const group of groups) {
    for (const patch of group.patches ?? []) {
      const path = normalizeProjectPath(patch.path);
      if (!path) continue;
      const normalized: TeamPatch = { ...patch, path };
      const existing = byPath.get(path);
      if (!existing) {
        byPath.set(path, normalized);
        continue;
      }
      const sameContent = (existing.content ?? "") === (normalized.content ?? "");
      if (existing.operation === normalized.operation && sameContent) continue;
      conflicts.push(`${path}: ${group.agent} пересёкся с другим агентом`);
    }
  }

  return { patches: [...byPath.values()], conflicts };
}
