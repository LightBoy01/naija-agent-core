# API REFERENCE: The Engine Endpoints (2026)

This document describes the public and internal endpoints for the **Naija Agent** services.

---

## 📱 WHATSAPP WEBHOOK (`apps/api`)

### `GET /webhook`
- **Purpose:** Meta verification (Handshake).
- **Security:** Requires `WHATSAPP_VERIFY_TOKEN`.

### `POST /webhook`
- **Purpose:** Inbound message ingestion.
- **Security:** HMAC-SHA256 signature verification using the Organization's `appSecret`.
- **Logic:** Validates JSON -> Adds job to BullMQ `whatsapp-queue`.

---

## 💳 PAYMENTS & BILLING (`apps/api`)

### `POST /payments/paystack`
- **Purpose:** Official Paystack Webhook.
- **Logic:** Identifies `orgId` from metadata -> Credits balance in Firestore -> Records transaction.

---

## 🚀 ONBOARDING V2 (`apps/api`) - Phase 7.7

### `POST /onboarding/register-phone`
- **Purpose:** Initiate Meta Cloud SIM registration.
- **Payload:** `{ phone: string, orgId: string }`
- **Security:** Requires Step 0 Master Bot code verification.

### `POST /onboarding/verify-otp`
- **Purpose:** Finalize SIM registration with 6-digit code.
- **Payload:** `{ code: string, orgId: string }`

---

## 🛠️ DASHBOARD ACTIONS (`apps/web`)

### `POST /activities/update`
- **Purpose:** Update status of Waybills/Orders/Bookings.
- **Trigger:** Manual button click on the Dispatch Board.
- **Hooks:** Triggers an automated WhatsApp notification via BullMQ.

---

## 📊 SYSTEM MONITORING

### `GET /health`
- **Purpose:** Uptime check for Railway/Vercel.
- **Returns:** Service status and Redis connection health.
