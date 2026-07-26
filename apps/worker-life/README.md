# Aelixxr Life OS (LOS) Worker

## 1. Overview and Purpose
The `worker-life` package is the core background processing engine for the Aelixxr Life OS. It operates as a high-concurrency BullMQ worker connected to Redis, responsible for handling asynchronous, long-running, and intensive AI tasks. 

Instead of processing requests synchronously on the API Gateway, the system queues tasks which this worker pulls and executes. It handles everything from user chat processing and proactive system heartbeats, to cron-based operations, Small Language Model (SLM) delegations, and Vault Webhooks.

## 2. Key Technologies
- **Queue/Broker:** `bullmq`, `ioredis`
- **AI SDKs:** `@google/genai` (Primary models), `@naija-agent/ai` (Dynamic Capability Router)
- **Tool Protocol:** `@modelcontextprotocol/sdk` (MCP integration)
- **Database/Storage:** `@naija-agent/database` (PostgreSQL), `@naija-agent/firebase` (Firestore legacy/hybrid)
- **Logging:** `pino`, `pino-pretty`
- **Utilities:** `axios`, `cheerio`, `date-fns`, `pdf-parse`, `libphonenumber-js`

## 3. Architecture

### Triad Architecture & Job Handlers
The worker is organized around domain-specific Job Handlers which decouple logic based on the `job.name` received from the queue. This is crucial for maintaining scalability:
- **Chat Handlers** (`process-message`, `life-chat`, `life-chat-resume`)
- **Cron Handlers** (`sovereign-cron-tick`)
- **Heartbeat Handlers** (`life-heartbeat`, `proactive-nudge`)
- **SLM Handlers** (`execute-slm-task`)
- **Maintenance** (`market-scrape`, `consolidate-memory`)
- **Webhooks** (`life-vault-deposit`)

### The Life Pipeline & Interceptors
Before a chat message reaches the AI Orchestrator, it passes through the `LifePipeline` — an interceptor pattern designed to sanitize, validate, and enrich the context.
- **Interceptors** (executed in order): `context.ts` → `spam.ts` → `security.ts` → `media.ts`
- If an interceptor flags an issue (e.g., spam detected, unauthorized access), it triggers a `shortCircuit` on the context, preventing expensive LLM calls.
- Energy credit checks happen at tool execution time via `billingService.ts`, not as a pipeline interceptor.

### Dynamic AI Routing
Instead of hardcoding a single AI provider, the worker leverages `@naija-agent/ai` (`AIFactory.createRouter`). This allows the Orchestrator to dynamically route intents to the cheapest or most capable model (e.g., Gemini for reasoning, DeepSeek/DashScope for specialized fallback tasks).

### Model Context Protocol (MCP) Integration
The worker seamlessly merges static tools with dynamic external tools via the Model Context Protocol (MCP).
- During startup (`index.ts`), the `mcpClient` connects to local servers to bootstrap tools.
- External tools are appended to `LIFE_TOOLS`.
- `toolExecutor.ts` and `src/tools/index.ts` intercept tool calls. If a tool isn't recognized statically, it falls back to execution via MCP.

### Energy Billing System
The ecosystem operates on a sovereign financial model where compute requires "Energy Credits" (1 Credit = 1000 Kobo).
- Defined in `config/billing.ts`.
- Tools have specific costs (e.g., `web_search` costs 3000 Kobo, `delegate_to_hermes` costs 10000 Kobo).
- Default tool execution costs 3000 Kobo.
- Ensures monetization and prevents API abuse by deducting Vault balances.

## 4. Core Modules / Directory Structure

```text
apps/worker-life/
├── src/
│   ├── config/       # Configuration constants (billing rules, sector definitions).
│   ├── handlers/     # BullMQ job processors (Chat, Cron, Heartbeat, SLM, Webhooks).
│   ├── pipeline/     # LifePipeline and Interceptors (Context → Spam → Security → Media).
│   ├── prompts/      # Core System Prompts (Aelixxr Soul, Alajo Skill).
│   ├── services/     # Core logic (Billing, MCP, Memory, Docker, Vault, Prompt, Whatsapp).
│   ├── tools/        # Static tool definitions & Executors (Finance, Vault, Utility, Education).
│   ├── utils/        # Shared utilities (Logger, Security hashing, Timezone config, Formatting).
│   └── index.ts      # Application entry point, Redis/BullMQ connection, and Job Switch statement.
├── package.json      # Dependencies and scripts (build, dev, test).
└── tsconfig.json     # TypeScript configuration.
```
