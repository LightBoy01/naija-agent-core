# 🛡️ Red Team Report: Phase 7.3 (Financials & Automation)

## 🚨 Critical Findings

### 1. The "Ghost Data" Problem (Expenses)
*   **Plan Assumption:** "Aggregate `logs_transaction` (Type: `debit`) for expenses."
*   **Codebase Reality:** **No such collection exists.** The `deductBalance` function currently performs a blind decrement of the organization's balance. There is no historical record of *when* or *why* money was spent, only the current total.
*   **Impact:** **Showstopper.** We cannot build a "Visual Ledger" of expenses because the data does not exist.
*   **Fix:** We MUST implement a `incrementDailyExpenses(orgId, kobo)` function and call it in the Worker immediately after `deductBalance`. This will store daily cost aggregates in the existing `daily_snapshots` collection.

### 2. Performance & Quota Risk (Sales Aggregation)
*   **Plan Assumption:** "Aggregate `activities`... on every dashboard load."
*   **Codebase Reality:** We already have a `daily_snapshots` collection that tracks `totalSalesKobo`.
*   **Impact:** Re-aggregating raw activities is O(N) read operations (expensive and slow).
*   **Fix:** Use the existing `daily_snapshots` for the high-level "Sales Chart". Only query `activities` for the detailed "Transaction Table" (paginated).

### 3. Missing Webhook Security
*   **Plan:** "Implement a secure webhook."
*   **Risk:** Without explicit signature validation logic, the webhook is vulnerable to spoofing (Fake Alerts 2.0).
*   **Fix:** Explicitly mandate `computeMonnifySignature` logic in the plan.

## 📝 Updated Recommendations

1.  **Insert Phase 7.3.0 (Prerequisite):**
    *   Modify `packages/firebase`: Add `incrementDailyExpenses`.
    *   Modify `apps/worker`: Call `incrementDailyExpenses` after every cost deduction.
    *   *Note:* Historical expense data prior to this deployment will be lost (start from 0).

2.  **Refine Phase 7.3.1 (Visual Ledger):**
    *   Dashboard should query `daily_snapshots` for the Chart (Fast, Cheap).
    *   Dashboard should query `activities` (Type: `order`) for the Table (Detailed).

3.  **Refine Phase 7.3.3 (Reminders):**
    *   Add `lastRemindedAt` to Cart schema to prevent spam loops.

**Verdict:** The plan is **NOT READY** for execution until the Data Infrastructure gap (Ghost Expenses) is addressed.
