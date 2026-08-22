import type { AgentIdentity } from "@/lib/agent-identity";

export type ChatMessageStatus = "sending" | "sent" | "error" | "cancelled";
export type StreamingMessageStatus = "streaming" | "done" | "error" | "cancelled";

export type ChatStreamState = {
  channel: "group" | "lead";
  identity: AgentIdentity;
  content: string;
  status: StreamingMessageStatus;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export function appendStreamDelta(
  previous: ChatStreamState | undefined,
  channel: "group" | "lead",
  identity: AgentIdentity,
  text: string,
  now = new Date().toISOString(),
): ChatStreamState {
  return {
    channel,
    identity,
    content: previous?.identity.agentId === identity.agentId ? previous.content + text : text,
    status: "streaming",
    startedAt: previous?.startedAt ?? now,
  };
}

export function finishStream(
  previous: ChatStreamState | undefined,
  channel: "group" | "lead",
  identity: AgentIdentity,
  content: string,
  status: "done" | "error" | "cancelled",
  error?: string,
  now = new Date().toISOString(),
): ChatStreamState {
  return {
    channel,
    identity,
    content: content || previous?.content || "",
    status,
    startedAt: previous?.startedAt ?? now,
    finishedAt: now,
    error,
  };
}
