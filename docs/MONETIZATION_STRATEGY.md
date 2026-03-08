# NaijaAgent Core - Monetization & Business Strategy

This document outlines the financial engineering and "AI Credits" model required to dominate the African WhatsApp commerce market.

## 1. Core Revenue Model: "The AI Credits" (Prepaid)

We treat AI interactions like **GSM Airtime**. Revenue is collected upfront.

### The Mechanism
1.  **Wallet System:** Each Organization has a `balance` (in Kobo).
2.  **Zero Balance Lock:** The Bot **STRICTLY** stops replies if balance is insufficient.
3.  **Admin Mode (FREE):** The Boss always chats for **FREE**. This prevents "Management Lockout" and ensures the client can always manage their business.

### Pricing Strategy (High Margin)
*   **Customer Text Reply:** ₦20 (Cost: ~₦2).
*   **Customer Image/Audio:** ₦50 (Cost: ~₦5).
*   **Verification Tool Execution:** ₦100 (Premium for bank integration).
*   **Monthly Subscription:** Removed for MVP to favor high-velocity micro-transactions.

---

## 2. The "Digital General" Upsell

We charge for **Intelligence and Delegation**, not just chat.

*   **The Onboarding Fee:** ₦50,000 for the Master Bot to spawn a custom business bot.
*   **Premium Tools:** Removal of "Powered by" branding costs ₦5,000/month.
*   **Enterprise Dashboard:** Direct access to archived media and audit logs (Future).

---

## 3. Financial Safety (Rugged Design)

### A. Atomic Deduction
Every credit deduction uses **Firestore Transactions**. We do not lose a single kobo to race conditions.

### B. Anti-Retry Loop
The Worker ensures that AI Quota retries (429 errors) do not result in multiple credit deductions for the same message.

### C. Low Balance Pulse
The Master Bot proactively pings the Sovereign when a client hits the low-balance threshold, allowing for automated follow-up sales.

---

## 4. Long-Term Data Assets

Every conversation stored in Firestore/Storage is an asset for the **Billion Euro View**.

1.  **Pidgin Dataset:** Transactional language data for training local models.
2.  **Visual Proof:** A massive dataset of verified Nigerian bank receipts for future OCR fine-tuning.
3.  **Market Intelligence:** Real-time visibility into MSME supply chains and consumer demand.
