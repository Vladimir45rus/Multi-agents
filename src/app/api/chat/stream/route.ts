import { streamWorkspaceMessage, type ChatAttachment, type ChatChannel, type ChatStreamEvent, type UiLocale } from "@/lib/workspace";
import type { ProjectContextInput } from "@/lib/project-context";
import { mobileAccessError } from "@/lib/mobile-auth";
import { recordSystemEvent } from "@/lib/system-events";
import { recordApiError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(encoder: TextEncoder, event: ChatStreamEvent | { type: "error"; channel: ChatChannel; message: string }) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;

  let body: {
    message?: string;
    channel?: ChatChannel;
    duplicateToLead?: boolean;
    attachments?: ChatAttachment[];
    locale?: UiLocale;
    projectContext?: ProjectContextInput;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch (error) {
    await recordApiError("chat.stream", 400, error);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : "";
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const channel: ChatChannel = body.channel === "lead" ? "lead" : "group";

  if (!message.trim() && attachments.length === 0) {
    await recordApiError("chat.stream", 400, "message or attachments are required");
    return Response.json({ error: "message or attachments are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamWorkspaceMessage(message, body.locale, {
          channel,
          duplicateToLead: body.duplicateToLead,
          attachments,
          signal: request.signal,
          projectContext: body.projectContext,
        })) {
          controller.enqueue(encodeEvent(encoder, event));
        }
      } catch (error) {
        if (!request.signal.aborted) {
          const errorMessage = error instanceof Error ? error.message : "Chat stream failed";
          await recordApiError("chat.stream", 500, error).catch(() => undefined);
          controller.enqueue(encodeEvent(encoder, { type: "error", channel, message: errorMessage }));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
