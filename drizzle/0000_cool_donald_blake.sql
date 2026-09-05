CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`location` text NOT NULL,
	`salary` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`fee_cents` integer NOT NULL,
	`max_budget_cents` integer NOT NULL,
	`spent_cents` integer DEFAULT 0 NOT NULL,
	`target_cpl_cents` integer NOT NULL,
	`primary_text` text NOT NULL,
	`headline` text NOT NULL,
	`description_text` text NOT NULL,
	`usps_json` text NOT NULL,
	`creative_prompt` text NOT NULL,
	`meta_campaign_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_status_updated` ON `campaigns` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `metric_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`leads` integer DEFAULT 0 NOT NULL,
	`spend_cents` integer DEFAULT 0 NOT NULL,
	`frequency_hundredths` integer DEFAULT 0 NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_metrics_campaign_recorded` ON `metric_snapshots` (`campaign_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `optimization_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`rule` text NOT NULL,
	`severity` text NOT NULL,
	`recommendation` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_actions_campaign_status` ON `optimization_actions` (`campaign_id`,`status`);--> statement-breakpoint
PRAGMA optimize;
