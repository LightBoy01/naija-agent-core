# Codebase Review Report (March 13, 2026)

## 1. Executive Summary
The `naija-agent-core` codebase is in a strong "Post-Launch" state (Phase 7). The modular architecture in `apps/worker` is clean, and the "Pidgin" localization fits the market well. However, we identified specific gaps in **Type Safety**, **Security (PIN Hashing)**, and **User Experience (Onboarding)** that contradict the "Strict" and "Polished" goals of the recent phase.

## 2. Key Findings

### A. Type Safety ("Strict Integrity" Gaps)
Despite the "Strict Type Integrity" directive, `packages/types/src/index.ts` contains loose `any` types that undermine confidence in the system.
*   **Location:** `packages/types/src/index.ts`
*   **Issues:**
    *   `OrganizationSchema`: `onboardingData`, `config`, and `updatedAt` are `z.any()`. `onboardingData` holds sensitive info (PINs, Bank Details) and should be strictly typed.
    *   `ProductSchema`, `ActivitySchema`: Firestore Timestamps are typed as `any`.
*   **Risk:** High. Allows malformed data to permeate the system, especially during the critical onboarding phase.

### B. Security & Integrity
*   **Weak PIN Hashing:**
    *   **Location:** `apps/worker/src/handlers/onboarding.ts`
    *   **Issue:** PINs are hashed using unsalted `SHA-256` (`crypto.createHash('sha256')...`).
    *   **Risk:** Critical. 4-digit numeric PINs are trivial to brute-force or reverse via rainbow tables if the database is leaked.
    *   **Recommendation:** Use `bcrypt` (already available in the project) or at least a salted hash for temporary storage.
*   **Price Guard Fragility:**
    *   **Location:** `apps/worker/src/handlers/messaging.ts`
    *   **Issue:** The Price Guard relies on a complex Regex and strictly checks against *current turn* tool results. It might flag valid prices from conversation history as "hallucinations".

### C. User Experience (Friction)
*   **Rigid Onboarding Flow:**
    *   **Location:** `apps/worker/src/handlers/onboarding.ts`
    *   **Issue:** The state machine is strictly linear. If a user mistypes their bank name, they must `#reset` the entire flow.
    *   **Recommendation:** Implement a generic "Back" command or specific field correction (e.g., "Change Bank").

### D. Architecture
*   **Sequential Dispatcher:**
    *   **Location:** `apps/worker/src/index.ts`
    *   **Issue:** The worker processes jobs sequentially (`await handle...`).
    *   **Risk:** Medium. As tenant count grows, a single slow tool (e.g., Image Gen) could backlog the entire queue.
    *   **Recommendation:** Move heavy tasks (Image Gen, Reporting) to a separate concurrent queue or worker pool.

## 3. Recommendations & Next Steps

### Immediate Fixes (Phase 7.3)
1.  **Refactor Types:** Replace `z.any()` in `packages/types` with proper Zod schemas (e.g., `ConfigSchema` for `org.config`).
2.  **Harden PINs:** Switch `onboarding.ts` to use `bcrypt` or a salted hash for the temporary PIN.
3.  **Soft Onboarding Navigation:** Add a `back` logic to the onboarding state machine.

### Strategic Improvements
1.  **Parallel Worker:** Refactor `apps/worker/src/index.ts` to process high-latency jobs concurrently.
2.  **Price Guard V2:** Implement a "Semantic Price Check" using a lightweight LLM pass or a more robust context search instead of just Regex.

---
*Review conducted by Gemini CLI - Codebase Investigator*
