import { randomUUID } from "node:crypto";

import { registerTaskController, releaseTaskController, runOrchestrator } from "@/lib/orchestrator";
import type { OrchestratorStreamEvent } from "@/lib/orchestrator-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    task?: string;
    taskId?: string;
    maxIterations?: number;
    mode?: "autonomous" | "controlled";
    locale?: "ru" | "en";
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const task = typeof body.task === "string" ? body.task : "";
  if (!task.trim()) return Response.json({ error: "task is required" }, { status: 400 });

  const taskId = (typeof body.taskId === "string" && body.taskId.trim() ? body.taskId.trim() : "") || randomUUID();
  const maxIterations = typeof body.maxIterations === "number" ? body.maxIterations : undefined;

  const controller = registerTaskController(taskId);
  const abortFromRequest = () => controller.abort();
  request.signal.addEventListener("abort", abortFromRequest, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        for await (const event of runOrchestrator({ task, taskId, maxIterations, mode: body.mode, locale: body.locale, signal: controller.signal })) {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Orchestrator failed";
        const event: OrchestratorStreamEvent = { type: "error", message };
        streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } finally {
        request.signal.removeEventListener("abort", abortFromRequest);
        releaseTaskController(taskId);
        streamController.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
