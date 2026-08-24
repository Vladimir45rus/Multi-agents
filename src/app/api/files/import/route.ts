import { importProjectFiles } from "@/lib/workspace";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      files?: Array<{ path: string; content: string }>;
      locale?: "ru" | "en";
    };

    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      await recordApiError("files.import", 400, "files are required");
      return Response.json({ error: "files are required" }, { status: 400 });
    }

    const result = await importProjectFiles(body.files, body.locale);
    return Response.json({ ok: true, imported: result.imported });
  } catch (error) {
    const message = await recordApiError("files.import", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
