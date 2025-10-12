CREATE TABLE `search_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT NULL,
	`original_query` text NOT NULL,
	`generated_keywords` text NOT NULL,
	`model` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
