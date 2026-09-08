CREATE TABLE `account_spend_summary` (
	`id` text PRIMARY KEY NOT NULL,
	`today_cents` integer DEFAULT 0 NOT NULL,
	`last_7d_cents` integer DEFAULT 0 NOT NULL,
	`lifetime_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
