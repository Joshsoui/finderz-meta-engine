CREATE TABLE `action_recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` text NOT NULL,
	`action` text NOT NULL,
	`score` integer NOT NULL,
	`reasoning` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_action_recs_opportunity_score` ON `action_recommendations` (`opportunity_id`,`score`);--> statement-breakpoint
CREATE TABLE `actions_taken` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'chosen' NOT NULL,
	`content_piece_id` text,
	`campaign_id` text,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_actions_taken_opportunity` ON `actions_taken` (`opportunity_id`);--> statement-breakpoint
CREATE TABLE `signal_provider_state` (
	`provider` text PRIMARY KEY NOT NULL,
	`last_run_at` text,
	`last_run_scanned` integer DEFAULT 0 NOT NULL,
	`last_run_inserted` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
ALTER TABLE `opportunities` DROP COLUMN `recommended_channels_json`;