# Project Improvement Plan: Phase 7 (The Empire Era)

**Date:** March 13, 2026
**Status:** Approved
**Objective:** Harden the system against "Meta AI" competition by doubling down on Vertical Integration, Security, and Localized Utility.

## 1. Security & Compliance (Priority: CRITICAL)

### A. Meta Security: `appsecret_proof`
*   **Finding:** The `WhatsAppService` sends the `Authorization: Bearer` token but **omits** the `appsecret_proof` parameter.
*   **Risk:** If an access token is leaked, it can be used by anyone. `appsecret_proof` ensures only *our server* (which holds the App Secret) can use the token.
*   **Action:**
    1.  Update `SystemConfig` to pass `WHATSAPP_APP_SECRET` to the worker.
    2.  Modify `WhatsAppService` constructor to accept `appSecret`.
    3.  Generate `hmac = crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex')`.
    4.  Append `&appsecret_proof=${hmac}` to all API calls.

### B. Secure PIN Handling (Onboarding)
*   **Finding:** `apps/worker` currently uses weak SHA-256 hashing for temporary PIN storage.
*   **Action:**
    1.  Switch to `bcrypt` immediately in the `PIN` step of onboarding.
    2.  Update `packages/firebase` to detect if `adminPin` is already a bcrypt hash and skip re-hashing.

## 2. Intelligence & Forensics (The "Moat")

### A. Price Guard V2 (Context-Aware)
*   **Finding:** The current Price Guard is deterministic but stateless. It flags valid prices mentioned 2-3 turns ago as "hallucinations" because they aren't in the *current* tool output.
*   **Action:**
    1.  Implement a **Rolling Context Window** in Redis (`price_context:${orgId}:${from}`).
    2.  Cache the last 3 turns of `search_products` results.
    3.  Check the user's quoted price against this aggregated list before redacting.

### B. Visual Forensics Dashboard
*   **Finding:** Bosses currently have to "chat" to see if a receipt is fake.
*   **Action:**
    1.  Build a **"Forensic View"** in `apps/web/app/dashboard/security`.
    2.  Display the uploaded receipt image side-by-side with the extracted data and the "Suspicion Score".

## 3. Performance & Scalability

### A. Queue Splitting (Fast Lane / Heavy Lane)
*   **Finding:** A single `whatsapp-queue` processes everything sequentially. Slow image generation blocks text replies.
*   **Action:**
    1.  Split into `fast-lane` (Text, Lookup) and `heavy-lane` (Image Gen, Reporting).
    2.  Update `apps/api` to route jobs to the correct queue based on `job.type`.
    3.  Run separate Workers (or concurrency settings) for each.

### B. Strict Type Integrity
*   **Finding:** `packages/types` still has some loose `any` types in `OrganizationSchema`.
*   **Action:**
    1.  Replace `z.any()` with `OnboardingDataSchema` and `FirestoreTimestampSchema`.
    2.  Refactor downstream code in `apps/worker` to match strict types.

## 4. User Experience (The "Naija" Feel)

### A. Smart Onboarding (`#back`)
*   **Finding:** Onboarding is a strict one-way street. Typos require a full reset.
*   **Action:**
    1.  Implement `#back` logic in `apps/worker/src/handlers/onboarding.ts`.
    2.  Map current step to previous step (e.g., `BANK_NAME` -> `PIN`).

### B. Dashboard Completion
*   **Finding:** `apps/web` structure exists but is skeletal.
*   **Action:**
    1.  Prioritize **Visual Inventory** (Bulk Update) and **Ledger** (Daily Sales) views.
    2.  "Boss Mode" needs a graphical interface for these complex tasks.

---

## Execution Strategy

1.  **Immediate (Security):** Fix `appsecret_proof` and PIN Hashing.
2.  **Short Term (Intelligence):** Implement Price Guard V2.
3.  **Medium Term (UX):** Build the Visual Dashboard.
4.  **Long Term (Scale):** Split Queues.
