# Naija Agent Core Context

## Critical Information
- **Master Strategy:** [MASTER_STRATEGY_2026.md](../docs/core/MASTER_STRATEGY_2026.md) (Active).
- **Active Gemini Model:** `gemini-2.5-flash` (Verified in Production).
- **Audio Processing:** Verified (Session 13). Correctly transcribes/responds to voice notes.
- **Image Processing:** Verified (Session 13). Gemini Vision analyzes images/receipts.
- **Outbound System:** Live. `POST /send` endpoint verified in production.
- **Credit Awareness:** Gemini is now balance-aware (Context Injection) and responds to balance queries.

## Recent Changes
- **Phase 9.2 Alajo Sovereign Financial System (May 2026):**
    - **Unified Vault Architecture:** Transitioned Aelixxr into a Sovereign Financial Manager. Every user now has a personalized Monnify Virtual Account that funds a unified `vaultBalanceNaira`.
    - **Automated Recharges:** Users can now convert Vault Naira into Aelixxr Energy Credits instantly via the `convert_vault_to_energy` tool.
    - **Iron Shield Security Hardening:**
        - Implemented **Salted Bcrypt** hashing for user PINs (stored in `user_profiles`).
        - Developed a **Deterministic PIN Interceptor** in `handleLifeChat` to prevent AI hallucination of 4-digit PINs.
        - Enforced a **3-Strike Lockout** policy (15-minute vault lock after 3 incorrect attempts).
        - Integrated context-aware PII scrubbing to protect PINs in the Vault while allowing conversational numbers (years/quantities).
    - **Utility Vending:** Integrated Monnify VAS for Airtime, Data, and Electricity with a built-in **₦100 platform fee** and automated commission collection.
    - **Trust Anchor:** Implemented Monnify Payouts (Withdrawals) to allow users to withdraw Vault funds to personal bank accounts.
- **Phase 9.1 Universal SDK Migration (April 2026):**
    - **SDK Upgrade:** Migrated from legacy `@google/generative-ai` to the modern `@google/genai` Universal SDK.
    - **Global Publisher Endpoint:** Re-routed all AI traffic through `https://aiplatform.googleapis.com/v1/publishers/google` for enhanced model availability (Gemini 2.5/3) without complex OAuth.
    - **Model Strategy:** Standardized on `gemini-3-flash-preview` for primary business and life logic, with `gemini-3.1-flash-lite-preview` for high-speed worker tasks.
    - **Tool Support:** Fully verified Google Search grounding and custom function calling across the new architecture.
    - **Stability:** Resolved strict TypeScript type issues and chat history normalization required by the new SDK.
- **Phase 8.3 Sector Expansion & Global Foundation (Mar/Apr 2026):**
    - **Internationalization (i18n):** Upgraded `OrganizationSchema` to enforce `currency` objects (`code`, `symbol`, `locale`) and support region toggles. Integrated `libphonenumber-js` for E.164 normalization.
    - **Multi-Currency Ledger:** Refactored Next.js dashboard (`InventoryTable.tsx`, etc.) and API Gateway to dynamically format local prices based on currency configuration.
    - **Automated Reminders & Ghost Locks:** Added `/cron/release-abandoned-locks` endpoint to release inventory holds for abandoned carts, and `/cron/inventory-alerts` for proactive nudges.
    - **Dynamic Sector Execution:** Introduced `sectorPack` plugin system in worker tool handlers for O(1) domain logic scalability. Added `/network/search` API for agent-to-agent discovery.
- **Phase 8.2 Iron Shield (Mar 2026):**
    - **Async SMS Bridge:** Decoupled SMS ingestion from processing. API now queues jobs; Worker handles parsing (Regex/LLM) asynchronously to prevent webhook timeouts.
    - **PIN Interceptor:** Implemented a deterministic Regex check (`/^\d{4}$/`) in `messaging.ts` to handle PINs instantly, preventing AI hallucinations and "I understand" loops.
    - **Log Redaction:** Implemented strict header redaction (`x-api-key`, `x-bridge-secret`, `x-hub-signature-256`) in the API to prevent credential leakage.
    - **Ambiguity Defense:** Updated the fallback message to be context-aware ("Oga, I no too catch that one") and explicitly instructed the AI to ask for clarification on random inputs.
    - **Master Bot Context:** Fixed a bug where the Master Bot would ask for a PIN to answer knowledge questions. It now prioritizes the injected `[WISDOM BASE]` over external tools.
- **Phase 7 Security & Stability Audit (Mar 2026):** 
    - **Robust Price Guard:** Replaced the fragile regex with a comprehensive parser for "5k", "NGN", and "m" formats.
    - **Security Synchronization:** Enforced PIN protection for `web_search`, `activate_tenant`, and `get_network_stats`.
    - **Onboarding Privacy:** Implemented SHA-256 hashing for the `adminPin` during the temporary onboarding state to prevent plain-text leakage in Firestore.
    - **SMS Bridge Hardening:** Fixed a critical deduplication bug in the bridge by implementing a `deque`-based sliding window, preventing duplicate bank alert forwarding.
    - **Cart Recovery Correction:** Fixed a field mismatch (`verifiedAt` vs `timestamp`) to ensure accurate payment detection before nudging abandoned carts.
- **Modularization:** Decomposed the massive 1,300-line worker and monolithic Firebase package into specialized domain handlers. The codebase is now high-scale ready and O(1) organized.
- **Forensic Hardening:** Launched the **Anti-Fraud Vision Protocol**. AI now acts as a Forensic Analyst, scanning for pixel-level forgery and providing a `suspicionReason` before flagging fraud.
- **Strict Type Integrity:** Replaced `any` across the monorepo with central interfaces in `packages/types`. Builds are now 100% verified and type-safe.
- **Infrastructure Hardening:** Implemented bottom-up package building in `scripts/build.js` and enforced `NODE_ENV=production` for system stability.
- **API Expansion:** Integrated Monnify Webhook and scheduled Cron endpoints for reminders and inventory.
- **Persistent Media Pipeline:** Managers' images are now automatically saved to Cloud Storage, solving the "24-hour expiry" bug for product photos.
- **Sovereign Snitch:** Active WhatsApp alerting system for Boss lockouts, critical job failures, and high-value fraud attempts.
- **Hybrid Hub Transition (Mar 2026):** Transitioned from a WhatsApp-only model to a **Hybrid Hub**. 
    - **Front-Office:** WhatsApp (AI Sales & Support).
    - **Back-Office:** Next.js Web Dashboard (Operations & Management).
    - **Features:** Real-time Dispatch Board, Web-based Inventory Manager, and Visual Ledger (Ledger/Sales Chart).
- **Iron Shield Hardening:** Implemented strict **Amount Lock** (Receipt vs Bank API comparison), Redis-based verification rate limiting, and zero-leak frontend data sanitization.

## Next Steps (Phase 8 - Global Expansion)
- [x] **Internationalization:** Add support for US/UK phone numbers and multi-currency ledgers.
- [x] **Automated Reminders:** Deploy proactive BullMQ nudges for appointments and stock alerts.
- [x] **Onboarding Automation:** Streamline the remote OTP relay UI for faster client activation. (Completed)
- [x] **Sector Expansion:** Initial `sectorPack` implementations for `commerce` and `health` domains established.


