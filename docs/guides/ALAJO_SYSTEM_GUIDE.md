# Alajo Sovereign Financial System Guide

## 1. Overview
The Alajo system transitions Aelixxr from a conversational companion into a **Sovereign Financial Manager**. It enables users to hold real Naira in a secure "Vault," which Aelixxr can then use to pay bills, buy energy credits, or manage long-term savings goals.

---

## 2. Core Architecture: The "One-Vault" Strategy
Every Aelixxr user is assigned exactly one dedicated **Monnify Virtual Account**.
- **Inflow:** Funds transferred to this account are automatically credited to the user's `vaultBalanceNaira` in Firestore.
- **Webhook Prefix:** All virtual accounts use the secure `aelixxr_vault_{phone}` reference prefix to prevent collisions with business tenant payments.
- **Isolation:** `vaultBalanceNaira` (Real Money) is strictly separated from `energyCredits` (AI Fuel).

---

## 3. Revenue & Utility Engine
### Automated Vending (Monnify VAS)
Aelixxr can vend real-world services using the user's Vault balance:
1. **Airtime & Data:** (MTN, Airtel, Glo, 9mobile).
2. **Electricity:** All major Nigerian DisCos (IKEDC, EKEDC, etc.).

### Revenue Model
- **Platform Fee:** A flat **₦100 convenience fee** is added to every utility transaction.
- **Commissions:** NaijaAgentHQ collects the 1% – 4% cashback provided by Monnify on each vend.

---

## 4. The Iron Shield (Security)
### PIN Protocol
- **Storage:** All PINs are hashed using **Salted Bcrypt**. Plain-text PINs never touch the database.
- **Enforcement:** A 4-digit PIN is **mandatory** for every high-stakes tool call:
  - `withdraw_vault_funds`
  - `vend_utility`
  - `convert_vault_to_energy`
- **Rate Limiting:** Users are locked out of their Vault for **15 minutes** after 3 consecutive incorrect PIN attempts.

### AI Interceptor (Anti-Hallucination)
- **Deterministic Check:** A regex interceptor in `handleLifeChat` catches 4-digit PINs before they reach the AI.
- **Context Injection:** The PIN is injected as a secure `[SYSTEM SECURITY]` instruction. This prevents Aelixxr from hallucinating the PIN or repeating it in the chat history.
- **PII Scrubbing:** The `redactPII` tool aggressively redacts strings explicitly labeled as PINs (e.g., "My pin is 1234") before saving data to the Vault.

---

## 5. Tool Reference
| Tool Name | Description |
| :--- | :--- |
| `get_recharge_details` | Generates/Retrieves the user's personal Virtual Account. |
| `get_financial_statement` | Reports the current Vault and Energy balances. |
| `convert_vault_to_energy` | Moves Naira from Vault to Battery (Energy Credits). |
| `resolve_bank_account` | Validates a Nigerian bank account name/code. |
| `withdraw_vault_funds` | Transfers Vault funds to a personal bank account (₦50 fee). |
| `vend_utility` | Purchases Airtime, Data, or Electricity (₦100 fee). |

---

## 6. Operational Notes
- **Withdrawals:** Require manual IP whitelisting with Monnify Support for the production server.
- **Refunds:** Failed transactions trigger an automatic "INTERNAL_REFUND" to the user's Vault with a clear WhatsApp notification.
- **Auto-Onboarding:** Users without a PIN are prompted to set one during their first financial transaction.
