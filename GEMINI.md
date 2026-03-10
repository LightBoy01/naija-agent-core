# Naija Agent Core Context

## Critical Information
- **Active Gemini Model:** `gemini-2.5-flash` (Verified in Production).
- **Audio Processing:** Verified (Session 13). Correctly transcribes/responds to voice notes.
- **Image Processing:** Verified (Session 13). Gemini Vision analyzes images/receipts.
- **Outbound System:** Live. `POST /send` endpoint verified in production.
- **Credit Awareness:** Gemini is now balance-aware (Context Injection) and responds to balance queries.

## Recent Changes
- **Empire Governance:** Implemented Sovereign tools for mass broadcasting (`broadcast_to_bosses`), deep tenant audits (`audit_tenant`), and a network-wide `Global Fraud Guard`.
- **Zero-Touch Onboarding:** Launched the `#setup` state machine and the **Remote OTP Relay** protocol for friction-free cloud bot activation.
- **Financial Autonomy:** Automated credit refills via Paystack metadata and standardized all internal ledgers to **Kobo** for 100% precision.
- **Sales Multipliers:** Built **The Closer Tool** (formatted order summaries) and **Viral Onboarding** footers to drive network growth.
- **Vision-First MVP:** Enabled AI receipt verification without the SMS Bridge, removing setup barriers for new merchants.

## Next Steps (Phase 7 - Post-Launch)
- [ ] **Native Android Bridge:** Build the `.apk` to replace the Termux SMS relay script.
- [ ] **Real-time Bank Verification:** Complete official Monnify/Paystack API expansion for high-volume fraud prevention.
- [ ] **Visual Dashboard:** Build the visual Inventory and Ledger dashboard for Bosses.
- [ ] **Automated Reminders:** Implement proactive BullMQ-based nudges for business activities.


