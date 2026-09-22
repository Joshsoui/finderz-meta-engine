CREATE TABLE `ai_usage_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`related_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`succeeded` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_purpose_created` ON `ai_usage_log` (`purpose`,`created_at`);--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`services_json` text DEFAULT '[]' NOT NULL,
	`target_audiences_json` text DEFAULT '[]' NOT NULL,
	`regions_json` text DEFAULT '[]' NOT NULL,
	`tone_of_voice` text DEFAULT '' NOT NULL,
	`usps_json` text DEFAULT '[]' NOT NULL,
	`social_channels_json` text DEFAULT '{}' NOT NULL,
	`customer_sectors_json` text DEFAULT '[]' NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`channel` text NOT NULL,
	`content_json` text NOT NULL,
	`source_urls_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`campaign_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_content_opportunity_channel` ON `content_pieces` (`opportunity_id`,`channel`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`signal_id` text NOT NULL,
	`company_id` text NOT NULL,
	`title` text NOT NULL,
	`score` integer NOT NULL,
	`relevance_score` integer NOT NULL,
	`timeliness_score` integer NOT NULL,
	`audience_fit_score` integer NOT NULL,
	`regional_fit_score` integer NOT NULL,
	`commercial_potential_score` integer NOT NULL,
	`content_potential_score` integer NOT NULL,
	`recruitment_potential_score` integer NOT NULL,
	`why_now` text NOT NULL,
	`matching_campaign_ids_json` text DEFAULT '[]' NOT NULL,
	`recommended_channels_json` text DEFAULT '[]' NOT NULL,
	`is_appropriate` integer DEFAULT true NOT NULL,
	`guardrail_reason` text,
	`status` text DEFAULT 'opportunity' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_opportunities_status_score` ON `opportunities` (`status`,`score`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_company_created` ON `opportunities` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `opportunity_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`source_url` text,
	`dedupe_key` text NOT NULL,
	`published_at` text,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`regions_json` text DEFAULT '[]' NOT NULL,
	`companies_json` text DEFAULT '[]' NOT NULL,
	`industries_json` text DEFAULT '[]' NOT NULL,
	`job_categories_json` text DEFAULT '[]' NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`raw_data_json` text,
	`passed_cheap_filter` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signals_dedupe_key_unique` ON `signals` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_signals_status_detected` ON `signals` (`status`,`detected_at`);--> statement-breakpoint
CREATE INDEX `idx_signals_provider_detected` ON `signals` (`provider`,`detected_at`);