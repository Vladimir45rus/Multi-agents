import { readWorkspaceFile } from "@/lib/workspace-files";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    return Response.json(await readWorkspaceFile(path), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to read workspace file" }, { status: 400 });
  }
}
