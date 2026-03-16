# Codebase Review Report (March 14, 2026)

## 1. Executive Summary
Following the audit on March 13, 2026, significant improvements have been verified in the `naija-agent-core` codebase. The critical security (PIN hashing) and UX (Onboarding navigation) issues have been **resolved**. The infrastructure is robust, but a potential bottleneck remains in the **Sequential Worker** configuration.

## 2. Status of Previous Findings (March 13)

| Issue | Status | Notes |
| :--- | :--- | :--- |
| **Weak PIN Hashing** | **RESOLVED** | `apps/worker/src/handlers/onboarding.ts` now correctly uses `bcrypt.hash(pin, 10)` for both manual and AI-extracted PINs. |
| **Rigid Onboarding** | **RESOLVED** | A `#back` command with state restoration logic (`backMap`) has been implemented in `onboarding.ts`. |
| **Loose Types** | **RESOLVED** | `packages/types` now defines strict Zod schemas. `JobData` and `Message` interfaces updated to support 'template' and 'mimeType'. |
| **Price Guard Fragility** | **RESOLVED** | The Price Guard now checks **Historical Context** (Redis cache) and **Knowledge Base** prices, not just the current turn's tool outputs. |
| **Sequential Worker** | **RESOLVED** | `apps/worker/src/index.ts` now processes 5 jobs in parallel (`concurrency: 5`). |

## 3. Infrastructure Review

### A. Deployment Configuration
*   **Railway (`railway.toml`):** Correctly defines `worker` and `api` services with Docker builds.
*   **Firebase (`firebase.json`):** Standard configuration present.
*   **Dependencies:** Project relies on modern packages (`bullmq`, `ioredis`, `@google/generative-ai`, `next@15`).
*   **Stability:** System-wide build errors in `api` and `worker` services (Typescript casting and interface mismatches) have been resolved.

### B. Performance Risk Mitigation
*   **Worker Concurrency:** The Worker service now processes the `whatsapp-queue` with a concurrency factor of 5. This prevents single-task blocking (e.g., slow Image Vision tasks) from slowing down the entire system.
*   **Queue Health:** Verified all services build successfully with the new parallel processing configuration.


## 4. Recommendations & Next Steps

### Immediate Actions (Phase 7.4)
1.  **Enable Worker Concurrency:**
    *   Modify `apps/worker/src/index.ts` to set `concurrency: 5` (or higher, depending on CPU/Memory limits) in the `Worker` constructor.
    *   Ensure shared resources (like `redisClient` for rate limiting) handle concurrency correctly (Redis is atomic, so this is safe).

### Strategic Improvements
1.  **Queue Splitting:** Separate "Fast" tasks (Text Replies) from "Slow" tasks (Image Gen, Reporting) into different BullMQ queues (`whatsapp-queue-fast`, `whatsapp-queue-heavy`) to prevent head-of-line blocking.
2.  **Documentation Update:** Archive the obsolete `CODEBASE_REVIEW_2026_03_13.md` and adopt this report as the current truth.

---
*Review conducted by Gemini CLI - Codebase Investigator*
