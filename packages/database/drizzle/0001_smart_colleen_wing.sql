CREATE TABLE `referrals` (
	`id` varchar(128) NOT NULL,
	`referrer_phone` varchar(20) NOT NULL,
	`referred_phone` varchar(20) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`reward_amount` bigint NOT NULL DEFAULT 50,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrer_phone_users_phone_fk` FOREIGN KEY (`referrer_phone`) REFERENCES `users`(`phone`) ON DELETE no action ON UPDATE no action;