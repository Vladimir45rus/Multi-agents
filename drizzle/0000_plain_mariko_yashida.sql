CREATE TABLE IF NOT EXISTS `agent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`type` text NOT NULL,
	`agent_id` integer,
	`agent_name` text NOT NULL,
	`role` text NOT NULL,
	`file_path` text,
	`line` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`arguments` text DEFAULT '' NOT NULL,
	`proposal` text DEFAULT '' NOT NULL,
	`iteration` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`model` text NOT NULL,
	`role` text DEFAULT 'advisor' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`skill` text DEFAULT '' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `analysis_findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`line` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_channel` text DEFAULT 'group' NOT NULL,
	`sender_type` text NOT NULL,
	`agent_name` text,
	`content` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `file_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`previous_content` text NOT NULL,
	`actor_agent_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `orchestrator_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`task` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'FAILED' NOT NULL,
	`changed_files` text DEFAULT '[]' NOT NULL,
	`check_results` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`iterations` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`language` text DEFAULT 'plaintext' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `project_files_path_unique` ON `project_files` (`path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `terminal_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`command` text NOT NULL,
	`output` text NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workspace_file_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_path` text NOT NULL,
	`previous_content` text DEFAULT '' NOT NULL,
	`operation` text NOT NULL,
	`backup_path` text DEFAULT '' NOT NULL,
	`actor_agent_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workspace_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_name` text DEFAULT 'Multi-Agent Code Studio' NOT NULL,
	`project_root` text DEFAULT '' NOT NULL,
	`main_coder_agent_id` integer,
	`api_keys` text DEFAULT '{}' NOT NULL,
	`github_token` text DEFAULT '' NOT NULL,
	`github_repo` text DEFAULT '' NOT NULL,
	`github_auto_push` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
