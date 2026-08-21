import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceName: text("workspace_name").notNull().default("Multi-Agent Code Studio"),
  projectRoot: text("project_root").notNull().default(""),
  mainCoderAgentId: integer("main_coder_agent_id"),
  apiKeys: text("api_keys", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  githubToken: text("github_token").notNull().default(""),
  githubRepo: text("github_repo").notNull().default(""),
  githubAutoPush: integer("github_auto_push", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  baseUrl: text("base_url").notNull().default(""),
  model: text("model").notNull(),
  role: text("role").notNull().default("advisor"),
  description: text("description").notNull().default(""),
  skill: text("skill").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const projectFiles = sqliteTable("project_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  language: text("language").notNull().default("plaintext"),
  content: text("content").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatChannel: text("chat_channel").notNull().default("group"),
  senderType: text("sender_type").notNull(),
  agentName: text("agent_name"),
  content: text("content").notNull(),
  metadata: text("metadata", { mode: "json" })
    .$type<{ attachments?: Array<{ type: "image" | "link"; url?: string; title?: string; previewText?: string; name?: string }> }>()
    .notNull()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const terminalEntries = sqliteTable("terminal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  command: text("command").notNull(),
  output: text("output").notNull(),
  status: text("status").notNull().default("success"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const analysisFindings = sqliteTable("analysis_findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filePath: text("file_path").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  line: integer("line"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const fileHistory = sqliteTable("file_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileId: integer("file_id").notNull(),
  filePath: text("file_path").notNull(),
  previousContent: text("previous_content").notNull(),
  actorAgentId: integer("actor_agent_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const workspaceFileHistory = sqliteTable("workspace_file_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filePath: text("file_path").notNull(),
  previousContent: text("previous_content").notNull().default(""),
  operation: text("operation").notNull(),
  backupPath: text("backup_path").notNull().default(""),
  actorAgentId: integer("actor_agent_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const agentEvents = sqliteTable("agent_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id").notNull(),
  type: text("type").notNull(),
  agentId: integer("agent_id"),
  agentName: text("agent_name").notNull(),
  role: text("role").notNull(),
  filePath: text("file_path"),
  line: integer("line"),
  status: text("status").notNull().default("open"),
  arguments: text("arguments").notNull().default(""),
  proposal: text("proposal").notNull().default(""),
  iteration: integer("iteration").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const orchestratorReports = sqliteTable("orchestrator_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: text("task_id").notNull(),
  task: text("task").notNull().default(""),
  status: text("status").notNull().default("FAILED"),
  changedFiles: text("changed_files", { mode: "json" }).$type<string[]>().notNull().default([]),
  checkResults: text("check_results", { mode: "json" })
    .$type<Array<{ name: string; command: string; status: string; output: string }>>()
    .notNull()
    .default([]),
  summary: text("summary").notNull().default(""),
  iterations: integer("iterations").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});
