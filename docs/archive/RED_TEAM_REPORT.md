# Red Team Report - NaijaAgent Core
**Date:** February 28, 2026
**Reviewer:** Gemini CLI (Senior Reviewer)

## Executive Summary
The codebase is in a "Foundation" state. The core architecture (Fastify, BullMQ, Drizzle) is sound and follows the cost-optimized strategy. However, several critical security and reliability issues were identified that must be addressed before production deployment.

## Critical Vulnerabilities (Must Fix)

### 1. Insecure Default for Webhook Secret
*   **Location:** `apps/api/src/index.ts`
*   **Issue:** `process.env.WHATSAPP_APP_SECRET || ''` defaults to an empty string if the environment variable is missing.
*   **Risk:** If the secret is accidentally omitted in production, signature verification logic might behave unpredictably or fail open (depending on implementation specifics, though current logic seems to fail closed, passing an empty string to `crypto.createHmac` is still bad practice).
*   **Fix:** Fail startup if `WHATSAPP_APP_SECRET` is missing.

### 2. Missing Database Indexes
*   **Location:** `packages/database/src/schema.ts`
*   **Issue:** `chats` and `messages` tables lack indexes on frequently queried columns (`organization_id`, `whatsapp_user_id`, `chat_id`, `created_at`).
*   **Risk:** As data grows, queries will become linearly slower, causing timeouts in the "Slow Lane" worker.
*   **Fix:** Add compound indexes:
    *   `chats`: `(organization_id, whatsapp_user_id)`
    *   `messages`: `(chat_id, created_at desc)`

### 3. Memory Risk in Audio Processing
*   **Location:** `apps/worker/src/services/whatsapp.ts`
*   **Issue:** `downloadMedia` loads the entire file into a `Buffer` in memory.
*   **Risk:** A large file (or many concurrent small files) can cause Out-Of-Memory (OOM) crashes in the worker process.
*   **Fix:** Stream the audio directly to Gemini (if supported) or enforce a strict size limit (e.g., 5MB) before downloading.

## Medium Priority Issues

### 4. Hardcoded API Versions
*   **Location:** `apps/worker/src/services/whatsapp.ts`
*   **Issue:** WhatsApp API version `v18.0` is hardcoded.
*   **Fix:** Move to environment variable or constant configuration.

### 5. Lack of Explicit Retries
*   **Location:** `apps/worker/src/index.ts`
*   **Issue:** The worker catches errors and sends a fallback message immediately. Transient errors (network blips) should probably be retried before giving up.
*   **Fix:** Throw the error to let BullMQ retry (configure backoff), and only send the fallback message in a "final failure" handler (BullMQ `failed` event listener).

### 6. Loose Type Definitions
*   **Location:** `packages/types/src/index.ts`
*   **Issue:** `WhatsAppMessageSchema` uses `.or(z.string())` for `type`.
*   **Fix:** Define an enum for all supported WhatsApp message types.

## Recommendations for Phase 2

1.  **Environment Validation:** Use a library like `env-schema` or `zod` to validate all environment variables at application startup.
2.  **Structured Logging:** Replace `console.log` and `console.error` with a structured logger (e.g., `pino`) for better observability in production.
3.  **Rate Limiting:** Implement the loop detection and rate limiting strategy described in `MASTER_STRATEGY.md` immediately in the worker.

---

## Session 30 Audit - Empire Hardening (2026-03-12)
**Reviewer:** Gemini CLI (Senior Reviewer)

### Critical Vulnerabilities & Fixes (Phase 7)

#### 10. Redis Cascade Failure (HIGH SEVERITY)
*   **Location:** `apps/api/src/index.ts`
*   **Issue:** If the Redis service crashed or hit memory limits, the API would hang or crash while attempting to queue webhooks, leading to a "DDoS by Retries" from WhatsApp.
*   **Fix:** Implemented a **Redis Circuit Breaker**. The `whatsappQueue.add` call is now wrapped in a try/catch block. If the queue fails, the API returns a graceful `503 Service Unavailable`. This instructs WhatsApp to back off and retry later, preserving the API's stability.

#### 11. Business Continuity: Credit Churn Risk (MEDIUM SEVERITY)
*   **Location:** `apps/worker/src/index.ts`
*   **Issue:** High-volume merchants would run out of credits (Kobo) without warning, causing the bot to go silent. Customers perceived this as a "broken bot," leading to merchant churn.
*   **Fix:** Implemented a **Proactive Low Balance Nudge**. Bosses now receive a priority WhatsApp alert when their balance drops below **₦500 (50,000 Kobo)**. A 24-hour Redis-based cooldown prevents notification fatigue.

