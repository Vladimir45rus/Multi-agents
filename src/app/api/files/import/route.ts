import { importProjectFiles } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      files?: Array<{ path: string; content: string }>;
      locale?: "ru" | "en";
    };

    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return Response.json({ error: "files are required" }, { status: 400 });
    }

    const result = await importProjectFiles(body.files, body.locale);
    return Response.json({ ok: true, imported: result.imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
