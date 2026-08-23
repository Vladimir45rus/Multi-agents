import { NextResponse } from "next/server";
import { getPreviewOutput, getPreviewStatus, startPreview, stopPreview } from "@/lib/preview-process";
import { pushMessage } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPreviewStatus());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: "start" | "stop" | "output"; feedback?: string };
    if (body.action === "stop") return NextResponse.json(await stopPreview());
    if (body.action === "output") return NextResponse.json({ output: await getPreviewOutput() });
    if (body.feedback?.trim()) {
      await pushMessage({ chatChannel: "group", senderType: "user", agentName: "Пользователь", content: `Комментарий по Live Preview для UI/UX Дизайнера:\n${body.feedback.trim()}` });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await startPreview());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed" }, { status: 400 });
  }
}
