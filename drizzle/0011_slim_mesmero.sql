CREATE TABLE `meta_sync_health` (
	`id` text PRIMARY KEY NOT NULL,
	`last_success_at` text,
	`last_error_at` text,
	`last_error_message` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `meta_ad_id` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `campaign_duration_days` integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `live_since` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `last_creative_check_at` text;