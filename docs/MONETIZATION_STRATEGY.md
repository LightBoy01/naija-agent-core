# NaijaAgent Core - Monetization & Business Strategy

This document outlines the financial engineering, "AI Credits" model, and strategic plays to achieve high profitability and sustainability in the Nigerian market.

## 1. Core Revenue Model: "The AI Credits" (Pay-As-You-Go)

We treat AI interactions like **GSM Airtime** or **Prepaid Electricity**.

### The Mechanism
1.  **Wallet System:** Each Organization has a `balance` (in Kobo).
2.  **Top-Up:** Clients buy credits via Paystack/Flutterwave (e.g., ₦5,000, ₦10,000).
3.  **Consumption:** Every AI reply deducts a fixed amount (e.g., ₦20).
4.  **Zero Balance:** Service stops immediately. Bot replies: *"Service is temporarily unavailable. Please contact the business owner."*

### Why This Wins
*   **Cash Flow Positive:** Revenue is collected upfront. No chasing invoices.
*   **Risk Mitigation:** No bad debt from clients who refuse to pay after usage.
*   **Psychology:** Nigerian businesses prefer "paying for what I use" over flat monthly fees for idle software.
*   **Micro-Transactions:** Allows small vendors (IG sellers) to start with just ₦1,000.

### Pricing Strategy (The Arbitrage)
*   **Cost:** ~₦2 - ₦5 per reply (Meta + Gemini Flash).
*   **Price:** ₦20 - ₦30 per reply.
*   **Margin:** **~500% - 1000%**.

---

## 2. Upsell Strategy: "Outcome-Based" Billing

For high-value clients (Real Estate, Logistics, FinTech), generic chat is commoditized. We charge for **Qualified Leads**.

### The Model
*   **Chat:** Free (absorbed cost).
*   **Action (Tool Execution):** Charged at a premium (e.g., ₦500 - ₦2,000).
    *   *Example:* User types "I want to inspect the land." -> Bot calls `book_inspection()`.
    *   *Charge:* Client pays ₦1,000 for the booking confirmation.
*   **Why:** Clients happily pay for results, not talk.

### "White Label" Premium
*   **Standard:** Bot appends footer: *"Powered by NaijaAgent"*.
*   **Premium:** Remove branding for **₦5,000/month** subscription.

---

## 3. Financial Engineering & Safety (Red Team Analysis)

### A. The "Credit Abuse" Attack
*   **Risk:** Users creating multiple accounts for free sign-up credits.
*   **Defense:**
    *   **Phone Verification:** Require OTP for account creation.
    *   **No Free Lunch:** Only give bonus credits (e.g., ₦500) after the first paid top-up of ₦1,000+.

### B. The "Viral Shock" (Overdraft)
*   **Risk:** Client goes viral, bot replies 10,000 times overnight, draining balance to zero mid-conversation.
*   **Defense:**
    *   **Low Balance Alerts:** WhatsApp/SMS notification to Admin at ₦1,000 balance.
    *   **Overdraft Buffer:** Allow negative balance up to -₦2,000 to finish active chats, then lock.

### C. The "Refund" Trap
*   **Risk:** Client deposits ₦50k, uses ₦2k, demands ₦48k refund.
*   **Defense:**
    *   **Terms of Service:** "Credits are non-refundable but do not expire."
    *   **Admin Fee:** If refund is forced (e.g., by bank), deduct 10% + Gateway Fees.

---

## 4. The "Data Goldmine" Strategy (Long Term)

Every conversation is an asset.

### The Value
*   **Pidgin English Dataset:** High-quality, transactional Pidgin/English code-switching data is rare.
*   **Market Intelligence:** Real-time data on what Nigerians are buying, prices, and logistics issues.

### The Play
1.  **Anonymize:** Strip PII (Names, Phones) from `messages` table.
2.  **Fine-Tune:** Train a local "NaijaGPT" (Llama 3 8B) on this data to outperform generic models.
3.  **License:** Sell the anonymized dataset to large AI labs (Google, Meta) improving their African language support.

---

## 5. Operational Metrics to Watch

| Metric | Target | Action if Missed |
| :--- | :--- | :--- |
| **Gross Margin** | > 80% | Optimize Prompt length, switch to smaller model. |
| **Churn Rate** | < 5% | Improve "Fallback" replies, add more Tools. |
| **Top-Up Frequency** | Weekly | Introduce "Auto-Top Up" via saved cards. |
| **System Latency** | < 5s | Upgrade Redis/Postgres instance size. |
