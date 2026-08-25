import { postGroupMessage } from "@/lib/workspace";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
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
      await recordApiError("chat", 400, "message or attachments are required");
      return Response.json({ error: "message or attachments are required" }, { status: 400 });
    }

    await postGroupMessage(message, body.locale, {
      channel: body.channel,
      duplicateToLead: body.duplicateToLead,
      attachments,
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("chat", 400, error);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
