ALTER TABLE workspace_settings ADD COLUMN ngrok_token TEXT NOT NULL DEFAULT '';
ALTER TABLE workspace_settings ADD COLUMN ngrok_url TEXT NOT NULL DEFAULT '';