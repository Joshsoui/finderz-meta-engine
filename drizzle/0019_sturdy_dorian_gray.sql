ALTER TABLE `opportunities` ADD `urgency` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `decay_rate_per_day` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `optimal_action_before_at` text;