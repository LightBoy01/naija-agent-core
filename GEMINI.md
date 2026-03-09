# Naija Agent Core Context

## Critical Information
- **Active Gemini Model:** `gemini-2.5-flash` (Verified in Production).
- **Audio Processing:** Verified (Session 13). Correctly transcribes/responds to voice notes.
- **Image Processing:** Verified (Session 13). Gemini Vision analyzes images/receipts.
- **Outbound System:** Live. `POST /send` endpoint verified in production.
- **Credit Awareness:** Gemini is now balance-aware (Context Injection) and responds to balance queries.

## Recent Changes
- **Phase 4n: Sovereign Empire Hardening:** Implemented Bcrypt PIN hashing, 15-minute brute-force lockouts, and a "Credit Reservation" model to eliminate race conditions.
- **Phase 4l: The Auto-Matching Engine:** Built a full-stack verification system. Screenshot receipts are logged as 'Pending' and automatically confirmed when a matching bank SMS arrives via the new `/bridge/sms` API.
- **Phase 4k: Command Center Upgrades:** Built dynamic chat details auditing and tenant management UI (manual top-ups and status toggles) with session-protected server actions.
- **Multi-Tenancy Key Isolation:** Enabled dynamic app secrets and tokens per tenant.

## Next Steps
- [ ] **Sovereign Auth Hardening (Phase 4m):** Implement WhatsApp-based MFA (Bot sends 6-digit code to Boss).
- [ ] **Real-time Bank Verification:** Complete official Monnify/Paystack API integration for automated fraud prevention (Enterprise clients).
- [ ] **Network Portfolio Stats:** Refactor `getNetworkStats` to use a global aggregator document for O(1) performance.


