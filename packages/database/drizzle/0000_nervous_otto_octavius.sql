CREATE TABLE `memories` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(20),
	`org_id` varchar(64),
	`category` varchar(50) NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`importance` bigint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`balance_kobo` bigint NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`region` varchar(10) NOT NULL DEFAULT 'NG',
	`sector` varchar(50) NOT NULL DEFAULT 'commerce',
	`whatsapp_phone_id` varchar(100),
	`timezone` varchar(50) NOT NULL DEFAULT 'Africa/Lagos',
	`config` json,
	`system_prompt` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` varchar(128) NOT NULL,
	`user_id` varchar(20),
	`org_id` varchar(64),
	`type` varchar(50) NOT NULL,
	`amount` decimal(20,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'NGN',
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`reference` varchar(255),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`phone` varchar(20) NOT NULL,
	`name` varchar(255),
	`energy_credits` bigint NOT NULL DEFAULT 100,
	`vault_balance_naira` decimal(20,2) NOT NULL DEFAULT '0.00',
	`pin_hash` varchar(255),
	`pin_lock_until` timestamp,
	`pin_attempts` bigint NOT NULL DEFAULT 0,
	`context` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_phone` PRIMARY KEY(`phone`)
);
--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_user_id_users_phone_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`phone`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_user_id_users_phone_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`phone`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;