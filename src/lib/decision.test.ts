import { describe, expect, it } from "vitest";
import { decisionAddressesBlockers, tallyVotes, type VoteInput } from "@/lib/decision";

const vote = (agent: string, role: string, stance: VoteInput["stance"], note = ""): VoteInput => ({ agent, role, stance, note });

describe("tallyVotes", () => {
  it("counts verdicts and ignores unknowns", () => {
    const tally = tallyVotes([
      vote("A", "architect", "approve"),
      vote("B", "tester", "change"),
      vote("C", "security", "unknown"),
    ]);
    expect(tally).toMatchObject({ approve: 1, change: 1, blocker: 0, total: 2, blocked: false });
    expect(tally.summary).toContain("approve 1");
  });

  it("is blocked by a single blocker", () => {
    const tally = tallyVotes([vote("A", "architect", "approve"), vote("F", "skeptic", "blocker", "src/app/page.tsx падает")]);
    expect(tally.blocked).toBe(true);
    expect(tally.summary).toContain("Фом");
  });

  it("prefers approve only when nobody blocks", () => {
    const tally = tallyVotes([vote("A", "architect", "approve"), vote("B", "tester", "approve"), vote("C", "reviewer", "change")]);
    expect(tally.majority).toBe("approve");
  });

  it("never lets a skeptic blocker become an approve majority", () => {
    const tally = tallyVotes([
      vote("A", "architect", "approve"),
      vote("B", "tester", "approve"),
      vote("F", "skeptic", "blocker"),
    ]);
    expect(tally.majority).not.toBe("approve");
    expect(tally.blocked).toBe(true);
  });

  it("handles an empty vote list", () => {
    const tally = tallyVotes([]);
    expect(tally.total).toBe(0);
    expect(tally.majority).toBe("unknown");
  });
});

describe("decisionAddressesBlockers", () => {
  const blockers = [vote("Фома", "skeptic", "blocker", "Ломается src/app/page.tsx на пустом списке")];

  it("accepts a mention of the blocking agent", () => {
    expect(decisionAddressesBlockers("Принял замечание Фома: добавил пустое состояние", blockers)).toBe(true);
  });

  it("accepts a mention of the blocking file", () => {
    expect(decisionAddressesBlockers("Исправил src/app/page.tsx — добавлен guard", blockers)).toBe(true);
  });

  it("rejects a decision that ignores the blocker", () => {
    expect(decisionAddressesBlockers("Сделал красивую вёрстку и кнопку", blockers)).toBe(false);
  });

  it("passes when there are no blockers", () => {
    expect(decisionAddressesBlockers("что угодно", [vote("A", "tester", "approve")])).toBe(true);
  });
});
