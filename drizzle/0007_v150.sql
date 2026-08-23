ALTER TABLE workspace_settings ADD COLUMN telegram_token TEXT NOT NULL DEFAULT '';
ALTER TABLE workspace_settings ADD COLUMN telegram_chat_id TEXT NOT NULL DEFAULT '';
ALTER TABLE workspace_settings ADD COLUMN fallback_models TEXT NOT NULL DEFAULT '[]';
ALTER TABLE workspace_settings ADD COLUMN preview_command TEXT NOT NULL DEFAULT 'npm run dev';
ALTER TABLE workspace_settings ADD COLUMN preview_port INTEGER NOT NULL DEFAULT 4173;
ALTER TABLE workspace_settings ADD COLUMN preview_url TEXT NOT NULL DEFAULT '';
ALTER TABLE workspace_settings ADD COLUMN project_template TEXT NOT NULL DEFAULT '';
ALTER TABLE workspace_settings ADD COLUMN project_template_prompt TEXT NOT NULL DEFAULT '';
