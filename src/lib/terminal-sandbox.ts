import "server-only";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { agents, terminalEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceRoot } from "@/lib/workspace-files";
import { parseCommand } from "@/lib/terminal-command";

type Locale = "ru" | "en";

const MAX_OUTPUT_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 120_000;

// H1 fix: give the command parser the real set of package.json scripts so
// "npm run <name>" can be validated against what the project actually defines.
async function loadAllowedNpmScripts(root: string): Promise<ReadonlySet<string>> {
  try {
    const raw = await readFile(path.resolve(root, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    return new Set(Object.keys(parsed.scripts ?? {}));
  } catch {
    return new Set();
  }
}

function t(locale: Locale, ru: string, en: string) {
  return locale === "en" ? en : ru;
}

async function assertAgentTerminalPermission(actorAgentId: number | undefined, commandName: string) {
  if (!actorAgentId) return;
  const [agent] = await db.select({ role: agents.role }).from(agents).where(eq(agents.id, actorAgentId)).limit(1);
  if (!agent) throw new Error("Agent not found");
  if (agent.role !== "main" && commandName !== "git") {
    throw new Error("Advisors may only use read-only git inspection commands");
  }
}

export async function runSandboxCommand(command: string, locale: Locale = "ru", options?: { timeoutMs?: number; actorAgentId?: number }) {
  const root = await getWorkspaceRoot();
  const allowedNpmScripts = await loadAllowedNpmScripts(root);
  const parsed = parseCommand(command, { allowedNpmScripts });
  await assertAgentTerminalPermission(options?.actorAgentId, parsed.name);
  const timeoutMs = Math.max(1_000, Math.min(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, 300_000));
  const isWindowsCmd = process.platform === "win32" && parsed.executable.toLowerCase().endsWith(".cmd");
  const executable = isWindowsCmd ? (process.env.ComSpec ?? "cmd.exe") : parsed.executable;
  const args = isWindowsCmd
    ? ["/d", "/s", "/c", [parsed.executable, ...parsed.args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ")]
    : parsed.args;

  const result = await new Promise<{ output: string; status: string; exitCode: number | null }>((resolve) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, CI: "1" },
      shell: false,
      windowsHide: true,
    });
    let output = "";
    let timedOut = false;
    let truncated = false;
    const append = (chunk: Buffer | string) => {
      if (output.length >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return;
      }
      output += chunk.toString().slice(0, MAX_OUTPUT_BYTES - output.length);
      if (output.length >= MAX_OUTPUT_BYTES) truncated = true;
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ output: error.message, status: "error", exitCode: null });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const suffix = truncated ? "\n[output truncated]" : "";
      if (timedOut) resolve({ output: `${output}${suffix}\n[command timed out after ${timeoutMs}ms]`, status: "timeout", exitCode: code });
      else resolve({ output: `${output}${suffix}`.trimEnd(), status: code === 0 ? "success" : "failed", exitCode: code });
    });
  });

  const displayCommand = command.trim();
  await db.insert(terminalEntries).values({ command: displayCommand, output: result.output, status: result.status });

  if (result.status === "error") throw new Error(result.output || t(locale, "Не удалось запустить команду", "Failed to start command"));
  return { ...result, root };
}
