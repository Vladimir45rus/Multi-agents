import { describe, expect, it } from "vitest";
import { createAgentIdentity } from "@/lib/agent-identity";

describe("createAgentIdentity", () => {
  it("keeps the agent identity together and normalizes its model", () => {
    expect(
      createAgentIdentity({
        agentId: 7,
        displayName: " Lead ",
        role: "main",
        provider: "openrouter",
        model: "deepseek/deepseek-r1",
      }),
    ).toEqual({
      agentId: 7,
      displayName: "Lead",
      role: "main",
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
    });
  });

  it("uses a neutral role when one is missing", () => {
    expect(
      createAgentIdentity({
        agentId: 8,
        displayName: "Advisor",
        role: "",
        provider: "custom",
        model: "custom-model",
      }).role,
    ).toBe("agent");
  });
});
