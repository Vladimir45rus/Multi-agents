ALTER TABLE `custom_providers` ADD `provider_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_providers` ADD `headers` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `custom_providers_provider_id_idx` ON `custom_providers` (`provider_id`);