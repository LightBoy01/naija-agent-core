# NaijaAgent Core - Growth & Operations Blueprint

This document details the operational mechanics of the Sovereign Hierarchy and the viral network effect.

## 1. The "Grand Commander" Launch Protocol

**Phase 1: The Master Office**
*   **Action:** Seed the **Master Bot** (`naija-agent-master`) on your test number.
*   **Boss:** Your personal number (`2347042310893`).
*   **Result:** You now have a COO that manages your whole business.

**Phase 2: The "Powered By" Viral Loop**
*   **Mechanic:** Every bot reply to a customer appends: *"Want your own AI Agent? Chat with our Master at [Master_Bot_Link]"*.
*   **Stats:** 2-5% of shoppers are business owners. Every interaction is a sales pitch.

---

## 2. Onboarding Workflow (Zero-Friction)

How to add a new client (e.g., "DentalPlus Clinic"):

1.  **The Sale:** Master Bot gives a demo -> Client pays via Paystack.
2.  **The Decree:** You tell Master Bot: *"Onboard DentalPlus. Phone ID is ... Admin is 234..."*
3.  **The Birth:** Master Bot calls `create_tenant`.
4.  **The Handover:** Master Bot pings the client: *"Oga! I am your new clinic assistant. Type your PIN to start."*

---

## 3. Managed Scenarios (Diverse Growth)

### Scenario A: Logistics (The Waybill Agent)
*   **Value:** Automates "Where is my rider?" calls.
*   **Power:** Uses `manage_activity` to log waybill statuses.

### Scenario B: Appointments (The Booking Agent)
*   **Value:** 24/7 lead qualification and booking.
*   **Power:** Uses `manage_activity` to schedule dental or salon appointments.

### Scenario C: Retail (The Fake Alert Buster)
*   **Value:** Instant trust between buyer and seller.
*   **Power:** Uses Gemini Vision to read receipts and verify with bank APIs.

---

## 4. Operational Tips for the Sovereign

1.  **Stay in WhatsApp:** Don't build apps until you hit 100 clients. Manage everything via the Master Bot.
2.  **Security First:** Always set a unique `adminPin` for every client.
3.  **Template-Only Broadcasts:** When announcing new features to all Bosses, use Meta Templates to avoid spam bans.
4.  **Audit Regularly:** Use the `get_network_stats` tool every morning to see your empire's growth.
