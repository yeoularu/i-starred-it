CREATE TABLE `repository_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`search_query_id` text NOT NULL,
	`liked_owner` text NOT NULL,
	`liked_name` text NOT NULL,
	`liked_rank` integer NOT NULL,
	`compressed_snapshot` blob NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_query_id`) REFERENCES `search_queries`(`id`) ON UPDATE no action ON DELETE cascade
);
