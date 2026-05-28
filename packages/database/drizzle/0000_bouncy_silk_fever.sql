CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS "cart_items" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"chat_id" varchar(128) NOT NULL,
	"product_id" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"price" numeric(20, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chats" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"org_id" varchar(64),
	"user_phone" varchar(20),
	"user_name" varchar(255),
	"is_opted_out" boolean DEFAULT false NOT NULL,
	"is_cart_active" boolean DEFAULT false NOT NULL,
	"last_cart_update_at" timestamp,
	"last_nudge_at" timestamp,
	"last_message_at" timestamp,
	"summary" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_jobs" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(20) NOT NULL,
	"org_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"instruction" text NOT NULL,
	"schedule" varchar(100) NOT NULL,
	"sector_pack" varchar(50) DEFAULT 'ResearchPack' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"energy_budget" integer DEFAULT 5 NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"last_result" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(20),
	"org_id" varchar(64),
	"category" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"embedding" text,
	"importance" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"chat_id" varchar(128) NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(20) DEFAULT 'text' NOT NULL,
	"reasoning" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"balance_kobo" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"region" varchar(10) DEFAULT 'NG' NOT NULL,
	"sector" varchar(50) DEFAULT 'commerce' NOT NULL,
	"whatsapp_phone_id" varchar(100),
	"proxy_url" varchar(255),
	"timezone" varchar(50) DEFAULT 'Africa/Lagos' NOT NULL,
	"config" jsonb,
	"system_prompt" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referrals" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"referrer_phone" varchar(20) NOT NULL,
	"referred_phone" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reward_amount" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(20),
	"org_id" varchar(64),
	"type" varchar(50) NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reference" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"phone" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"energy_credits" integer DEFAULT 100 NOT NULL,
	"vault_balance_kobo" bigint DEFAULT 0 NOT NULL,
	"pin_hash" varchar(255),
	"pin_lock_until" timestamp,
	"pin_attempts" integer DEFAULT 0 NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_user_id_users_phone_fk" FOREIGN KEY ("user_id") REFERENCES "users"("phone") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_phone_fk" FOREIGN KEY ("user_id") REFERENCES "users"("phone") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_phone_users_phone_fk" FOREIGN KEY ("referrer_phone") REFERENCES "users"("phone") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_phone_fk" FOREIGN KEY ("user_id") REFERENCES "users"("phone") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
