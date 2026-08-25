import "server-only";

import type { GatewayMessage } from "@/lib/provider-gateway";
import {
  readWorkspaceFile,
  searchWorkspaceFiles,
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  listWorkspaceTree,
  applyWorkspacePatch,
} from "@/lib/workspace-files";

type ToolCallHandler = (args: Record<string, unknown>, mainAgentId: number) => Promise<string>;

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: ToolCallHandler;
};

// ── role → allowed tool names ────────────────────────────────────────────

const MAIN_TOOLS = new Set([
  "read_file",
  "write_file",
  "create_file",
  "delete_file",
  "list_files",
  "search_code",
  "run_command",
] as const);

const ADVISOR_TOOLS = new Set([
  "read_file",
  "list_files",
  "search_code",
] as const);

const OBSERVER_TOOLS = new Set([
  "read_file",
  "list_files",
] as const);

export function allowedToolNames(role: string): Set<string> {
  if (role === "main") return MAIN_TOOLS as Set<string>;
  if (role === "observer") return OBSERVER_TOOLS as Set<string>;
  if (role === "uiux") return OBSERVER_TOOLS as Set<string>;
  return ADVISOR_TOOLS as Set<string>;
}

// ── Tool implementations ──────────────────────────────────────────────────

async function toolReadFile(args: Record<string, unknown>, _agentId: number) {
  const filePath = String(args.path ?? "").trim();
  if (!filePath) return "Error: path is required.";
  try {
    const file = await readWorkspaceFile(filePath);
    return `File: ${file.path}` + "\n\n" + file.content;
  } catch (e) {
    return "Error reading file: " + (e as Error).message;
  }
}

async function toolWriteFile(args: Record<string, unknown>, agentId: number) {
  const filePath = String(args.path ?? "").trim();
  const content = String(args.content ?? "");
  if (!filePath) return "Error: path is required.";
  if (!content) return "Error: content is required.";
  try {
    await applyWorkspacePatch(agentId, [
      { path: filePath, operation: "modify", content },
    ]);
    return "File " + filePath + " written successfully.";
  } catch (e) {
    return "Error writing file: " + (e as Error).message;
  }
}

async function toolCreateFile(args: Record<string, unknown>, agentId: number) {
  const filePath = String(args.path ?? "").trim();
  const content = String(args.content ?? "");
  if (!filePath) return "Error: path is required.";
  try {
    await createWorkspaceEntry(agentId, filePath, "file", content);
    return "File " + filePath + " created successfully.";
  } catch (e) {
    return "Error creating file: " + (e as Error).message;
  }
}

async function toolDeleteFile(args: Record<string, unknown>, agentId: number) {
  const filePath = String(args.path ?? "").trim();
  if (!filePath) return "Error: path is required.";
  try {
    await deleteWorkspaceEntry(agentId, filePath);
    return "File " + filePath + " deleted successfully.";
  } catch (e) {
    return "Error deleting file: " + (e as Error).message;
  }
}

async function toolListFiles(_args: Record<string, unknown>, _agentId: number) {
  try {
    const tree = await listWorkspaceTree();
    const lines = tree.files.slice(0, 200).map((f) => f.path + "  (" + f.language + ", " + f.size + " bytes)");
    return "Project files (" + tree.files.length + " total, showing first " + lines.length + "):\n\n" + lines.join("\n");
  } catch (e) {
    return "Error listing files: " + (e as Error).message;
  }
}

async function toolSearchCode(args: Record<string, unknown>, _agentId: number) {
  const query = String(args.query ?? "").trim();
  if (!query) return "Error: query is required.";
  try {
    const results = await searchWorkspaceFiles(query);
    if (!results.length) return "No matches found.";
    return results.slice(0, 30).map((r) => r.path + ":" + r.line + ": " + r.text).join("\n");
  } catch (e) {
    return "Error searching: " + (e as Error).message;
  }
}