#### 12. Photoshop & AI Receipt Forgery (HIGH SEVERITY)
*   **Location:** `apps/worker/src/index.ts` & `apps/worker/src/tool-handlers.ts`
*   **Issue:** Fraudsters were using AI generators to create fake transfer receipts that bypassed simple rule-based visual checks.
*   **Fix:** 
    *   **Forensic Vision Prompt:** Upgraded the Gemini Vision instruction to a "Senior Forensic Analyst" persona, specifically checking for cloning artifacts, font-weight inconsistencies, and "ghosting" halos around digits.
    *   **Value Guard Protocol:** Hardened the `verify_transaction` tool to enforce a **"Wait for Bank Confirmation"** status for any transaction **> ₦10,000**. These high-value receipts now require an SMS Bridge signal or manual Boss approval, effectively killing the "Photoshop Bypass."

#### 13. Sovereign Transparency & "God Mode" Audit (MEDIUM SEVERITY)
*   **Location:** `apps/worker/src/tool-handlers.ts`
*   **Issue:** The Master Bot possessed `audit_tenant` and `broadcast_to_bosses` tools that could be used by HQ without the merchant's knowledge, violating the "Sovereign" privacy promise.
*   **Fix:** Implemented **Sovereign Transparency Logging**. Every administrative action performed by the Master Bot (Audits, Network Broadcasts) is now logged to the tenant's (or system's) immutable `system_logs` collection. Merchants can now audit the auditor.

---
**Security Posture:** **Production Hardened (Empire Era)**
**Next Focus:** Real-time Bank API Integration (Monnify/Paystack).

---

## Session 31 Audit - Phase 7 Stability & Logic (2026-03-12)
**Reviewer:** Gemini CLI (Senior Reviewer)

### Critical Logic & Security Fixes (Post-Audit)

#### 14. Price Guard Hallucination Bypass (HIGH SEVERITY)
*   **Location:** `apps/worker/src/handlers/messaging.ts`
*   **Issue:** The deterministic Price Guard regex was fragile. It missed common formats ("5k", "NGN", "4m") and incorrectly redacted words like "Run 5km" (false positive).
*   **Fix:** Developed a robust **RegExp Parser with Value Normalization**. It now handles Nigerian pricing slang, suffixes, and uses word boundaries to prevent false positives. This significantly reduces the risk of "Price Hallucination Fraud."

#### 15. Onboarding PIN Exposure (MEDIUM SEVERITY)
*   **Location:** `apps/worker/src/handlers/onboarding.ts`
*   **Issue:** During the temporary setup state machine, the merchant's 4-digit `adminPin` was stored in **plain text** in the Firestore `onboardingData` object.
*   **Fix:** Implemented **Immediate SHA-256 Hashing** during setup. The PIN is never stored raw, even in the temporary state, before final Bcrypt hashing.

#### 16. Security Tool "Logic Leak" (HIGH SEVERITY)
*   **Location:** `apps/worker/src/tool-handlers.ts`
*   **Issue:** Discrepancy between tool definitions and enforcement. Critical administrative tools like `web_search`, `activate_tenant`, and `get_network_stats` were listed as protected but had no enforcement logic, allowing potential unauthorized access without a PIN.
*   **Fix:** Synchronized the `AUTH_REQUIRED_TOOLS` list to enforce PIN-gatekeeping for **all** sensitive administrative tools.

#### 17. SMS Bridge Memory Drift & Duplication (HIGH SEVERITY)
*   **Location:** `legacy_bridge/android-sms/sms_bridge.py`
*   **Issue:** The bridge's deduplication set was naive and truncated non-deterministically after 1,000 alerts, leading to potential "Double-Verification" of bank alerts upon restarts or window shifts.
*   **Fix:** Replaced the set truncation with a **`deque` sliding window**. The bridge now deterministically tracks the last 1,000 unique alerts, preventing duplicate forwarding and financial double-counting.

#### 18. Cart Recovery Logic Drift (LOW SEVERITY)
*   **Location:** `apps/worker/src/handlers/cart.ts`
*   **Issue:** The recovery logic checked for payments using a `timestamp` field, but the logging layer used `verifiedAt`. This would cause the nudge system to ignore valid payments and "nag" customers who already finished their transaction.
*   **Fix:** Synchronized the query field to `verifiedAt`, ensuring accurate cart abandonment tracking.
