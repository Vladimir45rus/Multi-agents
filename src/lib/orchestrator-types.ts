export type AgentEventType =
  | "TASK_CREATED"
  | "PLAN_CREATED"
  | "ADVICE_POSTED"
  | "CONFLICT_DETECTED"
  | "DECISION_MADE"
  | "PATCH_PROPOSED"
  | "PATCH_APPLIED"
  | "TEST_STARTED"
  | "TEST_FAILED"
  | "REVIEW_APPROVED";

export type EventStatus = "open" | "accepted" | "rejected" | "resolved";

export type OrchestratorRole =
  | "main"
  | "architect"
  | "reviewer"
  | "tester"
  | "security"
  | "advisor"
  | "observer"
  | "orchestrator";

export type OrchestratorMode = "autonomous" | "controlled";

export type OrchestratorStep = "planning" | "analysis" | "patch" | "checks" | "fix" | "done";

export type ConfirmationKind = "patch" | "command";

export type ReleaseStatus = "RELEASE_READY" | "FAILED";

export type CheckStatus = "success" | "failed" | "skipped";

export type CheckResult = {
  name: string;
  command: string;
  status: CheckStatus;
  output: string;
};

export type AgentEvent = {
  id: number;
  taskId: string;
  type: AgentEventType;
  agentId: number | null;
  agent: string;
  role: OrchestratorRole;
  filePath: string | null;
  line: number | null;
  status: EventStatus;
  arguments: string;
  proposal: string;
  iteration: number;
  createdAt: string;
};

export type ReleaseReport = {
  id: number;
  taskId: string;
  task: string;
  status: ReleaseStatus;
  changedFiles: string[];
  checkResults: CheckResult[];
  summary: string;
  iterations: number;
  createdAt: string;
};

export type OrchestratorStreamEvent =
  | { type: "task_started"; taskId: string; task: string; maxIterations: number; mode: OrchestratorMode }
  | { type: "event"; event: AgentEvent }
  | { type: "iteration"; iteration: number; total: number }
  | { type: "step"; step: OrchestratorStep; iteration?: number }
  | {
      type: "agent_status";
      agent: string;
      role: OrchestratorRole;
      status: "started" | "done" | "error";
      message?: string;
    }
  | { type: "confirmation_request"; taskId: string; confirmationId: string; kind: ConfirmationKind; prompt: string }
  | { type: "report"; report: ReleaseReport }
  | { type: "task_completed"; taskId: string; iterations: number; decision: string }
  | { type: "cancelled"; taskId: string }
  | { type: "error"; message: string };
