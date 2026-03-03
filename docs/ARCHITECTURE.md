# System Architecture & Tech Stack

## 1. Technology Stack

| Component | Technology | Reasoning |
| :--- | :--- | :--- |
| **Runtime** | **Node.js (v20 LTS)** | Robust ecosystem, excellent for I/O heavy tasks. |
| **Language** | **TypeScript** | Type safety for complex logic and maintainability. |
| **Web Framework** | **Fastify** | High performance, low overhead, schema-based validation. |
| **Database** | **Firebase Firestore** | NoSQL over HTTPS. Bypasses IPv6/TCP connection issues in Termux. |
| **Task Queue** | **BullMQ + Redis** | Decouples webhook ingestion from AI processing to prevent timeouts. |
| **AI Model** | **Gemini 1.5 Flash** | Lowest cost/performance ratio, 1M context, Native Audio. |
| **WhatsApp Provider** | **Meta Cloud API** | Direct integration (No markup), official stability. |
| **Hosting** | **Railway / Hetzner** | Docker-based, predictable pricing, easy scaling. |

## 2. High-Level Architecture

```mermaid
graph TD
    User((User)) -->|WhatsApp Message| MetaAPI[Meta Cloud API]
    MetaAPI -->|Webhook (POST)| WebhookSvc[Webhook Service (Fastify)]
    WebhookSvc -->|1. Verify Signature| WebhookSvc
    WebhookSvc -->|2. Push Job| Redis[(Redis Queue)]
    WebhookSvc -->|3. Return 200 OK| MetaAPI
    
    Worker[AI Worker (Node.js)] -->|Pop Job| Redis
    Worker -->|Fetch Context| DB[(Firestore)]
    Worker -->|Generate Response| Gemini[Gemini 1.5 Flash API]
    
    subgraph "AI Processing"
        Gemini -->|Tool Call?| Worker
        Worker -->|Execute Tool| ExternalAPIs[External APIs / DBs]
        ExternalAPIs -->|Result| Worker
        Worker -->|Final Response| Gemini
    end
    
    Worker -->|Send Reply| MetaAPI
    Worker -->|Save History| DB
```

## 3. Data Model (NoSQL / Firestore)

### `organizations` (Collection)
*   `id` (Doc ID)
*   `name` (String)
*   `whatsappPhoneId` (String, Unique Index)
*   `systemPrompt` (Text)
*   `config` (Map: tools: string[])
*   `balance` (Number, Kobo)
*   `costPerReply` (Number, Kobo)

### `chats` (Collection)
*   `id` (Doc ID: {orgId}_{userPhone})
*   `organizationId` (String)
*   `whatsappUserId` (String)
*   `userName` (String)
*   `summary` (Text)
*   `messages` (Sub-collection)
    *   `role` (user/assistant)
    *   `content` (Text)
    *   `type` (text/audio)
    *   `timestamp` (ServerTimestamp)

## 4. Key Workflows

### 4.1 Ingestion (Fast Lane)
1.  **Receive:** Endpoint `/webhook` accepts POST payload.
2.  **Verify:** Check `X-Hub-Signature-256` against `APP_SECRET`.
3.  **Queue:** Extract minimal data (`from`, `id`, `text`/`audio`, `timestamp`) and push to `whatsapp-queue`.
4.  **Respond:** Return HTTP 200 immediately.

### 4.2 Processing (Slow Lane)
1.  **Job Start:** Worker picks up job.
2.  **Context:** Fetch last 10 messages from Firestore sub-collection.
3.  **AI Request:** Send System Prompt + History + New Message (Text or Audio Buffer) to Gemini.
4.  **Action:** If Gemini requests a function call, execute it and feed result back.
5.  **Reply:** Send final text response via Meta Graph API.
6.  **Accounting:** Deduct `costPerReply` from `organizations` doc via a **Firestore Transaction**.
