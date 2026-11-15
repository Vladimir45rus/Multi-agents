CREATE TABLE `visual_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`selector` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`action` text DEFAULT 'move' NOT NULL,
	`offset_x` real DEFAULT 0 NOT NULL,
	`offset_y` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`page_url` text DEFAULT '' NOT NULL,
	`dom_path` text DEFAULT '' NOT NULL,
	`styles` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visual_edits_created_at_idx` ON `visual_edits` (`created_at`);
