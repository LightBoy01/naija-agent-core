# Phase 8: Global Expansion Roadmap 🌍

**Current Status:** The system is heavily optimized for Nigeria (`NGN`, `+234`, `Lagos` time). While the database schema supports multi-region configurations, the application logic (Worker, Tools, Reporting) is hardcoded for the Nigerian context.

## 1. Internationalization (i18n) Foundation 🛠️

### A. Dynamic Phone Handling
- [x] **Refactor `tools.ts`**: Update tool descriptions to remove `(234...)` and instead use dynamic examples based on `org.region` (e.g., `(1...)` for US).
- [x] **Update `phone.ts`**: Accept `defaultRegion` from the `org` config instead of hardcoding `'NG'`.
- [ ] **Verify WhatsApp Handlers**: Ensure `messaging.ts` correctly processes non-234 sender IDs.

### B. Multi-Currency Engine
- [x] **Refactor `currency.ts`**: Create a robust formatter that takes `org.currency` (symbol, locale, code).
- [x] **Audit `messaging.ts`**: Replace all hardcoded `₦` symbols with dynamic lookups.
- [x] **Audit `reporting.ts`**: Ensure financial reports (Daily/Weekly) use the correct currency symbol and formatting.
- [x] **Update Commerce Tools**: Ensure `verify_payment`, `create_order`, and `manage_stock` respect the tenant's currency.
- [x] **Price Guard Update**: Ensure the regex/parsing logic handles `$` and `£` symbols correctly.

## 2. Global Timezones 🌐
- [ ] **Audit Scheduler**: Verify that `cron/reminders` and `cron/inventory` respect the `org.timezone` (currently defaults to `Africa/Lagos`).
- [ ] **Appointment Logic**: Ensure booking slots are calculated relative to the business's local time, not the server's.

## 3. Onboarding & Payment Localization 💳
- [ ] **Stripe Integration (Future)**: Plan for Stripe Connect for US/UK merchants (currently Paystack/Monnify).
- [ ] **Region-Specific Onboarding**:
    - US/UK: Ask for Email/Zip Code instead of just Phone?
    - Compliance: GDPR checks for UK/EU tenants.

## 4. Execution Plan
1.  **Refactor Utilities**: Update `phone.ts` and `currency.ts` first.
2.  **Tool Definitions**: Make `tools.ts` dynamic.
3.  **Search & Destroy**: Grep for `₦` and `234` and replace with dynamic variables.
4.  **Test**: Onboard a "US Tenant" (mock) and verify the flow.
