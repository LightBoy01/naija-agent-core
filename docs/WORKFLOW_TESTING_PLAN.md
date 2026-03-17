# MVP Workflow Testing Plan 🧪

This document outlines the testing strategy for the Naija Agent Core MVP, categorizing workflows and mapping them to existing or new test scripts.

## 1. Core Messaging & AI 🤖
**Goal:** Verify that the bot receives messages, understands intent, and replies correctly.
*   **Workflows:**
    *   Basic Chat (Text in -> Text out)
    *   Tool Usage (Price check, Stock check)
    *   Multi-turn Conversation (Context retention)
*   **Test Script:** `scripts/test-messaging-core.ts` (To be created)

## 2. Commerce & Payments 💳
**Goal:** Verify the money flow: Orders, Payments, and Balance Deductions.
*   **Workflows:**
    *   Create Order (Add to cart -> Checkout)
    *   Verify Payment (Mock/Manual) - *Bridge Discontinued*
    *   Check Balance (Wallet deduction logic)
*   **Test Script:** `scripts/test-commerce-flow.ts` (To be created)

## 3. Onboarding & Tenant Management 🏢
**Goal:** Verify new business setup and configuration.
*   **Workflows:**
    *   New Tenant Signup (Simulated)
    *   Configuration Update (Set params)
    *   Staff Management (Add/Remove Staff)
*   **Test Scripts:**
    *   `scripts/test-onboarding-3.ts` (Existing)
    *   `scripts/seed-tenant-test.ts` (Existing)

## 4. System Stability & Security 🛡️
**Goal:** Verify rate limiting, error handling, and security guards.
*   **Workflows:**
    *   Rate Limiting (Spam protection)
    *   Price Guard (Hallucination prevention)
    *   Error Recovery (Worker restart)
*   **Test Scripts:**
    *   `scripts/test-price-guard.ts` (Existing)
    *   `scripts/red-team-verification.ts` (Existing)

## 5. Scheduled Tasks ⏰
**Goal:** Verify cron jobs and background workers.
*   **Workflows:**
    *   Daily Reports
    *   Reminders
    *   Inventory Alerts
*   **Test Script:** `scripts/schedule-reports.ts` (Existing)

---

**Next Steps:**
1.  Execute existing tests to baseline current health.
2.  Create missing test scripts for Core Messaging and Commerce.
3.  Document results in `docs/TEST_RESULTS.md`.
