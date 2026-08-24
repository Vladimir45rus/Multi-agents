import { loadActiveTaskState, clearActiveTaskState, type ActiveTaskState } from "@/lib/orchestrator-state";
import { db } from "@/db";
import { agentEvents, orchestratorReports } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { recordApiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const activeTask = await loadActiveTaskState();

    if (!activeTask) {
      return Response.json({ activeTask: null, recovery: null });
    }

    // Fetch the last events for this task to provide recovery context.
    const events = await db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.taskId, activeTask.taskId))
      .orderBy(desc(agentEvents.id))
      .limit(15);

    const reports = await db
      .select()
      .from(orchestratorReports)
      .where(eq(orchestratorReports.taskId, activeTask.taskId))
      .orderBy(desc(orchestratorReports.id))
      .limit(1);

    return Response.json({
      activeTask,
      recovery: {
        events: events.reverse().map((row) => ({
          id: row.id,
          type: row.type,
          agent: row.agentName,
          role: row.role,
          iteration: row.iteration,
          proposal: row.proposal,
          status: row.status,
          createdAt: new Date(row.createdAt).toISOString(),
        })),
        report: reports[0]
          ? {
              task: reports[0].task,
              status: reports[0].status,
              summary: reports[0].summary,
              iterations: reports[0].iterations,
              createdAt: new Date(reports[0].createdAt).toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    const message = await recordApiError("orchestrate.state", 500, error);
    return Response.json({ error: message, activeTask: null, recovery: null }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearActiveTaskState();
    return Response.json({ ok: true });
  } catch (error) {
    const message = await recordApiError("orchestrate.state.clear", 500, error);
    return Response.json({ error: message }, { status: 500 });
  }
}
