CREATE TABLE `gallery_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
