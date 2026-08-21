import { abortTask } from "@/lib/orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { taskId?: string };
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId) return Response.json({ error: "taskId is required" }, { status: 400 });

    const aborted = abortTask(taskId);
    return Response.json({ ok: true, aborted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancel failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
