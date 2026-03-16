# Red Team Plan & Mitigation Strategy (Phase 7 - Empire Hardening)

This document outlines the specific attack vectors identified during the infrastructure review and the strategy to mitigate them.

## 1. Infrastructure Resilience (The "Redis Kill" Switch)
**Attack Vector:**
- **Scenario:** Redis service crashes or runs out of memory due to a message spike.
- **Impact:** The API continues to accept webhooks but fails to queue them. WhatsApp retries, creating a DDoS loop that potentially crashes the API server.
- **Test:** Simulating a Redis outage while sending high-volume webhooks.

**Mitigation (The Fix):**
- **Circuit Breaker:** Wrap the `queue.add` call in a try/catch block with a timeout.
- **Fail-Safe Response:** If Redis is down, return `503 Service Unavailable` immediately. This tells WhatsApp to back off and retry later, preserving the API resources.

## 2. Business Continuity (The "Empty Tank" Scenario)
**Attack Vector:**
- **Scenario:** A high-volume merchant runs out of credits (Kobo) in the middle of the night.
- **Impact:** The bot stops replying. Customers think the business is ignoring them. The merchant churns because they think the "bot is broken."
- **Test:** Manually setting a tenant's balance to 0 and sending a customer message.

**Mitigation (The Fix):**
- **Low Balance Nudge:** Implement a check during the `deductBalance` operation.
- **Trigger:** If Balance < ₦500 (approx. 50 messages), send a **priority WhatsApp notification** to the Boss's personal number.
- **Message:** *"Oga, your fuel remaining small (₦450). Top up now so customers don't bounce."*

## 3. Financial Fraud (The "Photoshop" Bypass)
**Attack Vector:**
- **Scenario:** A fraudster uses generative AI (e.g., Midjourney) to create a perfect fake transfer receipt that passes rule-based visual inspection (font/alignment checks).
- **Impact:** The bot confirms payment, and the merchant releases goods without receiving money.
- **Test:** Submitting a high-quality AI-generated fake receipt.

**Mitigation (The Fix):**
- **Layer 1 (Visual):** Keep existing visual checks for speed.
- **Layer 2 (Bank API):** **MANDATORY** integration of Monnify/Paystack API for transactions >₦10,000.
- **Protocol:** If Vision says "Valid" but Bank API says "Pending," the bot must reply: *"Receipt seen. Waiting for bank confirmation (usually 2 mins)."* It must NOT confirm payment until the ledger is updated.

## 4. Sovereign Security (The "God Mode" Leak)
**Attack Vector:**
- **Scenario:** The Master Bot's API key is leaked or an internal bad actor uses `audit_tenant` to spy on other merchants' sales data.
- **Impact:** Loss of trust in the "Sovereign" promise.
- **Test:** Attempting to access a Tenant's vault using a generic Admin key.

**Mitigation (The Fix):**
- **Admin PIN Salt:** Ensure the `verifyAdminPin` function uses a salt unique to the organization, so a Master PIN cannot unlock a Tenant Vault.
- **Audit Logging:** Every use of `audit_tenant` must be logged to a permanent, immutable `system_audits` collection in Firestore, visible to the Tenant.

---

## Execution Order
1.  **Immediate:** Implement **Redis Circuit Breaker** (API stability).
2.  **Immediate:** Implement **Low Balance Nudge** (Revenue protection).
3.  **High Priority:** Scope and integrate **Monnify/Paystack API** (Fraud protection).
4.  **Ongoing:** Refine **Admin PIN** logic.
