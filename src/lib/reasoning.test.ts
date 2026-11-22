import { describe, expect, it } from "vitest";
import { effortForRequest, normalizeEffort, supportsReasoning } from "@/lib/reasoning";

describe("reasoning effort", () => {
  it("recognises reasoning models", () => {
    expect(supportsReasoning("o3-mini")).toBe(true);
    expect(supportsReasoning("deepseek-reasoner")).toBe(true);
    expect(supportsReasoning("google/gemini-2.5-flash")).toBe(true);
    expect(supportsReasoning("Qwen/QwQ-32B")).toBe(true);
  });

  it("does not promise reasoning for plain chat models", () => {
    expect(supportsReasoning("deepseek-chat")).toBe(false);
    expect(supportsReasoning("gpt-4.1-mini")).toBe(false);
    expect(supportsReasoning("llama-3.3-70b")).toBe(false);
    expect(supportsReasoning("")).toBe(false);
  });

  it("sends nothing for auto or unsupported models", () => {
    expect(effortForRequest("auto", "o3-mini")).toBe("");
    expect(effortForRequest("high", "gpt-4.1-mini")).toBe("");
  });

  it("maps max to the highest documented value", () => {
    expect(effortForRequest("max", "deepseek-reasoner")).toBe("high");
    expect(effortForRequest("low", "deepseek-reasoner")).toBe("low");
    expect(effortForRequest("off", "deepseek-reasoner")).toBe("minimal");
  });

  it("falls back to auto for unknown stored values", () => {
    expect(normalizeEffort("turbo")).toBe("auto");
    expect(normalizeEffort("max")).toBe("max");
  });
});
