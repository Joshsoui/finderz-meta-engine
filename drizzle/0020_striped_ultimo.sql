CREATE TABLE `creative_analysis_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_run_at` text,
	`last_run_campaigns_analyzed` integer DEFAULT 0 NOT NULL,
	`last_run_patterns_found` integer DEFAULT 0 NOT NULL,
	`last_run_error` text
);
--> statement-breakpoint
CREATE TABLE `creative_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`theme` text NOT NULL,
	`description` text NOT NULL,
	`suggested_reuse` text NOT NULL,
	`evidence_campaign_ids_json` text NOT NULL,
	`avg_cpl_cents` integer,
	`portfolio_avg_cpl_cents` integer,
	`confidence` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_creative_insights_run` ON `creative_insights` (`run_id`);