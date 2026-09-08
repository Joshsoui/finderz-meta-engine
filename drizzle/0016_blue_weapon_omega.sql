CREATE TABLE `account_spend_daily_log` (
	`date` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
