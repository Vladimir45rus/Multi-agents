import { NextResponse } from "next/server";
import { generateProjectTemplate, PROJECT_TEMPLATES, type ProjectTemplateId } from "@/lib/project-templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(PROJECT_TEMPLATES);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { template?: ProjectTemplateId; directory?: string };
    if (!body.template || !PROJECT_TEMPLATES.some((item) => item.id === body.template)) return NextResponse.json({ error: "Invalid template" }, { status: 400 });
    if (!body.directory?.trim()) return NextResponse.json({ error: "directory is required" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await generateProjectTemplate(body.template, body.directory)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Template generation failed" }, { status: 400 });
  }
}
