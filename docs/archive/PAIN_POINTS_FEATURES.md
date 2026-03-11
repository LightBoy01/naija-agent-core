# NaijaAgent Core - High-Value Pain Points & Features

This document details the critical "Pain Points" and high-value features that transform the NaijaAgent Core from a generic chatbot into a specialized, revenue-generating business tool.

## 1. The "Fake Alert" Problem (Retail & E-commerce)
**Target:** IG Vendors, Supermarkets, Restaurants.
**Pain:** Manual verification of bank transfers is slow, error-prone, and susceptible to fraud (fake screenshots).

### Solution: Automated Receipt Verification
*   **Workflow:**
    1.  User sends payment screenshot via WhatsApp.
    2.  **Gemini Vision (Multimodal):** Extracts `Amount`, `Sender Name`, `Date`, `Reference ID`.
    3.  **Backend Tool:** Calls Fintech API (Paystack, Monnify, Mono) to verify transaction existence and status.
    4.  **Reply:** *"Payment Verified: ₦5,000 received from Chinedu. Processing Order #123."* OR *"Payment Pending/Failed."*
*   **Monetization:** ₦50 - ₦100 per verification (or monthly subscription).
*   **Tech Stack:** `WhatsAppService` (Image Download) -> Gemini Vision -> Fintech API Integration.

## 2. The "Where is my Rider?" Chaos (Logistics)
**Target:** Dispatch Companies (GIG, Kwik, Local Bikes).
**Pain:** Massive call volume from anxious customers asking for package status. High support staff costs.

### Solution: Automated Rider Tracking
*   **Workflow:**
    1.  User sends Voice Note/Text: *"Abeg, where my package dey?"*
    2.  **Agent:** Identifies user phone number -> Calls Logistics DB/API.
    3.  **Tool:** `get_delivery_status(phone_number)` retrieves real-time GPS/Status.
    4.  **Reply:** *"Rider Musa is currently at Yaba (Last update: 2 mins ago). ETA: 15 mins."*
*   **Monetization:** Subscription (SaaS) per rider/month or per tracking request. drastically reduces support staff overhead.
*   **Tech Stack:** `WhatsAppService` (Audio/Text) -> Gemini -> Logistics API/DB.

## 3. The "Viewing Appointment" Ghosting (Real Estate)
**Target:** Real Estate Agents, Property Managers.
**Pain:** High volume of unqualified leads ("What's the price?") and no-shows for scheduled viewings. Wasted time and fuel.

### Solution: Lead Qualification & Booking Agent
*   **Workflow:**
    1.  User inquires about property.
    2.  **Agent (Qualification):** Asks structured questions (Budget, Move-in Date, Employment Status).
    3.  **Tool:** Checks Agent's Calendar (Google Calendar API) for available slots.
    4.  **Action:** Books slot -> Sends WhatsApp confirmation & reminder 2 hours before.
*   **Monetization:** Pay-Per-Booking (e.g., ₦1,000 - ₦2,000) or Monthly Subscription.
*   **Tech Stack:** `WhatsAppService` -> Gemini -> Google Calendar API.

---

## Technical Roadmap for Features

### Phase 1: Receipt Verification (Highest Priority)
- [ ] Implement Image handling in `WhatsAppService`.
- [ ] Create `verify_payment` tool connecting to Paystack/Monnify sandbox.
- [ ] Train System Prompt on identifying fake receipt patterns.

### Phase 2: Logistics Tracking
- [ ] define standardized `DeliverySchema` for DB.
- [ ] Create `track_order` tool.
- [ ] Integrate with Google Maps API for ETA calculation (optional).

### Phase 3: Appointment Booking
- [ ] Integrate Google Calendar API.
- [ ] Create `check_availability` and `book_slot` tools.
- [ ] Implement reminder cron jobs in Worker.
