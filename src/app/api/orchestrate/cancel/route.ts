import { abortTask } from "@/lib/orchestrator";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { taskId?: string };
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId) {
      await recordApiError("orchestrate.cancel", 400, "taskId is required");
      return Response.json({ error: "taskId is required" }, { status: 400 });
    }

    const aborted = abortTask(taskId);
    return Response.json({ ok: true, aborted });
  } catch (error) {
    const message = await recordApiError("orchestrate.cancel", 400, error);
    return Response.json({ error: message }, { status: 400 });
  }
}
