import "server-only";

import { spawn, execFile, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { db } from "@/db";
import { workspaceSettings } from "@/db/schema";
import { getWorkspaceRoot } from "@/lib/workspace-files";
import { parseCommand } from "@/lib/terminal-command";
import { recordSystemEvent } from "@/lib/system-events";

const MAX_OUTPUT = 500_000;
let child: ChildProcess | null = null;
let output = "";
let starting = false;
let stopping = false;

let failureReported = false;

// H7 fix: on Windows the preview command runs through `cmd /c npm.cmd ...`,
// so killing only the direct child leaves npm/node grandchildren alive and
// holding the port. taskkill /T terminates the whole process tree; on POSIX a
// detached child gets its own process group which receives the signal.
function killProcessTree(target: ChildProcess) {
  const pid = target.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => undefined);
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    target.kill("SIGTERM");
  }
}

function appendOutput(chunk: Buffer | string) {
  output = `${output}${chunk.toString()}`.slice(-MAX_OUTPUT);
}

// Audit M8: a dev server needs a moment before it accepts connections; the URL
// used to be published immediately and the proxy answered 502.
function waitForPort(port: number, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function looksFatal(text: string) {
  return /(syntaxerror|fatal error|module not found|cannot find module|failed to compile|compilation failed|unexpected token|address already in use)/i.test(text);
}

async function reportPreviewFailure(message: string, details: string) {
  await recordSystemEvent("error", "preview", message, details.slice(0, 20_000));
}

function commandParts(command: string) {
  const parsed = parseCommand(command);
  const isWindowsCmd = process.platform === "win32" && parsed.executable.toLowerCase().endsWith(".cmd");
  return {
    executable: isWindowsCmd ? (process.env.ComSpec ?? "cmd.exe") : parsed.executable,
    args: isWindowsCmd
      ? ["/d", "/s", "/c", [parsed.executable, ...parsed.args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ")]
      : parsed.args,
  };
}

export async function startPreview() {
  if (child && !child.killed) return getPreviewStatus();
  if (starting) return getPreviewStatus();
  starting = true;
  stopping = false;
  output = "";
  failureReported = false;
  try {
    const [settings] = await db.select().from(workspaceSettings).limit(1);
    const root = await getWorkspaceRoot();
    const command = settings?.previewCommand || "npm run dev";
    const port = settings?.previewPort || 4173;
    const parts = commandParts(command);
    const allowedEnvironmentKeys = new Set([
      "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE",
      "HOME", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ComSpec", "COMSPEC", "LANG", "LC_ALL",
    ]);
    const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnvironmentKeys.has(key)));
    // Audit M8: keep a local reference so a late exit of THIS process can never
    // null out a newer preview instance started right after it.
    const spawned = spawn(parts.executable, parts.args, { cwd: root, env: { ...safeEnv, NODE_ENV: "development", BROWSER: "none", PORT: String(port) }, shell: false, windowsHide: true, detached: process.platform !== "win32" });
    child = spawned;
    const onOutput = (chunk: Buffer | string) => {
      const text = chunk.toString();
      appendOutput(text);
      if (!failureReported && looksFatal(text)) {
        failureReported = true;
        void reportPreviewFailure("Fatal preview error detected", output.slice(-10_000));
      }
    };
    spawned.stdout?.on("data", onOutput);
    spawned.stderr?.on("data", onOutput);
    spawned.once("error", async (error) => {
      appendOutput(error.message);
      if (!failureReported) {
        failureReported = true;
        await reportPreviewFailure(`Preview process error: ${error.message}`, output.slice(-10_000));
      }
    });
    spawned.once("exit", async (code, signal) => {
      const failed = !stopping && code !== 0 && code !== null;
      if (failed) {
        if (!failureReported) {
          failureReported = true;
          await reportPreviewFailure(`Preview stopped (code=${code}, signal=${signal ?? "none"})`, output.slice(-10_000));
        }
      }
      if (child !== spawned) return;
      child = null;
      await db.update(workspaceSettings).set({ previewUrl: "", updatedAt: new Date() });
    });
    // Audit M8: publish the URL only when the dev server actually accepts
    // connections — otherwise the proxy answered 502 for the first seconds.
    const listening = await waitForPort(port);
    if (child !== spawned) return getPreviewStatus();
    await db.update(workspaceSettings).set({ previewUrl: `http://127.0.0.1:${port}`, updatedAt: new Date() });
    starting = false;
    await recordSystemEvent(
      listening ? "success" : "warning",
      "preview",
      listening
        ? `Preview started: http://127.0.0.1:${port}`
        : `Preview process started, but port ${port} is not listening yet (check previewCommand/previewPort) — URLs below may be wrong`,
    );
    return getPreviewStatus();
  } catch (error) {
    starting = false;
    child = null;
    throw error;
  }
}

export async function stopPreview() {
  stopping = true;
  // H7 fix: kill the entire process tree and wait (bounded) for it to exit so
  // no zombie processes keep the preview port busy on Windows.
  const dying = child;
  if (dying && !dying.killed && dying.pid) {
    killProcessTree(dying);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 3_000);
      dying.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  child = null;
  await db.update(workspaceSettings).set({ previewUrl: "", updatedAt: new Date() });
  await recordSystemEvent("info", "preview", "Preview stopped");
  return getPreviewStatus();
}

export async function getPreviewStatus() {
  const [settings] = await db.select().from(workspaceSettings).limit(1);
  return { running: Boolean(child && !child.killed), url: settings?.previewUrl ?? "", output: output.slice(-20_000) };
}

export async function getPreviewOutput() {
  return output.slice(-100_000);
}
