import { NextResponse } from "next/server";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { mobileAccessError } from "@/lib/mobile-auth";
import { writeAccessError } from "@/lib/studio-session";
import { recordApiError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

/** Creates a new project folder inside an existing parent directory. */
export async function POST(request: Request) {
  const mobileError = await mobileAccessError(request);
  if (mobileError) return mobileError;
  const sessionError = await writeAccessError(request);
  if (sessionError) return sessionError;

  try {
    const body = (await request.json()) as { directory?: string; name?: string };
    const parent = (body.directory ?? "").trim();
    const name = (body.name ?? "").trim();
    if (!parent || !name) {
      return NextResponse.json({ error: "directory and name are required" }, { status: 400 });
    }
    if (name === "." || name === ".." || INVALID_NAME.test(name) || name.length > 80) {
      return NextResponse.json({ error: "Invalid project name" }, { status: 400 });
    }

    const parentPath = path.resolve(parent);
    await mkdir(parentPath, { recursive: true });
    const target = path.join(parentPath, name);
    await mkdir(target, { recursive: true });
    const resolved = await realpath(target);

    return NextResponse.json({ ok: true, directory: resolved });
  } catch (error) {
    const message = await recordApiError("workspace.create-folder", 400, error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
