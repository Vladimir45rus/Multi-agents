import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export type ActiveTaskState = {
  taskId: string;
  task: string;
  mode: string;
  iteration: number;
  maxIterations: number;
  step: string;
  startedAt: string;
  lastSavedAt: string;
};

function userDataDir(): string | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.startsWith("file:")) return null;
  return path.dirname(dbUrl.slice("file:".length));
}

function stateFilePath(): string | null {
  const dir = userDataDir();
  if (!dir) return null;
  return path.join(dir, "orchestrator-active.json");
}

export async function saveActiveTaskState(state: ActiveTaskState): Promise<void> {
  const filePath = stateFilePath();
  if (!filePath) return;
  try {
    await writeFile(filePath, JSON.stringify({ ...state, lastSavedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {
    // Best-effort — never crash the orchestrator because of persistence.
  }
}

export async function loadActiveTaskState(): Promise<ActiveTaskState | null> {
  const filePath = stateFilePath();
  if (!filePath) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ActiveTaskState | null;
    return parsed && typeof parsed === "object" && parsed.taskId ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearActiveTaskState(): Promise<void> {
  const filePath = stateFilePath();
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Ignore — file may not exist.
  }
}
