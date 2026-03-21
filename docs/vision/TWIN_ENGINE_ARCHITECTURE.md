# Twin Engine Architecture: Scaling BOS and LOS side-by-side

*Date: March 2026*
*Status: Draft*

## 1. The Core Problem
We are building a **Super Agent** that serves two distinct masters:
1.  **The Business (BOS):** Needs 100% uptime, transactional integrity, and speed. (e.g., "Confirm receipt of ₦50k").
2.  **The Life (LOS):** Needs high processing power, scraping capabilities, and massive data ingestion. (e.g., "Check prices of rice in 5 markets", "Monitor JAMB portal").

**Risk:** If we run both on the same infrastructure, a heavy data task (like scraping prices) could clog the system, delaying critical payment alerts.

## 2. The Solution: Twin Engine Architecture

We maintain a single **Monorepo** (`naija-agent-core`) for code sharing, but we deploy **Separate Infrastructures** for execution.

### A. The "Gateway" (Unified Interface)
*   **Component:** `apps/api`
*   **Role:** The Traffic Controller.
*   **Logic:**
    1.  Receives WhatsApp Message.
    2.  **Intent Classifier:** Decides "Is this Business?" or "Is this Life?"
    3.  **Routing:**
        *   Business Intent $\rightarrow$ Pushes to `BOS_QUEUE` (Redis A).
        *   Life Intent $\rightarrow$ Pushes to `LOS_QUEUE` (Redis B).

### B. Engine 1: BOS (The Money Maker)
*   **App:** `apps/worker` (Renamed to `apps/worker-bos` conceptually)
*   **Focus:** Stability, Transactions, Speed.
*   **Infrastructure:**
    *   **Redis:** Dedicated `REDIS_URL_BOS`.
    *   **Scaling:** Conservative. Priority on availability.
*   **Responsibilities:**
    *   Payment Verification (Paystack/Monnify).
    *   Inventory Management.
    *   Customer Support (Business).

### C. Engine 2: LOS (The Life Guardian)
*   **App:** `apps/worker-life` (NEW)
*   **Focus:** Intelligence, Data Processing, Scraping.
*   **Infrastructure:**
    *   **Redis:** Dedicated `REDIS_URL_LOS`.
    *   **Scaling:** Aggressive. Can scale to zero when not processing.
*   **Responsibilities:**
    *   **Market Intelligence:** Scraping food prices.
    *   **Education:** Checking JAMB/School portals.
    *   **Health:** Verifying drug NAFDAC numbers.
    *   **Japa:** Visa checklist processing.

### D. The Bridge: Shared Data Layer
*   **Database:** Single Firestore Project.
    *   **Why?** To enable "Synergy".
    *   *Scenario:* "Pay for this NAFDAC drug (LOS) using my Shop Balance (BOS)."
    *   *Implementation:* Atomic Transactions across `/businesses/{id}` and `/personal/{id}` collections.
*   **Identity:** Unified `packages/types`. User ID matches WhatsApp Phone ID across both engines.

## 3. Directory Structure
```text
naija-agent-core/
├── apps/
│   ├── api/            # Gateway
│   ├── worker-bos/     # (Current 'worker') Business Logic
│   └── worker-life/    # (NEW) Life Logic & Scrapers
├── packages/
│   ├── types/          # Shared interfaces
│   ├── database/       # Shared DB logic
│   └── scrapers/       # (NEW) Shared scraping utilities
```

## 4. Implementation Strategy
1.  **Initialize `apps/worker-life`:** Clone the basic worker setup but strip out business logic.
2.  **Configure Redis:** Add `REDIS_URL_LOS` to environment variables.
3.  **Update API:** Modify `apps/api` to support dual-queue routing.
4.  **Build Module 1:** Implement "Market Intelligence" in `worker-life`.
