CREATE TABLE `creative_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`headline` text NOT NULL,
	`primary_text` text NOT NULL,
	`description_text` text NOT NULL,
	`usps_json` text NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_creative_variants_campaign` ON `creative_variants` (`campaign_id`);