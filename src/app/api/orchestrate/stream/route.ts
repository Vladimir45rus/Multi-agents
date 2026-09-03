import { randomUUID } from "node:crypto";

import { registerTaskController, releaseTaskController, runOrchestrator } from "@/lib/orchestrator";
import type { OrchestratorStreamEvent } from "@/lib/orchestrator-types";
import type { ProjectContextInput } from "@/lib/project-context";
import { recordApiError } from "@/lib/api-errors";
import { mobileAccessError } from "@/lib/mobile-auth";
import { getWorkspaceSettingsRow } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessError = await mobileAccessError(request);
  if (accessError) return accessError;

  let body: {
    task?: string;
    taskId?: string;
    maxIterations?: number;
    mode?: "autonomous" | "controlled";
    locale?: "ru" | "en";
    projectContext?: ProjectContextInput;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch (error) {
    await recordApiError("orchestrate.stream", 400, error);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const task = typeof body.task === "string" ? body.task : "";
  if (!task.trim()) {
    await recordApiError("orchestrate.stream", 400, "task is required");
    return Response.json({ error: "task is required" }, { status: 400 });
  }

  const taskId = (typeof body.taskId === "string" && body.taskId.trim() ? body.taskId.trim() : "") || randomUUID();
  const maxIterations = typeof body.maxIterations === "number" ? body.maxIterations : undefined;

  // Execution-contour wiring: the AUTO toggle (settings.autoApprove) maps to
  // the orchestrator's autonomous mode when the panel sends no explicit mode.
  // Conversational messages can never reach this route with a task payload.
  let mode = body.mode;
  if (mode !== "autonomous" && mode !== "controlled") {
    try {
      const settings = await getWorkspaceSettingsRow();
      mode = Boolean(settings.autoApprove) ? "autonomous" : "controlled";
    } catch {
      mode = "controlled";
    }
  }

  const controller = registerTaskController(taskId);
  const abortFromRequest = () => controller.abort();
  request.signal.addEventListener("abort", abortFromRequest, { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        for await (const event of runOrchestrator({ task, taskId, maxIterations, mode, locale: body.locale, signal: controller.signal, projectContext: body.projectContext })) {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        const message = await recordApiError("orchestrate.stream", 500, error);
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
