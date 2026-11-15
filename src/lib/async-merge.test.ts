import { describe, expect, it } from "vitest";
import { mergeAsync } from "@/lib/async-merge";

async function* delayed<T>(items: T[], delayMs: number): AsyncGenerator<T> {
  for (const item of items) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield item;
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("mergeAsync", () => {
  it("returns nothing for an empty input", async () => {
    expect(await collect(mergeAsync([], 2))).toEqual([]);
  });

  it("keeps the order inside each generator", async () => {
    const merged = await collect(mergeAsync([
      delayed(["n1", "n2", "n3"], 1),
      delayed(["a", "b"], 2),
    ], 2));
    expect(merged.filter((item) => item.startsWith("n"))).toEqual(["n1", "n2", "n3"]);
    expect(merged.filter((item) => item.startsWith("a") || item === "b")).toEqual(["a", "b"]);
    expect(merged).toHaveLength(5);
  });

  it("does not wait for a slow generator before the first fast item", async () => {
    const started = Date.now();
    const merged: string[] = [];
    let firstItemAt = 0;
    for await (const item of mergeAsync([
      delayed(["slow-1", "slow-2"], 60),
      delayed(["fast-1"], 1),
    ], 2)) {
      if (merged.length === 0) firstItemAt = Date.now() - started;
      merged.push(item);
    }
    // Sequential execution would deliver the first item only after ~120ms.
    expect(firstItemAt).toBeLessThan(60);
    expect(merged[0]).toBe("fast-1");
    expect(merged).toHaveLength(3);
  });

  it("respects the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const make = (id: number): AsyncGenerator<number> => (async function* () {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      yield id;
      active -= 1;
    })();

    const merged = await collect(mergeAsync([make(1), make(2), make(3)], 1));
    expect(merged.sort()).toEqual([1, 2, 3]);
    expect(peak).toBe(1);
  });

  it("survives a generator that throws", async () => {
    const broken = (async function* (): AsyncGenerator<string> {
      yield "before";
      throw new Error("boom");
    })();
    const merged = await collect(mergeAsync([broken, delayed(["after"], 5)], 2));
    expect(merged).toContain("before");
    expect(merged).toContain("after");
  });
});
