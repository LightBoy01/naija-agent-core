# System Architecture & Tech Stack (Multi-Tenant Sovereign Hierarchy)

## 1. Technology Stack

| Component | Technology | Reasoning |
| :--- | :--- | :--- |
| **Runtime** | **Node.js (v20 LTS)** | Industry standard for high-concurrency event-driven apps. |
| **Language** | **TypeScript** | Strict typing for financials and complex state management. |
| **Web Framework** | **Fastify** | Lowest overhead for webhook ingestion. |
| **Database** | **Firebase Firestore** | Serverless, globally distributed NoSQL over HTTPS. |
| **Storage** | **Firebase Storage** | Persistent archiving for Receipts, Audio, and Products. |
| **Task Queue** | **BullMQ + Railway Redis** | Production-grade managed queue system. |
| **AI Model** | **Gemini 2.5 Flash** | Multimodal (Audio/Vision) support at 1/10th the cost of GPT-4. |
| **Hosting** | **Railway.app (Docker)** | Automated deployments from GitHub with public SSL endpoints. |

## 2. Sovereign Architecture (The Hierarchy of Power)

```mermaid
graph TD
    Sovereign((Sovereign Owner)) -->|WhatsApp| MasterBot[Master Bot COO]
    MasterBot -->|Manage| TenantOrgs[Tenant Organizations]
    TenantOrgs -->|Employs| TenantBots[Tenant Business Agents]
    TenantBots -->|Sales/Support| Customers((End Customers))
    
    subgraph "Railway.app Cloud"
        RailwayAPI[API Service] -->|Queue| RailwayRedis[(Redis)]
        RailwayRedis -->|Worker| RailwayWorker[Worker Service]
    end
    
    subgraph "Worker Logic (Identity-Based)"
        RailwayWorker -->|Is Sovereign?| MasterPowers[Super Tools: create_tenant, get_network_stats]
        RailwayWorker -->|Is Boss?| AdminPowers[Management Tools: save_knowledge, delete_knowledge, manage_activity]
        RailwayWorker -->|Is Customer?| SalesPowers[Inference: Knowledge Base + Gemini Vision]
    end
    
    subgraph "Persistence Layer"
        Firestore[(Firestore DB)]
        FirebaseStorage[(Firebase Storage)]
    end
```

## 3. Data Model (Final Production)

### `organizations` (Multi-Tenant Config)
*   **Core:** `id`, `name`, `whatsappPhoneId`, `systemPrompt`.
*   **Identity:** `config.adminPhone`, `config.adminPin`, `config.isMaster`.
*   **Financials:** `balance` (Kobo), `subscriptionPlan`, `paymentConfig`.
*   **Knowledge:** Sub-collection `knowledge` (Key-Value facts for AI training).
*   **Activities:** Sub-collection `activities` (Waybills, Bookings, Orders).

### `chats`
*   Doc ID format: `{orgId}_{userPhone}`.
*   Security: `lastAdminAuthAt` tracks the 2-hour PIN session window.

### `transactions` (Replay Protection)
*   Logs verified payments to prevent duplicate receipt usage.

## 4. Operational Workflows (Hybrid Hub)

The system operates as a **Hybrid Hub**, splitting responsibility between high-trust messaging and high-utility web management.

### 4.1 Front-Office: WhatsApp (Sales & Inquiries)
The customer interacts with the **Digital Apprentice** on WhatsApp.
- **AI Core:** Gemini 2.5 Flash handles natural language, Pidgin, and Vision.
- **Transactions:** Payments are verified via Vision OCR or SMS Bridge signals.
- **Auto-Loop:** Critical status updates are pushed to the customer automatically.

### 4.2 Back-Office: Web Dashboard (Operations & Auditing)
The Boss and Staff interact with the **Merchant Hub** at `/login`.
- **Live Board:** A real-time view of all pending orders, waybills, and bookings.
- **Inventory:** Direct visual management of prices, stock, and product categories.
- **Fulfillment:** One-tap status updates (e.g. `Mark Packed`) that trigger WhatsApp notifications.

### 4.3 Identity & Session Security
- **WhatsApp:** 2-hour sliding window secured by a 4-digit PIN for management tools.
- **Web:** Persistent HTTPS-only cookies (`tenant_session`) secured by PIN-based authentication and Sovereign-level sanitization.

### 4.4 Decentralized Proactivity (The "COO" Engine)
To prevent the Master Bot from becoming a bottleneck, proactive tasks (Morning Reports/Reminders) are decentralized:
*   **Infrastructure:** A BullMQ Cron Worker triggers a daily job at 8:00 AM for all active Organizations.
*   **Context:** The job is pushed to the `whatsapp-queue` with the specific `orgId`.
*   **Execution:** The Worker process retrieves the Org's unique `adminPhone` and `systemPrompt`, then uses the Client Bot's own identity to message the Boss. This ensures that every bot operates as an independent "Digital COO" within its own rate limits and context.

### 4.5 Financial Integrity (Sovereign Vault)
To ensure the sum of all Tenant Balances equals the Total Network Liability, we use an **Eventual Consistency** model:
1.  **Atomic Deductions:** Tenant balances are updated transactionally.
2.  **Fire-and-Forget Aggregation:** The global vault total is updated optimistically.
3.  **Safety Net:** If the optimistic update fails, the error is logged to `failed_ledger_updates`.
4.  **Reconciliation:** A nightly cron job (`scripts/reconcile-ledger.ts`) audits all tenant balances and corrects any drift in the Sovereign Vault.

## 5. Legacy Components (Deprecated)

### SMS Bridge (Android Relay)
*   **Status:** Deprecated (March 2026).
*   **Replacement:** Vision-First Verification (AI Receipt Analysis) & Direct API Integration.
*   **Reason:** High operational friction and security complexity.
*   **Legacy Support:** The API endpoints (`/bridge/sms`) remain active for existing high-value clients, secured by HMAC-SHA256 signatures. The code has been archived in `legacy_bridge/`.
