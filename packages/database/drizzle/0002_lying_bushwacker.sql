CREATE TABLE `messages` (
	`id` varchar(128) NOT NULL,
	`chat_id` varchar(128) NOT NULL,
	`role` varchar(20) NOT NULL,
	`content` text NOT NULL,
	`type` varchar(20) NOT NULL DEFAULT 'text',
	`reasoning` text,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
