import { describe, expect, it } from "vitest";
import { appendStreamDelta, finishStream } from "@/lib/chat-state";
import type { AgentIdentity } from "@/lib/agent-identity";

const identity = (agentId: number): AgentIdentity => ({
  agentId,
  displayName: `Agent ${agentId}`,
  role: "advisor",
  provider: "openrouter",
  model: "liquid/lfm-40b",
});

describe("chat stream state", () => {
  it("appends deltas independently for each agent", () => {
    const first = appendStreamDelta(undefined, "group", identity(1), "Hel", "2026-01-01T00:00:00.000Z");
    const second = appendStreamDelta(first, "group", identity(1), "lo", "2026-01-01T00:00:01.000Z");
    const other = appendStreamDelta(undefined, "group", identity(2), "Hi", "2026-01-01T00:00:02.000Z");

    expect(second.content).toBe("Hello");
    expect(second.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(other.content).toBe("Hi");
  });

  it("keeps partial content when an agent fails", () => {
    const partial = appendStreamDelta(undefined, "lead", identity(3), "partial", "2026-01-01T00:00:00.000Z");
    const failed = finishStream(partial, "lead", identity(3), "", "error", "Provider unavailable", "2026-01-01T00:00:02.000Z");

    expect(failed.status).toBe("error");
    expect(failed.content).toBe("partial");
    expect(failed.error).toBe("Provider unavailable");
  });
});
