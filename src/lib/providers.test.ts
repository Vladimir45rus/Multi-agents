import { describe, expect, it } from "vitest";
import { getProviderPreset, normalizeProviderModel, OPENROUTER_MODEL_IDS } from "@/lib/providers";

describe("OpenRouter model presets", () => {
  it("exposes valid fallback models for agent settings", () => {
    const preset = getProviderPreset("openrouter");

    expect(preset.defaultModel).toBe("anthropic/claude-3.5-sonnet");
    expect(preset.fallbackModels).toEqual([...OPENROUTER_MODEL_IDS]);
    expect(preset.fallbackModels).toEqual([
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "deepseek/deepseek-r1",
    ]);
  });

  it("migrates the retired Claude model id", () => {
    expect(normalizeProviderModel("openrouter", "anthropic/claude-3.7-sonnet")).toBe("anthropic/claude-3.5-sonnet");
  });

  it("does not rewrite models belonging to another provider", () => {
    expect(normalizeProviderModel("anthropic", "anthropic/claude-3.7-sonnet")).toBe("anthropic/claude-3.7-sonnet");
  });
});
