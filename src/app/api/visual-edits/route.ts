import { NextResponse } from "next/server";
import { mobileAccessError } from "@/lib/mobile-auth";
import { recordApiError } from "@/lib/api-errors";
import {
  buildVisualBrief,
  clearVisualEdits,
  deleteVisualEdit,
  listVisualEdits,
  saveVisualEdit,
  type VisualEditInput,
} from "@/lib/visual-edits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const url = new URL(request.url);
    const locale = url.searchParams.get("locale") === "en" ? "en" : "ru";
    const edits = await listVisualEdits();
    if (url.searchParams.get("format") === "brief") {
      return NextResponse.json({ edits, brief: buildVisualBrief(edits, locale) });
    }
    return NextResponse.json({ edits });
  } catch (error) {
    const message = await recordApiError("visual-edits.list", 500, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const body = (await request.json()) as VisualEditInput & { locale?: "ru" | "en" };
    const edit = await saveVisualEdit(body);
    const edits = await listVisualEdits();
    const locale = body.locale === "en" ? "en" : "ru";
    return NextResponse.json({ ok: true, edit, edits, brief: buildVisualBrief(edits, locale) });
  } catch (error) {
    const message = await recordApiError("visual-edits.save", 400, error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;
  try {
    const url = new URL(request.url);
    const rawId = url.searchParams.get("id");
    if (rawId) {
      const removed = await deleteVisualEdit(Number(rawId));
      if (!removed) return NextResponse.json({ error: "Visual edit not found" }, { status: 404 });
      return NextResponse.json({ ok: true, edits: await listVisualEdits() });
    }
    const cleared = await clearVisualEdits();
    return NextResponse.json({ ok: true, cleared, edits: [] });
  } catch (error) {
    const message = await recordApiError("visual-edits.delete", 400, error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
