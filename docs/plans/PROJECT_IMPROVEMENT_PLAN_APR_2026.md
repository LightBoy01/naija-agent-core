# Naija Agent Core - Project Improvement Plan (April 2026)

## 1. Executive Summary
Following a comprehensive review of the `naija-agent-core` codebase, the project demonstrates a robust "Sovereign Hierarchy" architecture and effectively utilizes a "Hybrid Hub" model. The decoupling of the API ingestion layer from the worker execution layer using BullMQ provides excellent scalability and resilience. The multi-tenant isolation and security measures (signature verification, secret-based authentication) are strong.

However, several areas require immediate attention to ensure long-term stability, security, and maintainability, particularly as the project scales globally in the "Empire Era."

## 2. Immediate Priorities (High Impact, High Urgency)

### 2.1. Establish Comprehensive Test Coverage
*   **Current State:** The test suite is virtually non-existent (only 2 tests run).
*   **Risk:** Extremely high. The project handles financial transactions ("Kobo-based" credits), multi-tenant ledgers, and complex state management (Ghost Locks, PIN sessions). The lack of automated testing makes the system highly vulnerable to regressions and silent failures.
*   **Action Plan:**
    *   **Phase 1 (Critical Logic):** Implement rigorous unit tests for the core financial integrity tools:
        *   `Price Guard` logic (parsing and validation).
        *   `Amount Lock` logic (Receipt vs. Bank API comparison).
        *   Ledger reconciliation functions.
    *   **Phase 2 (Security & State):** Write unit tests for the PIN interception logic and session window management to ensure unauthorized access is consistently blocked.
    *   **Phase 3 (Integration):** Develop integration tests for the BullMQ queue processing to verify that jobs are routed and executed correctly across the `api` and `worker` boundaries.

### 2.2. Resolve Build Warnings (Friction Reduction)
*   **Current State:** Running `npm run build` produces warnings regarding `import.meta` in `packages/firebase/src/db.ts` when compiling to CommonJS.
*   **Risk:** Low, but creates build log noise and potential future incompatibility if build targets change.
*   **Action Plan:** Refactor the ESM/CJS interop logic in `packages/firebase/src/db.ts` to use environment-agnostic path resolution, eliminating the `import.meta.url` fallback when compiling to CJS.

## 3. Medium-Term Improvements (Structural & Security)

### 3.1. Address Legacy Technical Debt (SMS Bridge)
*   **Current State:** The codebase contains deprecated "SMS Bridge" routing logic in the core API gateway.
*   **Risk:** Medium. Keeping deprecated code in the hot path increases complexity, cognitive load, and the potential for unintended side effects or routing conflicts.
*   **Action Plan:** Formally isolate and remove the deprecated SMS bridge endpoints from `apps/api/src/index.ts` and related files. Ensure the new asynchronous queue-based ingestion handles all required functionality.

### 3.2. Fortify Identity-Based RBAC
*   **Current State:** Authorization heavily relies on WhatsApp phone numbers (e.g., Boss Mode, Tenant activation) combined with a 2-hour PIN session.
*   **Risk:** Medium. While WhatsApp numbers are generally secure, relying solely on them at the API layer (without secondary, robust session tokens) introduces a slight risk if a WhatsApp session is hijacked or spoofed at the API level.
*   **Action Plan:** Investigate implementing a more robust, token-based session management system that works alongside the phone number verification, especially for high-privilege actions.

### 3.3. Audit Hardcoded Identifiers
*   **Current State:** Potential fallback to a hardcoded `system` orgId in internal API jobs.
*   **Risk:** Medium to High. If this hardcoded identifier leaks into tenant-specific processing workers, it could bypass the billing ledgers, leading to uncharged usage.
*   **Action Plan:** Conduct a deep audit of all workers and API routes to ensure strict tenant isolation. Ensure that any system-level tasks are explicitly separated from tenant-level billing logic and that fallbacks are handled safely.

### 3.4. Mitigate Multi-Currency Ledger Edge Cases
*   **Current State:** The system supports multi-currency configurations at the organization level, storing values globally as lowest denomination integers (e.g., Kobo/Cents).
*   **Friction/Oversight:** Historical ledger entries do not explicitly "currency-stamp" the transaction. If an organization changes its default currency configuration mid-lifecycle, all historical data in the dashboard will be misinterpreted and rendered incorrectly using the new currency symbol/multiplier.
*   **Action Plan:** Update the `LedgerEntry` schema and generation logic to immutable attach the active `currency_code` (e.g., "NGN", "USD") at the time of the transaction. Update the dashboard to read this historical stamp rather than the current active organization config.

### 3.5. Refine the PIN Interceptor Regex
*   **Current State:** The PIN interceptor uses a strict `/^\d{4}$/` regex to catch 4-digit codes immediately.
*   **Friction/Oversight:** Because it intercepts *any* standalone 4-digit string, a user casually texting a year (e.g., "2026") or a quantity ("1000") alone in a message will trigger a false-positive PIN verification attempt, locking out the AI's natural language processing for that turn.
*   **Action Plan:** Add a contextual check before intercepting. For example, only intercept if the user's session is currently expecting a PIN (e.g., a pending high-privilege action) or require a specific prefix (e.g., "#1234").

### 3.6. Secure SMS Bridge Refill Logic
*   **Current State:** The async SMS Bridge relies on `sovereignBankDetails` config to differentiate between a customer sale payment and an owner "refill/top-up".
*   **Friction/Oversight:** If this configuration is missing, malformed, or accidentally deleted, a legitimate owner top-up might be erroneously categorized as a customer sale, skewing analytics and potentially triggering incorrect fulfillment workflows.
*   **Action Plan:** Implement a strict fallback or alerting mechanism. If `sovereignBankDetails` is missing, the SMS Bridge should queue the alert for manual review or default to a safe "unclassified" state rather than assuming it's a sale.

## 4. Ongoing Maintenance

*   **Dependency Audits:** Regularly audit and update dependencies in `package.json` to patch security vulnerabilities and benefit from performance improvements.
*   **Documentation Updates:** Ensure all architectural decisions, security protocols, and new features are thoroughly documented in the `docs/` directory, keeping the "Master Strategy" aligned with the actual implementation.