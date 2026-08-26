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
  rateLimited?: boolean;
  // Dedupe fix: stable temporary card id for the streaming bubble and the real
  // persisted message id delivered with the done event, so the finished bubble
  // updates the existing card by ID instead of spawning a duplicate.
  tempId?: string;
  savedId?: number;
};

export function appendStreamDelta(
  previous: ChatStreamState | undefined,
  channel: "group" | "lead",
  identity: AgentIdentity,
  text: string,
  now = new Date().toISOString(),
  tempId?: string,
): ChatStreamState {
  return {
    channel,
    identity,
    content: previous?.identity.agentId === identity.agentId ? previous.content + text : text,
    status: "streaming",
    startedAt: previous?.startedAt ?? now,
    tempId: previous?.tempId ?? tempId,
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
  rateLimited = false,
  savedId?: number,
): ChatStreamState {
  return {
    channel,
    identity,
    content: content || previous?.content || "",
    status,
    startedAt: previous?.startedAt ?? now,
    finishedAt: now,
    error,
    rateLimited,
    tempId: previous?.tempId,
    savedId: savedId ?? previous?.savedId,
  };
}
