# IMPROVEMENT PLAN 2026: From "Mock" to "Sovereign" (Final Verified)
*Date: March 25, 2026*
*Status: READY FOR EXECUTION*
*Reviewer: Red Team Lead*

This document outlines the step-by-step plan to address critical security vulnerabilities and implement the architectural vision.

---

## 🚨 Phase 1: Critical Security Hardening (Immediate Action)
*Goal: Close all "Skeleton Key" vulnerabilities while preserving legitimate access.*

### 1.1. Secure Admin Tools (The "Skeleton Key" Fix)
*   **Vulnerability:** Admin tools rely on `isAdmin` flags, ignoring the 2-hour PIN session (`isAuth`).
*   **Implementation:**
    In `apps/worker/src/tools/admin.ts`, wrap `authorize_staff`, `deactivate_staff`, `assign_task_to_staff`, and `manage_activity`:
    ```typescript
    if (!ctx.isAuth) {
      return { 
        status: 'error', 
        code: 'AUTH_REQUIRED', 
        message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' 
      };
    }
    ```

### 1.2. Fix Sovereign Identity Spoofing
*   **Vulnerability:** Tenants can spoof `isMaster` to trigger Sovereign alerts.
*   **Implementation:**
    In `request_human_handoff` (`admin.ts`):
    ```typescript
    // Strict Server-Side Validation
    if (args.isMaster && ctx.orgId !== process.env.MASTER_ORG_ID) {
       logger.warn({ from: ctx.from, orgId: ctx.orgId }, '🚨 Potential Sovereign Spoofing Attempt');
       return { error: 'Unauthorized Master Request' };
    }
    ```

### 1.3. Sovereignty in Broadcasts (Context-Aware)
*   **Vulnerability:** `send_broadcast` bypasses tenant branding/limits.
*   **Implementation:**
    *   **Standard Tenants:** Must use `orgId: ctx.orgId` (Charges their balance, uses their rate limit).
    *   **Master Admin:** Can optionally use `orgId: 'system'` for network-wide alerts (Free, unlimited).

### 1.4. Expand "Iron Shield" Protection
*   **Vulnerability:** Sensitive BI tools are exposed.
*   **Implementation:**
    Add to `AUTH_REQUIRED_TOOLS` in `definitions.ts`:
    *   `manage_stock`
    *   `get_business_report`
    *   `get_customer_info`

### 1.5. Fix Redis Connection Leak
*   **Vulnerability:** Hardcoded `localhost` in `send_broadcast`.
*   **Implementation:** Use the existing `ctx.redisClient` for BullMQ connections.

---

## 🏥 Phase 2: "Sector-Agnostic" Reality (The Health Pack)
*Goal: Move from "Mocks" to "Polymorphic Persistence".*

### 2.1. Polymorphic Entity Handler
*   **Strategy:** Avoid a single "Entities" collection to prevent indexing issues.
*   **Implementation:**
    Create `packages/firebase/src/modules/polymorphic.ts`:
    *   `saveEntity(orgId, collectionName, data)`: Wrapper for `db.collection(orgId).collection(collectionName).add(data)`.
    *   `queryEntity(orgId, collectionName, filters)`: Wrapper for Firestore queries.
    *   *Why?* Allows the Health Pack to save to `appointments` and Commerce Pack to save to `orders` using the same utility.

### 2.2. Dynamic Workflow Validation
*   **Strategy:** Enforce states defined in code.
*   **Implementation:**
    Update `manage_activity` to load `ctx.sectorPack.workflowDef`.
    ```typescript
    const allowedTransitions = workflowDef.transitions.filter(t => t.from === currentStatus);
    if (!allowedTransitions.find(t => t.to === args.status)) {
       return { error: `Invalid move from ${currentStatus} to ${args.status}` };
    }
    ```

---

## 🛡️ Phase 3: The "Life Guardian" (LOS) MVP
*Goal: Document Ingestion without Vector DB complexity.*

### 3.1. "The Vault" Ingestion (API -> Worker)
*   **Step 1 (API):** Create `POST /webhook/document` or update `POST /webhook/whatsapp`.
*   **Step 2 (Worker):** Create `apps/worker-life/src/handlers/document.ts`.
*   **Logic:**
    1.  Download Media.
    2.  **Gemini Vision:** "Extract: Amount, Date, Sender, and generate 10 search keywords."
    3.  Save to Firestore: `organizations/{orgId}/vault`.
        *   Fields: `keywords: string[]` (for search), `summary`, `metadata`.

### 3.2. Semantic Keyword Search (No Vector DB)
*   **Strategy:** Use "Smart Keywords" instead of Embeddings for MVP.
*   **Implementation:**
    *   **Tool:** `search_documents(query)`.
    *   **Logic:**
        1.  Ask Gemini: "Convert this query '${query}' into 5 search keywords."
        2.  Firestore Query: `vaultRef.where('keywords', 'array-contains-any', keywords)`.
    *   *Benefit:* Fast, cheap, no extra infrastructure.

---

## 🤝 Phase 4: "Empire Bridge" (Inter-Agent Commerce)
*Goal: Enable Agent-to-Agent transactions.*

### 4.1. Agent Discovery (DNS)
*   **Implementation:**
    Expose `GET /network/search?sector=health&capability=dental`.
    *   Returns: `phoneId` of verified agents.

### 4.2. Atomic Transactions
*   **Implementation:**
    New Tool: `buy_from_agent`.
    *   Uses `verify_transaction` on the *Seller's* side and `generate_checkout_invoice` on the *Buyer's* side.
