# Naija Agent Core Context

## Critical Information
- **Active Gemini Model:** `gemini-2.5-flash` (Verified in Production).
- **Audio Processing:** Verified (Session 13). Correctly transcribes/responds to voice notes.
- **Outbound System:** Live. `POST /send` endpoint verified in production.
- **Credit Awareness:** Gemini is now balance-aware (Context Injection) and responds to balance queries.

## Recent Changes
- **Verified Outbound:** Successfully sent a `hello_world` template via production API and Railway Worker.
- **Balance Context:** Updated Worker to inject current organization balance into Gemini's system prompt.
- **Low Balance Alerts:** Implemented atomic deduction with balance-check alerts (1,000 kobo threshold).
- **Environment Sync:** Synchronized `ADMIN_API_KEY` across all production services.
- **Multimodal Schema:** Updated `@naija-agent/types` to support `image` job types (Vision ready).

## Next Steps
- [ ] **Phase 4: Fake Alert Buster** (Implement Image Webhook -> Gemini Vision OCR).
- [ ] **Third-Party Payments:** Research Monnify/Paystack API for real-time transaction verification.
- [ ] **Session Management:** Implement `#STOP` / `#START` commands for user data privacy.

