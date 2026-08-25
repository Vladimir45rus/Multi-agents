import { readWorkspaceFile } from "@/lib/workspace-files";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    return Response.json(await readWorkspaceFile(path), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = await recordApiError("workspace.file.read", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
