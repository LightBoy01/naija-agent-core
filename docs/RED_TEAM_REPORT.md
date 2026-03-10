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

## Session 28 Audit - Security & Stability (2026-03-09)
**Reviewer:** Gemini CLI (Senior Reviewer)

### Critical Vulnerabilities & Fixes

#### 7. Tool Definition Syntax Error (HIGH SEVERITY)
*   **Location:** `apps/worker/src/tools.ts`
*   **Issue:** A missing comma between tool objects in the `isAdmin` conditional block caused a compilation failure.
*   **Fix:** Surgically corrected the syntax error and verified with a successful build.

#### 8. Decentralized Tool Security (MEDIUM SEVERITY)
*   **Location:** `apps/worker/src/index.ts` & `apps/worker/src/tools.ts`
*   **Issue:** The "Boss-Only" security list was hardcoded in the Worker loop, separate from the tool definitions. This created a "Bypass Risk" if new high-value tools were added to `tools.ts` but forgotten in the `index.ts` check.
*   **Fix:** Implemented a centralized `BOSS_ONLY_TOOLS` array in `tools.ts`. The Worker now imports this list and performs mandatory PIN verification for any tool on that list, ensuring "Security by Default" for all management tools.

#### 9. MFA Delivery Resilience
*   **Location:** `apps/web/app/auth/actions.ts`
*   **Issue:** Hardcoded fallback to `localhost:3000` for the internal API URL risked locking out production users if the `API_URL` environment variable was missing or misconfigured.
*   **Fix:** Hardened the API URL resolution logic to check both `API_URL` and `NEXT_PUBLIC_API_URL`, and added detailed error logging for failed MFA deliveries.
