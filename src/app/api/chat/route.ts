import { postGroupMessage } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      channel?: "group" | "lead";
      duplicateToLead?: boolean;
      attachments?: Array<{
        type: "image" | "link";
        url?: string;
        name?: string;
        title?: string;
        previewText?: string;
      }>;
      locale?: "ru" | "en";
    };

    const message = typeof body.message === "string" ? body.message : "";
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!message.trim() && attachments.length === 0) {
      return Response.json({ error: "message or attachments are required" }, { status: 400 });
    }

    await postGroupMessage(message, body.locale, {
      channel: body.channel,
      duplicateToLead: body.duplicateToLead,
      attachments,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
