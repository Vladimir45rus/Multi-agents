import { describe, expect, it } from "vitest";
import { planRollback, summarizeRollback } from "@/lib/rollback-plan";

const rows = [
  { id: 10, filePath: "src/a.ts", operation: "modify" },
  { id: 11, filePath: "src/b.ts", operation: "create" },
  { id: 12, filePath: "src/a.ts", operation: "modify" },
  { id: 13, filePath: "src/c.ts", operation: "delete" },
];

describe("task rollback plan", () => {
  it("restores newest snapshots first", () => {
    const plan = planRollback(rows);
    expect(plan.order.map((row) => row.id)).toEqual([13, 12, 11, 10]);
  });

  it("separates files to delete from files to restore", () => {
    const plan = planRollback(rows);
    expect(plan.created).toEqual(["src/b.ts"]);
    expect(plan.restored.sort()).toEqual(["src/a.ts", "src/c.ts"]);
  });

  it("returns a stable plan for an empty history", () => {
    const plan = planRollback([]);
    expect(plan.order).toEqual([]);
    expect(plan.created).toEqual([]);
    expect(plan.restored).toEqual([]);
    expect(summarizeRollback(plan, "ru")).toContain("0");
  });

  it("counts a file edited twice only once", () => {
    const plan = planRollback([
      { id: 1, filePath: "src/x.ts", operation: "modify" },
      { id: 2, filePath: "src/x.ts", operation: "modify" },
    ]);
    expect(plan.order).toHaveLength(2);
    expect(plan.restored).toEqual(["src/x.ts"]);
  });
});
