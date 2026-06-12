CREATE TABLE `user_monthly_dopa` (
	`user_id` text NOT NULL,
	`month` text NOT NULL,
	`dopa` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `month`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `streak_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_active_date` text;--> statement-breakpoint
ALTER TABLE `users` ADD `lifetime_dopa` integer DEFAULT 0 NOT NULL;