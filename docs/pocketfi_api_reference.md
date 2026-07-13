# PocketFi.ng API Reference

This document serves as the internal API reference for integrating PocketFi.ng into NaijaAgent Core. 

## Base URLs
*   **Live Environment:** `https://api.pocketfi.ng/api/v1`
*   **Sandbox Environment:** `https://api.pocketfi.ng/api/test`

## Authentication
All requests must include your Secret Key in the `Authorization` header as a Bearer token.
*   **Header:** `Authorization: Bearer YOUR_API_TOKEN`
*   **Content-Type:** `application/json`
*   **Accept:** `application/json`

---

## 1. Checkout & Payments

### Initialize Payment
Create a checkout session and redirect the user.
*   **Endpoint:** `POST /api/v1/checkout/request`
*   **Payload:**
    ```json
    {
      "first_name": "Musa",
      "last_name": "Damilare",
      "phone": "09065903789",
      "business_id": "29492",
      "email": "musaibrahim@yahoo.com",
      "redirect_link": "https://yoursite.com/payment/callback",
      "amount": "100" // Amount in NGN
    }
    ```

### Confirm Payment
Verify a payment server-side after redirection.
*   **Endpoint:** `POST /api/v1/checkout/confirm`
*   **Payload:**
    ```json
    {
      "payment_id": "PFI|7000223370"
    }
    ```

---

## 2. Webhooks
Webhooks are sent as POST requests to your registered endpoint. 
*   **Signature Verification:** Check the `HTTP_POCKETFI_SIGNATURE` header. It contains an HMAC-SHA512 hash of the raw request body signed with your Secret Key.
*   **Payload Structure:**
    ```json
    {
      "order": {
        "amount": 5000.00,
        "settlement_amount": 4875.00,
        "fee": 125.00,
        "description": "Payment for Order #1234"
      },
      "transaction": {
        "reference": "pfi_ref_123456"
      }
    }
    ```

---

## 3. Virtual Accounts (The Alajo Vault)

### Create Virtual Account
Generate a static or dynamic virtual bank account for wallet funding.
*   **Endpoint:** `POST /api/v1/virtual-accounts/create`
*   **Payload (Static):**
    ```json
    {
      "first_name": "Ibrahim",
      "last_name": "Musa",
      "phone": "09029163518",
      "email": "ibrahim@example.com",
      "businessId": "29492",
      "bank": "kuda" // Options: saveheaven, paga, kuda, 9psb, palmpay
      // "nin": "12345678901", (Required for PalmPay)
      // "bvn": "22334455667"  (Required for PalmPay)
    }
    ```
*   **Payload (Dynamic / One-Time):**
    Add `"amount": "5000"` and `"type": "dynamic"` to the payload.

### Fetch Virtual Accounts
*   **Endpoint:** `GET /api/v1/virtual-accounts/fetch?businessId=YOUR_ID`

---

## 4. Payouts (Withdrawals)

### Get Bank List
*   **Endpoint:** `GET /api/v1/payout/bank-list`

### Verify Bank Account
Resolve the account name before transferring.
*   **Endpoint:** `POST /api/v1/payout/verify-bank`
*   **Payload:**
    ```json
    {
      "account_number": "9029163515",
      "bank_code": "100004"
    }
    ```

### Bank Transfer
*   **Endpoint:** `POST /api/v1/payout/send`
*   **Payload:**
    ```json
    {
      "account_name": "IBRAHIM DAMILARE MUSA",
      "account_number": "9029163515",
      "bank_code": "100004",
      "amount": "100" // Amount in NGN
    }
    ```

---

## 5. Account Management & Utility

### Check Account Balance
*   **Endpoint:** `GET /api/v1/account/balance`

### Send WhatsApp OTP
*   **Endpoint:** `POST /api/v1/request/otp`
*   **Payload:**
    ```json
    {
      "support_number": "09012345678",
      "phone_number": "09029153515",
      "business_id": "29492",
      "otp": "123456"
    }
    ```

### Customer Management
*   **Update:** `POST /api/v1/vcutomer/update`
*   **Delete:** `POST /api/v1/vcutomer/delete`
*   **Fetch:** `GET /api/v1/vcutomer/fetch?businessId=YOUR_ID`

### Identity Verification
*   **NIN / BVN Enquiry:** `POST /api/v1/verification`
    *   Payload needs `"type": "basic" | "enhanced"`, `"verify_type": "nin" | "bvn"`, and `"number"`. Basic requires matching fields (firstName, lastName, etc.).
*   **BVN Full Verification:** `POST /api/v1/verification/bvn`
