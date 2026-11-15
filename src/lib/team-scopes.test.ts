import { describe, expect, it } from "vitest";
import { extractFilePaths, isPathInScope, mergeTeamPatches, normalizeProjectPath, pickOwner } from "@/lib/team-scopes";

describe("isPathInScope", () => {
  it("gives UI files to the designer", () => {
    expect(isPathInScope("uiux", "src/components/chat-panel.tsx")).toBe(true);
    expect(isPathInScope("uiux", "src/app/page.tsx")).toBe(true);
    expect(isPathInScope("uiux", "src/lib/db.ts")).toBe(false);
  });

  it("gives API and lib files to the architect", () => {
    expect(isPathInScope("architect", "src/lib/orchestrator.ts")).toBe(true);
    expect(isPathInScope("architect", "src/app/api/chat/route.ts")).toBe(true);
    expect(isPathInScope("architect", "src/components/button.tsx")).toBe(false);
  });

  it("gives test files to the tester by suffix", () => {
    expect(isPathInScope("tester", "src/lib/foo.test.ts")).toBe(true);
    expect(isPathInScope("tester", "src/lib/foo.ts")).toBe(false);
  });

  it("keeps security on its own surface", () => {
    expect(isPathInScope("security", "src/proxy.ts")).toBe(true);
    expect(isPathInScope("security", "src/components/button.tsx")).toBe(false);
  });

  it("lets the Lead touch everything and blocks traversal", () => {
    expect(isPathInScope("main", "anything/at/all.ts")).toBe(true);
    expect(isPathInScope("uiux", "../etc/passwd")).toBe(false);
    expect(isPathInScope("unknown-role", "src/app/page.tsx")).toBe(false);
  });
});

describe("pickOwner", () => {
  const team = [
    { name: "Lead", role: "main" },
    { name: "Designer", role: "uiux" },
    { name: "Architect", role: "architect" },
    { name: "Tester", role: "tester" },
  ];

  it("picks the most specific specialist", () => {
    expect(pickOwner(team, "src/app/api/chat/route.ts")?.name).toBe("Architect");
    expect(pickOwner(team, "src/components/header.tsx")?.name).toBe("Designer");
    expect(pickOwner(team, "src/lib/util.test.ts")?.name).toBe("Tester");
  });

  it("falls back to the Lead for unowned files", () => {
    expect(pickOwner(team, "package.json")?.name).toBe("Lead");
    expect(pickOwner(team, "docs/readme.md")?.name).toBe("Lead");
  });
});

describe("extractFilePaths", () => {
  it("reads paths out of a tsc log", () => {
    const log = [
      "src/lib/orchestrator.ts(120,7): error TS2322: Type 'string' is not assignable",
      "src/components/ide-app.tsx(42,1): error TS2304: Cannot find name 'x'",
      "node_modules/react/index.d.ts(1,1): error",
    ].join("\n");
    expect(extractFilePaths(log)).toEqual(["src/lib/orchestrator.ts", "src/components/ide-app.tsx"]);
  });

  it("ignores unrelated text", () => {
    expect(extractFilePaths("Tests failed: expected 1 to be 2")).toEqual([]);
  });
});

describe("mergeTeamPatches", () => {
  it("keeps the first patch per path and reports conflicts", () => {
    const result = mergeTeamPatches([
      { agent: "Designer", patches: [{ path: "src/components/a.tsx", operation: "modify", content: "one" }] },
      { agent: "Architect", patches: [{ path: "./src/components/a.tsx", operation: "modify", content: "two" }] },
      { agent: "Tester", patches: [{ path: "src/lib/a.test.ts", operation: "create", content: "test" }] },
    ]);
    expect(result.patches).toHaveLength(2);
    expect(result.patches[0].content).toBe("one");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain("src/components/a.tsx");
  });

  it("does not report identical patches as conflicts", () => {
    const result = mergeTeamPatches([
      { agent: "A", patches: [{ path: "src/x.ts", operation: "modify", content: "same" }] },
      { agent: "B", patches: [{ path: "src/x.ts", operation: "modify", content: "same" }] },
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.patches).toHaveLength(1);
  });
});

describe("normalizeProjectPath", () => {
  it("normalizes separators and leading dots", () => {
    expect(normalizeProjectPath(".\\src\\app\\page.tsx")).toBe("src/app/page.tsx");
    expect(normalizeProjectPath("/src/a.ts")).toBe("src/a.ts");
  });
});
