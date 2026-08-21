import { NextResponse } from "next/server";
import { getWorkspaceSnapshot } from "@/lib/workspace";

export async function GET() {
  try {
    return NextResponse.json(await getWorkspaceSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace load failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
