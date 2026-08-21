import { pushWorkspaceToGitHub } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { locale?: "ru" | "en" };
    const result = await pushWorkspaceToGitHub(body.locale);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
