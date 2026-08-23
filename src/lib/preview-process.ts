import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
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

function appendOutput(chunk: Buffer | string) {
  output = `${output}${chunk.toString()}`.slice(-MAX_OUTPUT);
}

function looksFatal(text: string) {
  return /(syntaxerror|fatal error|module not found|cannot find module|failed to compile|compilation failed|unexpected token|address already in use)/i.test(text);
}

async function reportPreviewFailure(message: string, details: string) {
  const content = `${message}\n\n${details}`.slice(0, 20_000);
  const { pushMessage } = await import("@/lib/workspace");
  await pushMessage({ chatChannel: "group", senderType: "tester", agentName: "Тестировщик", content });
  await pushMessage({ chatChannel: "lead", senderType: "system", agentName: "System", content: `Тестировщик обнаружил ошибку Live Preview:\n${content}` });
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
    child = spawn(parts.executable, parts.args, { cwd: root, env: { ...process.env, BROWSER: "none", PORT: String(port) }, shell: false, windowsHide: true });
    const onOutput = (chunk: Buffer | string) => {
      const text = chunk.toString();
      appendOutput(text);
      if (!failureReported && looksFatal(text)) {
        failureReported = true;
        void recordSystemEvent("error", "preview", "Fatal preview error detected", output.slice(-10_000));
        void reportPreviewFailure("Тестировщик обнаружил фатальную ошибку dev-сервера.", output.slice(-10_000));
      }
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.once("error", async (error) => {
      appendOutput(error.message);
      await recordSystemEvent("error", "preview", `Preview process error: ${error.message}`, output.slice(-10_000));
      if (!failureReported) {
        failureReported = true;
        await reportPreviewFailure("Dev-сервер не запустился.", output.slice(-10_000));
      }
    });
    child.once("exit", async (code, signal) => {
      const failed = !stopping && code !== 0 && code !== null;
      if (failed) {
        await recordSystemEvent("error", "preview", `Preview stopped (code=${code}, signal=${signal ?? "none"})`, output.slice(-10_000));
        if (!failureReported) {
          failureReported = true;
          await reportPreviewFailure(`Dev-сервер завершился с кодом ${code}.`, output.slice(-10_000));
        }
      }
      child = null;
      await db.update(workspaceSettings).set({ previewUrl: "", updatedAt: new Date() });
    });
    await db.update(workspaceSettings).set({ previewUrl: `http://127.0.0.1:${port}`, updatedAt: new Date() });
    starting = false;
    await recordSystemEvent("success", "preview", `Preview started: http://127.0.0.1:${port}`);
    return getPreviewStatus();
  } catch (error) {
    starting = false;
    child = null;
    throw error;
  }
}

export async function stopPreview() {
  stopping = true;
  if (child && !child.killed) child.kill();
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
