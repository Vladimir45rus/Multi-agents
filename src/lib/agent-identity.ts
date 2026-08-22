import { normalizeProviderModel } from "@/lib/providers";

export type AgentIdentity = {
  agentId: number;
  displayName: string;
  role: string;
  provider: string;
  model: string;
};

type AgentIdentityInput = AgentIdentity;

export function createAgentIdentity(input: AgentIdentityInput): AgentIdentity {
  return {
    agentId: input.agentId,
    displayName: input.displayName.trim(),
    role: input.role.trim() || "agent",
    provider: input.provider.trim(),
    model: normalizeProviderModel(input.provider, input.model),
  };
}
