CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`meta_lead_id` text NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`quality` text DEFAULT 'unrated' NOT NULL,
	`received_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_meta_lead_id_unique` ON `leads` (`meta_lead_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_campaign_received` ON `leads` (`campaign_id`,`received_at`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `meta_lead_form_id` text;