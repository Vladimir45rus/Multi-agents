ALTER TABLE workspace_settings ADD COLUMN localtunnel_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_settings ADD COLUMN localtunnel_url TEXT NOT NULL DEFAULT '';
