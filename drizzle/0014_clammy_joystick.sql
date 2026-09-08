CREATE TABLE `indeed_spend_log` (
	`date` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
