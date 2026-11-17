import { describe, expect, it, vi } from "vitest";

// Server-only guard has no runtime meaning inside unit tests.
vi.mock("server-only", () => ({}));
import { PROVIDER_PRESETS, getProviderPreset } from "@/lib/providers";
import { validateProviderBaseUrl, validateApiKey } from "@/lib/provider-gateway";

describe("local Ollama provider", () => {
  it("is registered as a preset without any key", () => {
    const preset = getProviderPreset("ollama");
    expect(preset.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(preset.label).toContain("Ollama");
    expect(PROVIDER_PRESETS.some((provider) => provider.id === "ollama")).toBe(true);
  });

  it("accepts an http base URL because it is localhost-only", () => {
    expect(validateProviderBaseUrl("ollama", "http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1");
    expect(validateProviderBaseUrl("ollama", "http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
  });

  it("still refuses plain http for remote hosts", () => {
    expect(() => validateProviderBaseUrl("ollama", "http://evil.example.com/v1")).toThrow(/HTTPS/);
  });

  it("keeps the api key validator strict for real providers", () => {
    expect(() => validateApiKey("")).toThrow(/required/);
  });
});
