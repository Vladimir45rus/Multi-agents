CREATE INDEX IF NOT EXISTS `chat_messages_channel_id_idx` ON `chat_messages` (`chat_channel`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `file_history_file_id_idx` ON `file_history` (`file_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workspace_file_history_file_path_idx` ON `workspace_file_history` (`file_path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_events_task_id_idx` ON `agent_events` (`task_id`);
