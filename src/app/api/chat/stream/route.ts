import { streamWorkspaceMessage, type ChatAttachment, type ChatChannel, type ChatStreamEvent, type UiLocale } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(encoder: TextEncoder, event: ChatStreamEvent | { type: "error"; channel: ChatChannel; message: string }) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  let body: {
    message?: string;
    channel?: ChatChannel;
    duplicateToLead?: boolean;
    attachments?: ChatAttachment[];
    locale?: UiLocale;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : "";
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const channel: ChatChannel = body.channel === "lead" ? "lead" : "group";

  if (!message.trim() && attachments.length === 0) {
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
        })) {
          controller.enqueue(encodeEvent(encoder, event));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Chat stream failed";
        controller.enqueue(encodeEvent(encoder, { type: "error", channel, message: errorMessage }));
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
