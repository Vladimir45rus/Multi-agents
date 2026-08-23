import { pushWorkspaceToGitHub } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      locale?: "ru" | "en";
      token?: string;
      repo?: string;
    };
    const result = await pushWorkspaceToGitHub(body.locale, { token: body.token, repo: body.repo });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = error instanceof Error && "code" in error ? (error as Error & { code?: string }).code : undefined;
    return Response.json({ error: message, code }, { status: code === "GITHUB_CREDENTIALS_REQUIRED" ? 422 : 400 });
  }
}
