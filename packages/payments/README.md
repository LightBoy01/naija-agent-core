# @naija-agent/payments

## Overview and Purpose

The `@naija-agent/payments` package provides a unified interface and implementations for various payment and financial service providers used across the Naija Agent platform. It abstracts the complexities of individual provider APIs into a standard `PaymentProvider` interface, allowing the core application (like Aelixxr and the AI workers) to handle transactions, virtual accounts, payouts, and utility vending uniformly.

This package primarily supports:
- **Paystack**: Traditional card payments and checkout links.
- **Monnify**: Deep integrations for virtual accounts (Alajo Vault), payouts/withdrawals, Value Added Services (VAS) for utility vending, and standard checkouts.
- **PocketFi**: Alternative provider for virtual accounts, payouts, identity verification (BVN/NIN), and WhatsApp OTPs.
- **Peyflex**: Specialized provider for utility bills (electricity) and airtime/data recharge e-pins.
- **Mock**: A mock provider for development and testing environments.

## Key Dependencies

- **`axios`** (`^1.6.0`): Used for making HTTP requests in Paystack, PocketFi, and Peyflex implementations.
- **`crypto`** (Node.js Native): Used by Paystack and Monnify to verify incoming webhook signatures (SHA-512 HMAC) to ensure webhook authenticity.
- **`typescript`**: For strong typing of API requests, responses, and internal interfaces.

*Note: The `Monnify` provider implementation uses the native `fetch` API instead of `axios`.*

## Core Integrations & Logic

The package exposes a standard `PaymentProvider` interface that defines common methods such as `verify()`, `createPaymentLink()`, `payout()`, and `refund()`.

### 1. Webhook Verification Logic
Security is critical for payment webhooks. Both Paystack and Monnify providers include a `verifyWebhookSignature(payload: string, signature: string): boolean` method.
- The payload is hashed using `crypto.createHmac('sha512', secretKey)`.
- The resulting hex digest is strictly compared against the `signature` header provided by the payment gateway to prevent spoofing.

### 2. Provider Details

#### Monnify (`src/monnify.ts`)
- **Authentication**: Manages dynamic OAuth access tokens (`getAccessToken()`) that are cached and refreshed before expiry (55 minutes).
- **Checkout & Verify**: Provides `createPaymentLink` (via "Initialize Transaction") and `verify` (with a 50 NGN tolerance).
- **Alajo Vault (Virtual Accounts)**: Utilizes `reserveAccount` to provision dedicated virtual accounts for users, requiring KYC (BVN/NIN) for Monnify v2.
- **Payouts (Withdrawals)**: Implements `resolveAccount` to verify destination bank details and `payout` for transferring funds out of the Monnify Wallet.
- **Value Added Services (VAS)**: Includes methods for biller resolution (`getBillers`, `getBillerProducts`), customer validation (`validateUtilityCustomer`), and vending (`vendUtility`).

#### Paystack (`src/paystack.ts`)
- **Checkout & Verify**: Implements `createPaymentLink` and `verify`. Paystack returns amounts in Kobo, which the provider normalizes to Naira (with a +/- 10 NGN tolerance check).
- **Refunds**: Provides `refund` capability for previous transactions.

#### PocketFi (`src/pocketfi.ts`)
- **Virtual Accounts**: Implements `createVirtualAccount` with support for selecting the backing bank (e.g., Saveheaven, Kuda, Paga, 9psb, Palmpay).
- **Payouts**: Supports `getBanks`, `verifyBankAccount`, and `payout` functionalities.
- **KYC & Utility**: Provides identity verification (`verifyBVN`, `verifyNIN`) and WhatsApp OTP functionalities.

#### Peyflex (`src/peyflex.ts`)
- **Utilities & Connectivity**: Implements `verifyMeter` (for electricity), `purchaseRechargeCard` (for e-pins), and `purchaseAirtimeData`.

### 3. Factory and Interfaces (`src/index.ts`)
The `getProvider(...)` factory function is exported to instantiate the appropriate provider based on configuration strings (`'paystack'`, `'monnify'`, `'pocketfi'`, or `'mock'`), automatically injecting the necessary API keys, contract codes, or business IDs.

## Key Modules/Directory Structure

```text
packages/payments/
├── package.json          # Package metadata and dependencies
├── tsconfig.json         # TypeScript configuration
├── src/
│   ├── index.ts          # Provider factory (`getProvider`), Interfaces, MockProvider
│   ├── monnify.ts        # Monnify implementation (Payments, VA, VAS, Payouts)
│   ├── paystack.ts       # Paystack implementation (Payments, Webhooks, Refunds)
│   ├── peyflex.ts        # Peyflex implementation (Airtime, Data, Electricity)
│   └── pocketfi.ts       # PocketFi implementation (VA, KYC, OTP, Payouts)
└── dist/                 # Compiled JavaScript output (generated after build)
```
