# System Architecture & Tech Stack (Cloud Native)

## 1. Technology Stack

| Component | Technology | Reasoning |
| :--- | :--- | :--- |
| **Runtime** | **Node.js (v20 LTS)** | Industry standard for high-concurrency event-driven apps. |
| **Language** | **TypeScript** | Strict typing for financials and complex state management. |
| **Web Framework** | **Fastify** | Lowest overhead for webhook ingestion. |
| **Database** | **Firebase Firestore** | Serverless, globally distributed NoSQL over HTTPS. |
| **Task Queue** | **BullMQ + Railway Redis** | Production-grade managed queue system. |
| **AI Model** | **Gemini 1.5 Flash** | Multimodal (Audio/Vision) support at 1/10th the cost of GPT-4. |
| **Hosting** | **Railway.app (Docker)** | Automated deployments from GitHub with public SSL endpoints. |

## 2. Production Architecture

```mermaid
graph TD
    User((User)) -->|WhatsApp Message| MetaAPI[Meta Cloud API]
    MetaAPI -->|Webhook (POST)| RailwayAPI[Railway API Service]
    
    subgraph "Railway.app Cloud"
        RailwayAPI -->|Verify Signature| RailwayAPI
        RailwayAPI -->|Push Job| RailwayRedis[(Managed Redis)]
        RailwayWorker[Railway Worker Service] -->|Pop Job| RailwayRedis
    end
    
    subgraph "Google Cloud"
        RailwayWorker -->|Context & Transactions| Firestore[(Firestore)]
        RailwayWorker -->|Inference| Gemini[Gemini 1.5 Flash]
    end
    
    RailwayWorker -->|Send Text/Audio| MetaAPI
    MetaAPI -->|WhatsApp Reply| User
```

## 3. Data Model (Final Production)

### `organizations`
*   Managed via Firestore Transactions for **Prepaid Credit** integrity.
*   Multi-tenant routing via `whatsappPhoneId`.

### `chats`
*   Doc ID format: `{orgId}_{userPhone}` for O(1) lookup.
*   Conversational history stored in `messages` sub-collection.

## 4. Operational Workflows (Production)

### 4.1 Hybrid Authentication
The `@naija-agent/firebase` package uses a fall-through strategy for credentials:
1.  **Local (Termux):** Reads `serviceAccountKey.json`.
2.  **Cloud (Railway):** Parses `FIREBASE_SERVICE_ACCOUNT` environment variable.

### 4.2 Webhook Security
*   **Signature Verification:** Every Meta request is verified against `WHATSAPP_APP_SECRET` using SHA256 HMAC.
*   **Idempotency:** `message_id` is tracked in Redis for 1 hour to prevent double-processing during Meta retries.
