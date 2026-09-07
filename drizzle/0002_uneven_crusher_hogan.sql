CREATE TABLE `pipeline_vacancies` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_url` text,
	`title` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`employment_type` text DEFAULT '' NOT NULL,
	`salary` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`fee_cents` integer,
	`status` text DEFAULT 'new' NOT NULL,
	`campaign_id` text,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pipeline_status_updated` ON `pipeline_vacancies` (`status`,`updated_at`);