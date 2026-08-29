import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AgentIdentity } from "@/lib/agent-identity";

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceName: text("workspace_name").notNull().default("Multi-Agent Code Studio"),
  projectRoot: text("project_root").notNull().default(""),
  mainCoderAgentId: integer("main_coder_agent_id"),
  apiKeys: text("api_keys", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  githubToken: text("github_token").notNull().default(""),
  githubRepo: text("github_repo").notNull().default(""),
  githubAutoPush: integer("github_auto_push", { mode: "boolean" }).notNull().default(false),
  autoApprove: integer("auto_approve", { mode: "boolean" }).notNull().default(false),
  mobileAuthToken: text("mobile_auth_token").notNull().default(""),
  localtunnelEnabled: integer("localtunnel_enabled", { mode: "boolean" }).notNull().default(false),
  localtunnelUrl: text("localtunnel_url").notNull().default(""),
  telegramToken: text("telegram_token").notNull().default(""),
  telegramChatId: text("telegram_chat_id").notNull().default(""),
  fallbackModels: text("fallback_models", { mode: "json" }).$type<string[]>().notNull().default([]),
  previewCommand: text("preview_command").notNull().default("npm run dev"),
  previewPort: integer("preview_port").notNull().default(4173),
  previewUrl: text("preview_url").notNull().default(""),
  projectTemplate: text("project_template").notNull().default(""),
  projectTemplatePrompt: text("project_template_prompt").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  baseUrl: text("base_url").notNull().default(""),
  model: text("model").notNull(),
  // Custom-provider support: each agent may carry its own encrypted API key,
  // enabling any number of unknown/self-hosted providers (one agent each).
  apiKey: text("api_key").notNull().default(""),
  role: text("role").notNull().default("advisor"),
  description: text("description").notNull().default(""),
  skill: text("skill").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  color: text("color").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

// User-defined OpenAI-compatible providers (unlimited): each row is one
// service endpoint with its own key, model list and custom headers.
export const customProviders = sqliteTable("custom_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerId: text("provider_id").notNull().default(""),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull().default(""),
  models: text("models", { mode: "json" }).$type<Array<{ id: string; name: string }>>().notNull().default([]),
  headers: text("headers", { mode: "json" }).$type<Array<{ name: string; value: string }>>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
}, (table) => [
  index("custom_providers_provider_id_idx").on(table.providerId),
]);

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
    .$type<{
      attachments?: Array<{ type: "image" | "link"; url?: string; title?: string; previewText?: string; name?: string }>;
      identity?: AgentIdentity;
    }>()
    .notNull()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
}, (table) => [
  // Fix: hot-path indexes for chat history lookups (channel filter + ordering).
  index("chat_messages_channel_id_idx").on(table.chatChannel, table.id),
]);

export const systemEvents = sqliteTable("system_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: text("level").notNull().default("info"),
  source: text("source").notNull(),
  message: text("message").notNull(),
  details: text("details").notNull().default(""),
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
}, (table) => [
  // Fix: rollback lookups filter by file id.
  index("file_history_file_id_idx").on(table.fileId),
]);

export const workspaceFileHistory = sqliteTable("workspace_file_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filePath: text("file_path").notNull(),
  previousContent: text("previous_content").notNull().default(""),
  operation: text("operation").notNull(),
  backupPath: text("backup_path").notNull().default(""),
  actorAgentId: integer("actor_agent_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
}, (table) => [
  // Fix: workspace rollback selects the latest entry per path.
  index("workspace_file_history_file_path_idx").on(table.filePath),
]);

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
}, (table) => [
  // Fix: orchestrator state/recovery fetches events per task.
  index("agent_events_task_id_idx").on(table.taskId),
]);

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
