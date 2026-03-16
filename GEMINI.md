# Naija Agent Core Context

## Critical Information
- **Active Gemini Model:** `gemini-2.5-flash` (Verified in Production).
- **Audio Processing:** Verified (Session 13). Correctly transcribes/responds to voice notes.
- **Image Processing:** Verified (Session 13). Gemini Vision analyzes images/receipts.
- **Outbound System:** Live. `POST /send` endpoint verified in production.
- **Credit Awareness:** Gemini is now balance-aware (Context Injection) and responds to balance queries.

## Recent Changes
- **Phase 7 Security & Stability Audit (Mar 2026):** 
    - **Robust Price Guard:** Replaced the fragile regex with a comprehensive parser for "5k", "NGN", and "m" formats, preventing price hallucinations and false positives (e.g., "5km").
    - **Security Synchronization:** Enforced PIN protection for `web_search`, `activate_tenant`, and `get_network_stats` in `tool-handlers.ts`, closing the "Logic Leak" between definitions and execution.
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
- [ ] **Internationalization:** Add support for US/UK phone numbers and multi-currency ledgers.
- [ ] **Automated Reminders:** Deploy proactive BullMQ nudges for appointments and stock alerts.
- [ ] **Onboarding Automation:** Streamline the remote OTP relay UI for faster client activation.


