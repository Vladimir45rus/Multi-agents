import { describe, expect, it } from "vitest";
import { needsReplacement, pickReplacementModel, usableChatModels } from "@/lib/model-sync";

describe("model self-healing", () => {
  it("prefers the provider default when it is still available", () => {
    const models = ["deepseek-chat", "deepseek-reasoner"];
    expect(pickReplacementModel(models, "deepseek-chat")).toBe("deepseek-chat");
  });

  it("falls back to the shortest chat model when the default is gone", () => {
    const models = ["deepseek-reasoner", "deepseek-chat-v3", "deepseek-chat"];
    expect(pickReplacementModel(models, "deepseek-chat-legacy")).toBe("deepseek-chat");
  });

  it("skips embeddings and audio models", () => {
    const models = ["text-embedding-3-small", "gpt-4o-mini", "whisper-1"];
    expect(usableChatModels(models)).toEqual(["gpt-4o-mini"]);
    expect(pickReplacementModel(models, "missing")).toBe("gpt-4o-mini");
  });

  it("keeps the current model when the provider lists it", () => {
    expect(needsReplacement("gpt-4.1-mini", ["gpt-4.1-mini", "gpt-4o"])).toBe(false);
    expect(needsReplacement("gpt-4.1-mini", ["gpt-4o"])).toBe(true);
  });

  it("does nothing when the provider list is empty (offline keeps the model)", () => {
    expect(needsReplacement("whatever", [])).toBe(false);
    expect(pickReplacementModel([], "x")).toBeNull();
  });
});
