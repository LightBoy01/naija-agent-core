-- Migration 0002: Add missing columns missing from the initial schema migration
--
-- The TypeScript schema defines these columns but they were never created
-- in the database. This migration brings the database in sync with the schema.
-- All ALTER TABLE statements use IF NOT EXISTS for safe re-runs.

-- ============================
-- organizations: onboarding + deployment columns
-- ============================
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'ACTIVE' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "deployment_model" varchar(50) DEFAULT 'SHARED' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cost_per_reply" integer DEFAULT 3300 NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_step" varchar(50) DEFAULT 'NONE' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_data" jsonb;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp;

-- ============================
-- users: family, goals, preferences
-- ============================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "family" jsonb;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "goals" jsonb;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb;

-- ============================
-- transactions: sms_id, verified_at, confirmed_at
-- ============================
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "sms_id" varchar(128);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "verified_at" timestamp;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp;

-- ============================
-- chats: last_admin_auth_at
-- ============================
ALTER TABLE "chats" ADD COLUMN IF NOT EXISTS "last_admin_auth_at" timestamp;