async function toolRunCommand(args: Record<string, unknown>, _agentId: number) {
  const command = String(args.command ?? "").trim();
  if (!command) return "Error: command is required.";
  try {
    const { runSandboxCommand } = await import("@/lib/terminal-sandbox");
    const result = await runSandboxCommand(command, "ru", { timeoutMs: 30_000 });
    return result.output || ("Command completed with status: " + result.status);
  } catch (e) {
    return "Error running command: " + (e as Error).message;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────

const TOOL_REGISTRY: Record<string, ToolDef> = {
  read_file: {
    name: "read_file",
    description: "Read the content of a file. Use this to view code before making changes.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file relative to the project root" },
      },
      required: ["path"],
    },
    execute: toolReadFile,
  },
  write_file: {
    name: "write_file",
    description: "Write or overwrite a file with new content. Always read the file first if editing.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file relative to the project root" },
        content: { type: "string", description: "Complete new content of the file" },
      },
      required: ["path", "content"],
    },
    execute: toolWriteFile,
  },
  create_file: {
    name: "create_file",
    description: "Create a new file. Fails if the file already exists.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path for the new file relative to the project root" },
        content: { type: "string", description: "Initial content of the new file" },
      },
      required: ["path"],
    },
    execute: toolCreateFile,
  },
  delete_file: {
    name: "delete_file",
    description: "Delete a file. Use with caution.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file relative to the project root" },
      },
      required: ["path"],
    },
    execute: toolDeleteFile,
  },
  list_files: {
    name: "list_files",
    description: "List all files in the project. Useful for understanding the project structure.",
    parameters: { type: "object", properties: {} },
    execute: toolListFiles,
  },
  search_code: {
    name: "search_code",
    description: "Search for text across all files in the project. Returns file path, line number, and matching line.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for (case-insensitive)" },
      },
      required: ["query"],
    },
    execute: toolSearchCode,
  },
  run_command: {
    name: "run_command",
    description: "Run a read-only terminal command (npm test, npx tsc, git status, etc.). Only safe commands are allowed.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to run (e.g., npm test, npx tsc --noEmit)" },
      },
      required: ["command"],
    },
    execute: toolRunCommand,
  },
};

// ── Public API ────────────────────────────────────────────────────────────

/** Return OpenAI-format tool definitions for the agent's role. */
export function getToolDefinitions(role: string): Array<Record<string, unknown>> {
  const allowed = allowedToolNames(role);
  return Object.values(TOOL_REGISTRY)
    .filter((t) => allowed.has(t.name))
    .map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
}

/** Execute a tool call and return the result as a string. */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  role: string,
  mainAgentId: number,
): Promise<string> {
  const allowed = allowedToolNames(role);
  if (!allowed.has(name)) {
    return "Error: tool \"" + name + "\" is not available for your role (" + role + "). You can use: " + [...allowed].join(", ") + ".";
  }

  const tool = TOOL_REGISTRY[name];
  if (!tool) return "Error: unknown tool \"" + name + "\". Available: " + Object.keys(TOOL_REGISTRY).join(", ") + ".";

  return tool.execute(args, mainAgentId);
}

/** Check if the assistant response contains a tool call and extract it. */
export function parseToolCall(
  content: string,
): { name: string; arguments: Record<string, unknown> } | null {
  // H5 fix: only a pure JSON document counts as a tool call. Descriptive prose
  // that merely contains a JSON snippet (prompt injection from read files,
  // code samples, etc.) must never trigger tool execution.
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  if (trimmed.length > 100_000) return null;

  // Try JSON format (OpenAI-style tool call results)
  try {
    const obj = JSON.parse(trimmed);
    if (obj?.function?.name) {
      const args = typeof obj.function.arguments === "string"
        ? JSON.parse(obj.function.arguments)
        : obj.function.arguments;
      return { name: obj.function.name as string, arguments: args as Record<string, unknown> };
    }
    if (obj?.name && obj?.arguments) {
      return { name: obj.name as string, arguments: obj.arguments as Record<string, unknown> };
    }
  } catch { /* not JSON */ }

  return null;
}

/** Build a user message representing the tool result for the next LLM call. */
export function toolResultMessage(name: string, result: string): GatewayMessage {
  return {
    role: "user" as GatewayMessage["role"],
    content: "[TOOL RESULT: " + name + "]\n\n" + result,
  };
}