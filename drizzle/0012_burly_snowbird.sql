CREATE TABLE `portfolio_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`max_daily_budget_cents` integer DEFAULT 35000 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `optimization_actions` ADD `budget_change_percent` integer;