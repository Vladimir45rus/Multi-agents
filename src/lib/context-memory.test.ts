import { describe, expect, it, vi } from "vitest";

// server-only has no meaning in unit tests.
vi.mock("server-only", () => ({}));
import { extractDecisions, responsibilityFor, renderSnapshot, type ContextSnapshot } from "@/lib/context-memory";

// The memory module is server-only, but its pure helpers decide what agents
// see — they must be pinned by tests.
const snapshot: ContextSnapshot = {
  version: 1,
  projectRoot: "C:/demo",
  updatedAt: "2026-11-19T10:00:00.000Z",
  stack: ["Next.js", "React 19"],
  architecture: [],
  files: [
    { path: "src/app/api/workspace/route.ts", responsibility: "HTTP API (route handler)", lines: 120 },
    { path: "src/components/ide-app.tsx", responsibility: "React-компонент интерфейса", lines: 4000 },
  ],
  dependencies: [{ from: "src/components/ide-app.tsx", to: "@/lib/decision" }],
  integrations: ["OpenRouter"],
  decisions: ["Решили: превью открывается в отдельном окне"],
  conflicts: [],
  summary: "Решили: превью в отдельном окне",
  stats: { scannedFiles: 2, rawTokens: 9000, snapshotTokens: 300, savedTokens: 8700 },
};

describe("context memory", () => {
  it("maps paths to a responsibility", () => {
    expect(responsibilityFor("src/app/api/agents/route.ts")).toContain("HTTP API");
    expect(responsibilityFor("src/lib/workspace.ts")).toBe("доменная логика");
    expect(responsibilityFor("drizzle/0015_x.sql")).toContain("миграции");
    expect(responsibilityFor("something/unknown.xyz")).toBe("прочие файлы");
  });

  it("keeps decisions and drops debug noise", () => {
    const decisions = extractDecisions([
      { role: "user", content: "Решили: используем SQLite вместо Postgres." },
      { role: "assistant", content: "at Object.<anonymous> (C:/app/src/x.ts:12:3)\n    at Module._compile" },
      { role: "assistant", content: "```ts\nconst secret = 1;\n```" },
      { role: "assistant", content: "Итог: проверки прошли, RELEASE_READY." },
    ]);
    expect(decisions.some((value) => value.includes("SQLite"))).toBe(true);
    expect(decisions.some((value) => value.includes("RELEASE_READY"))).toBe(true);
    expect(decisions.some((value) => value.includes("Module._compile"))).toBe(false);
    expect(decisions.some((value) => value.includes("const secret"))).toBe(false);
  });

  it("renders a compact snapshot and respects the cap", () => {
    const rendered = renderSnapshot(snapshot);
    expect(rendered).toContain("PROJECT CONTEXT SNAPSHOT");
    expect(rendered).toContain("src/app/api/workspace/route.ts");
    expect(rendered).toContain("newest wins");
    expect(rendered.length).toBeLessThanOrEqual(4000);
    expect(renderSnapshot(snapshot, 120).length).toBe(120);
  });
});
