# Naija Agent Core — Codebase Review
**Date:** 2026-07-27 (Updated) | **Branch:** master | **TypeScript:** 5.9.3

---

## 1. Project Overview

Naija Agent Core is a **WhatsApp-first AI Business Operating System** targeting the Nigerian market, built as an npm workspaces monorepo. It has two product lines:

| Product | Persona | Purpose |
|---|---|---|
| **Zynux** | Business AI Agent | Customer chat, order-taking, payment verification (receipt scanning), inventory management, daily reports. Sector packs: Commerce, Health, Property, Legal. |
| **Aelixxr** | Personal "Life OS" AI | Saving goals, bill payments, proactive nudges, heartbeats, study buddy, vault document ingestion, sovereign cron autonomy, market scraping. |

A third component, **Hermes Agent** (Nous Research, Python v0.13.0), sits in `hermes-agent/` as a git submodule — an upstream open-source agent framework used as a high-capability MCP execution engine. Aelixxr delegates heavy autonomous tasks (deep research, Python scripting, multi-step workflows) to Hermes via the Model Context Protocol.

---

## 2. Monorepo Structure

```
naija-agent-core/
├── apps/                    # 5 runtime deployables
│   ├── api/                 # Fastify HTTP server — webhook ingestion, cron triggers, SMS bridge
│   ├── worker/              # BullMQ worker — Zynux business AI pipeline
│   ├── worker-life/         # BullMQ worker — Aelixxr Life OS pipeline
│   ├── web/                 # Next.js 15 dashboard — sovereign + tenant portals
│   └── whatsapp-sidecar/    # Go binary (whatsmeow) — multi-tenant WhatsApp session management
│
├── packages/                # 7 shared libraries
│   ├── types/               # Foundation — Zod schemas, interfaces, config, utils
│   ├── ai/                  # AI provider abstraction — Gemini, DeepSeek, Qwen with dynamic routing + failover
│   ├── database/            # PostgreSQL via Drizzle ORM — 18 tables, pgvector, all data access
│   ├── firebase/            # Firestore access layer (legacy, being migrated to Postgres)
│   ├── storage/             # Multi-cloud storage — S3, GCS, Cloudinary, Alibaba OSS, Tencent COS + AI vault
│   ├── payments/            # Paystack + Monnify payment verification
│   └── logistics/           # Terminal.africa shipping rates/tracking
│
├── hermes-agent/            # Upstream Nous Research Hermes Agent (Python, v0.13.0)
├── docs/                    # Documentation
├── scripts/                 # Build, start, seed scripts
└── searxng-settings/        # SearXNG search engine configuration
```

---

## 3. Apps — Detailed Breakdown

### 3.1 `apps/api` — HTTP Ingestion Server

| Attribute | Detail |
|---|---|
| **Framework** | Fastify v4 |
| **Entry** | `apps/api/src/index.ts` (default port 3000) |
| **Role** | Central webhook ingestion for WhatsApp Cloud API, Paystack, Monnify. Triggers cron jobs. Proxies SMS bridge and sidecar requests. |
| **Dependencies** | `@naija-agent/firebase`, `@naija-agent/types`, `bullmq`, `ioredis`, `fastify`, `date-fns`, `pino` |
| **Queues** | Publishes to `whatsapp-queue` (Zynux) and `life-queue` (Aelixxr) |

**Key files:**
- `src/index.ts` — Server bootstrap, Redis/Queue setup, all route registrations
- `src/routes/webhooks.ts` — WhatsApp/Paystack/Monnify webhook verification, message parsing, opt-out handling, queue dispatching
- `src/routes/crons.ts` — Scheduled triggers: daily reports, cart recovery, reminders, inventory alerts, life heartbeats, sovereign ticks
- `src/routes/legacy-bridge.ts` — SMS bridge ingestion with bridge-secret auth
- `src/utils/currency.ts` — Currency formatting

**Key patterns:**
- Two-queue routing: messages for `aelixxr` org go to `life-queue`, everything else to `whatsapp-queue`
- Idempotency via Redis `processed:{orgId}:{messageId}` keys
- Dynamic WhatsApp app secret per org
- Webhook signature verification (HMAC-SHA256)
- Paystack/Monnify payment webhook processing with per-organization API keys (no global fallback)
- Dispute and refund event handling (create, resolve, refund status updates)

---

### 3.2 `apps/worker` — Zynux Business Worker

| Attribute | Detail |
|---|---|
| **Framework** | BullMQ Worker |
| **Entry** | `apps/worker/src/index.ts` |
| **Architecture** | **Triad Architecture** (Loads dynamic prompts via `Zynux.Soul.md`, `Agent.md`) |
| **Concurrency** | 50, rate-limited to 10 jobs/sec |
| **Queue** | `whatsapp-queue` |
| **Dependencies** | `@naija-agent/firebase`, `@naija-agent/payments`, `@naija-agent/storage`, `@naija-agent/types`, `@google/genai`, `axios`, `bcrypt`, `bullmq`, `ioredis`, `libphonenumber-js`, `pino` |

**Pipeline (Chain of Responsibility):**
1. **org-load** — Load organization/tenant context
2. **referral** — Referral tracking
3. **feedback** — Feedback collection
4. **media** — Download attached media (images, audio, documents)
5. **spam** — Spam detection
6. **rate-limit** — Rate limiting
7. **fraud** — Fake receipt detection
8. **security** — PIN/authentication verification
9. **mfa** — Multi-factor authentication
10. **billing** — Credit deduction (with rollback on failure)

Any interceptor can `shortCircuit` the message, stopping further processing.

**Handlers:**
- `messaging.ts` — Core AI chat
- `onboarding.ts` — Onboarding flows
- `reporting.ts` — Daily/master reports
- `reminders.ts` — Cart recovery, scheduled reminders, inventory cleanup
- `system.ts` — Bridge health, outbound, template send, OTP
- `bridge.ts` — SMS bridge processing

**Sector Packs:** Commerce, Health, Property, Legal — each provides sector-specific entity schemas, workflow state machines, system prompts, and tool sets.

---

### 3.3 `apps/worker-life` — Aelixxr Life OS Worker

| Attribute | Detail |
|---|---|
| **Framework** | BullMQ Worker |
| **Entry** | `apps/worker-life/src/index.ts` |
| **Concurrency** | 20, rate-limited to 5 jobs/sec |
| **Queue** | `life-queue` |
| **Dependencies** | `@naija-agent/ai`, `@naija-agent/database`, `@naija-agent/firebase`, `@naija-agent/types`, `@google/genai`, `@modelcontextprotocol/sdk`, `bullmq`, `cheerio`, `ioredis`, `pdf-parse`, `pino` |

**Pipeline (Chain of Responsibility):**
1. **context** — Life memory/context loading
2. **spam** — Spam detection
3. **security** — PIN/authentication
4. **media** — Media download

Note: Energy credit checks happen at tool execution time via `billingService.ts`, not as a pipeline interceptor.

**Handlers:**
- `chatHandler.ts` — Life chat & resume
- `heartbeatHandler.ts` — Heartbeat evaluation, proactive nudges
- `slmHandler.ts` — Sector-specific SLM (Small Language Model) task execution
- `maintenanceHandler.ts` — Memory consolidation, market scraping
- `cronHandler.ts` — Sovereign cron tick
- `document.ts` — Document processing

**Services:** MCP client (Model Context Protocol), prompt service (hot-reload), life memory, nano memory (short-term/working), heartbeat, proactive, sleep cycle, study buddy, audio service, audit service, billing service, vault service, market data, WhatsApp service

**Billing Model:** Energy credits — each tool has a cost in Kobo (e.g., web_search = 3000 Kobo = 3 credits)

**Sector Packs:** Education, Research, Life, Commerce

---

### 3.4 `apps/web` — Sovereign Command Center

| Attribute | Detail |
|---|---|
| **Framework** | Next.js 15 (standalone output) |
| **Styling** | Tailwind CSS v4 |
| **Entry** | `apps/web/app/layout.tsx` |
| **Dependencies** | `@naija-agent/database`, `@naija-agent/firebase`, `@naija-agent/storage`, `@naija-agent/types`, `@ai-sdk/react`, `firebase`, `bullmq`, `react-markdown`, `recharts`, `lucide-react`, `qrcode.react`, `sonner` |

**Pages:**
| Route | Purpose |
|---|---|
| `/` | Landing/marketing page |
| `/dashboard` | Sovereign (master) dashboard |
| `/dashboard/[id]` | Per-tenant/org dashboard |
| `/auth` | Sovereign login |
| `/login` | Tenant login |
| `/auth/mfa` | Multi-factor authentication |
| `/chats/[id]` | Per-org chat viewer |
| `/vault` | Document vault with archive actions |
| `/settings` | Platform settings |
| `/qr/[id]` | QR code pair page for WhatsApp linking |
| `/playground` | Embedded AI chat test interface |
| `/autonomy` | Autonomy management |
| `/setup/[id]` | Organization onboarding setup |

**Middleware:** Session-based route protection — `sovereign_session` cookie for master routes, `tenant_session` cookie for tenant routes. Cross-tenant ID validation.

---

### 3.5 `apps/whatsapp-sidecar` — WhatsApp Session Manager

| Attribute | Detail |
|---|---|
| **Language** | Go 1.26.3 |
| **Framework** | `net/http` + `whatsmeow` (WhatsApp Web client) + `go-redis/v9` + `lib/pq` |
| **API Port** | 8080 |

**API Endpoints:**
| Method | Path | Purpose |
|---|---|---|
| POST | `/connect` | QR code pairing |
| POST | `/pair` | Phone number pairing code |
| POST | `/send` | Outbound text message |
| POST | `/send-media` | Image/media send (multipart with buffer) |
| POST | `/typing` | Typing indicator |
| GET | `/download/{mediaId}` | Media download (placeholder / not yet implemented) |

**Key features:**
- Multi-tenant WhatsApp sessions (one `whatsmeow.Client` per org, stored in PostgreSQL via `sqlstore.Container`)
- BullMQ native protocol — writes jobs directly into Redis in BullMQ-compatible format, bypassing the Node.js BullMQ library
- Two-queue routing based on org type (master/life orgs → `life-queue`, others → `whatsapp-queue`)
- Per-org proxy support for IP rotation via `proxy_url` column
- Human intervention detection — if a human sends from the bot's phone, AI is paused for 5 minutes for that chat (sliding window). 60-second grace period after pairing suppresses history-sync false positives
- Media handling — downloads all media types and saves to `/tmp/sidecar-media/`
- Welcome context injection — first user message after pairing carries privacy notice and steering wheel commands naturally via AI response (no self-message to avoid WhatsApp bot detection)
- `GetClient()` checks both `IsConnected()` and `IsLoggedIn()` before returning, preventing 463 errors on dead sessions
- `SendMessage` retries with 2/4/6s backoff for transient session state after pairing
- WhatsApp send retry with exponential backoff (Node worker side, 3 attempts)

---

## 4. Packages — Detailed Breakdown

### 4.1 `@naija-agent/types` — Foundation

**Depends on:** Nothing (leaf package)
**External deps:** `zod`, `libphonenumber-js`, `@google/genai`

Core TypeScript types, Zod schemas, constants, and utilities used by every other package.

**Key exports:**
- `WhatsAppMessage`, `WhatsAppWebhook`, `Organization`, `OnboardingData`, `Config`, `PaymentConfig`, `Staff`, `Product`, `Entity` (all Zod schemas with runtime validation)
- `JobData`, `LifeContext`, `TransactionData`, `Chat`, `Message`, `FraudRecord`, `VaultAuditLog` (TypeScript interfaces)
- `SectorPack`, `EntityDefinition`, `WorkflowDefinition` (sector-agnostic pluggable module definitions)
- `SystemConfig` — costs (in Kobo), limits, AI model names, defaults, contacts
- `parseAndFormatPhone()`, `formatCurrency()`, `parsePrice()`, `getPriceGuardRegex()`

---

### 4.2 `@naija-agent/ai` — AI Provider Abstraction

**Depends on:** `@naija-agent/types`
**External deps:** `@google/genai`, `openai`

Unified abstraction over multiple AI providers with automatic failover routing.

**Key components:**

| Component | Role |
|---|---|
| `AIProvider` interface | Standard contract for all providers |
| `AIOrchestrator` | Dynamic skill-based routing — selects cheapest capable model, fails over across sorted providers |
| `AIFactory` | Provider pool with caching by composite key |
| `GlobalModelRegistry` | 7 registered models with capability tags (`reasoning`, `tool-calling`, `audio-in`, `vision-in`, `summarization`, `data-processing`), cost profiles, max contexts |

**Providers:**
- `GeminiProvider` — Context caching (SHA-256 hash), history normalization, think tag stripping, Matryoshka embedding truncation to 768 dims
- `OpenAIProvider` — Schema type normalization, Gemini→OpenAI tool format translation, DeepSeek reasoning tag parsing
- `DashScopeProvider` — Extends OpenAIProvider for Alibaba DashScope (Qwen models)

---

### 4.3 `@naija-agent/database` — PostgreSQL / Drizzle ORM

**Depends on:** `@naija-agent/types`
**External deps:** `drizzle-orm`, `postgres`, `cron-parser`

Complete PostgreSQL schema and data access layer — the "SQL truth" side of the dual-database architecture.

**22 Drizzle table definitions plus 17 whatsmeow session tables:**
`organizations`, `users`, `transactions`, `memories` (pgvector), `referrals`, `chats`, `messages` (with `vector` + `reasoning` columns), `products`, `activities`, `cartItems`, `cronJobs`, `fraudRegistry`, `vaultSecrets`, `heartbeats`, `knowledge`, `staff`, `systemLogs`, `dailySnapshots`, `networkMetadata`, `stagingProducts`, `vaultDocuments` (vector embedding + extractedData)

**Query modules:**
- `organizations.ts` — Tenant CRUD, MFA codes, balance operations, sector queries
- `chat.ts` — Chat CRUD, full cart workflow (add/remove/reserve/release/clear/abandoned carts), admin auth, demo state
- `products.ts` — Product CRUD, staging workflow, atomic stock operations (reserve/release/finalize)
- `activities.ts` — Activity tracking and queries
- `cron.ts` — Cron job scheduling with cron-parser
- `fraud.ts` — Fraud registry (Scam-Shield G2: requires 2+ org consensus)
- `stats.ts` — Daily sales/expenses, weekly summaries, network health insights
- `logs.ts` — System event audit trail
- `db.ts` — Drizzle client init, atomic balance functions with idempotency

---

### 4.4 `@naija-agent/firebase` — Firestore Access Layer (Legacy)

**Depends on:** `@naija-agent/types`, `@naija-agent/database`
**External deps:** `firebase-admin`, `bcrypt`, `libphonenumber-js`

Firestore-based CRUD for organizations, chats, products, billing, onboarding, fraud, and more. Being actively migrated to PostgreSQL.

**Modules (14 files):**
- `orgs.ts`, `onboarding.ts`, `chats.ts`, `products.ts`, `activities.ts`, `billing.ts`, `ledger.ts`, `stats.ts`, `topup.ts`, `auth.ts`, `content.ts`, `fraud.ts`, `media.ts`, `polymorphic.ts`

**Notable:** `auth.ts` does dual-write to both Firestore (NoSQL) and PostgreSQL (SQL), with NoSQL-first reads and SQL fallback.

---

### 4.5 `@naija-agent/storage` — Multi-Cloud Storage

**Depends on:** `@naija-agent/firebase` (runtime import)
**External deps:** `@aws-sdk/client-s3`, `@google-cloud/storage`, `ali-oss`, `cloudinary`, `cos-nodejs-sdk-v5`

Multi-provider cloud storage with automatic fallback strategy and an AI-powered vault.

**Storage providers (priority order):**
1. Cloudflare R2 (S3-compatible)
2. Tencent COS
3. Alibaba OSS
4. Cloudinary
5. Firebase Storage (fallback)

**Sovereign Vault (Aelixxr):**
- `ingestDocument()` — Full pipeline: upload → Gemini multimodal extraction → embedding → Firestore save
- Forensic analysis — Inspects for Photoshop artifacts, font inconsistencies, tampering
- `searchVault()`, `getVaultFile()`, `deleteFromVault()`
- Supports direct UUID-based document lookup

---

### 4.6 `@naija-agent/payments` — Payment Verification

**Depends on:** Nothing (standalone)
**External deps:** `axios`

Standalone payment gateway integration for Nigeria.

**Providers:**
- `PaystackProvider` — `verify()` (kobo→naira conversion, ±10 NGN tolerance), `createPaymentLink()`, `verifyWebhookSignature()` (HMAC-SHA512)
- `MonnifyProvider` — Full OAuth2 token management, `verify()` (±50 NGN tolerance), `createPaymentLink()`, `reserveAccount()` (virtual accounts), `getBanks()`, `resolveAccount()`, `payout()`, `getBillers()`, `getBillerProducts()`, `validateUtilityCustomer()`, `vendUtility()` (airtime/data/electricity VAS). Auto-detects sandbox via `MK_TEST` prefix.

---

### 4.7 `@naija-agent/logistics` — Delivery & Logistics

**Depends on:** Nothing (standalone)
**External deps:** `axios`

Standalone shipping rate and tracking integration.

**Provider:** `TerminalAfricaProvider` — Real API integration for rates and tracking with status mapping (`delivered`/`failed`/`in_transit`/`pending`)

**Note:** This package is not currently consumed by any app. Likely future functionality.

---

## 5. Package Dependency Graph

```
                     @naija-agent/types  (FOUNDATION — zero internal deps)
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   @naija-agent/ai   @naija-agent/   @naija-agent/
    (types only)      database        firebase
                      (types only)    (types + database)
                          │                │
                          └────────┬───────┘
                                   │
                          @naija-agent/storage
                          (firebase — runtime import)

UNRELATED / STANDALONE:
   @naija-agent/payments  (only axios)
   @naija-agent/logistics  (only axios)
```

---

## 6. Data Flow

```
WhatsApp Message (Meta Cloud API)
  │
  ▼
apps/api (Fastify)
  ├── Verify webhook signature
  ├── Parse message
  ├── Check opt-out status
  ├── Idempotency check (Redis processed:{orgId}:{messageId})
  └── Enqueue to Redis BullMQ
         │
         ├── whatsapp-queue (Zynux business messages)
         └── life-queue (Aelixxr life messages)
              │
              ▼
┌─────────────────────────┐  ┌──────────────────────────┐
│ apps/worker (Zynux)     │  │ apps/worker-life (Aelixxr)│
│                         │  │                          │
│ Pipeline interceptors:  │  │ Pipeline interceptors:   │
│ org-load → referral →   │  │ context → spam →         │
│ feedback → media →      │  │ security → media         │
│ spam → rate-limit →     │  │                          │
│ fraud → security →      │  │ Handlers:                │
│ mfa → billing           │  │ Chat, Heartbeat, SLM,    │
│                         │  │ Cron, Nudge, Memory      │
│ Handlers:               │  │                          │
│ Messaging, Onboarding,  │  │ MCP Protocol for tools   │
│ Reporting, Reminders,   │  │                          │
│ System, Bridge          │  │ Energy credits billing   │
│                         │  │ (at tool execution)      │
│ AI via sector packs     │  │                          │
│ Dynamic model routing   │  │                          │
└────────┬────────────────┘  └───────────┬──────────────┘
         │                               │
         ▼                               ▼
  WhatsApp Cloud API (send reply) or Sidecar proxy

Alternative path (sidecar):
  whatsapp-sidecar (Go/whatsmeow)
    → Direct WhatsApp Web connection
    → Writes BullMQ jobs directly to Redis
    → API at localhost:8080 used as proxy by api service
```

---

## 7. Key Architectural Patterns

### 7.1 Pipeline / Interceptor Pattern
Both workers use a chain-of-responsibility pipeline. Interceptors execute sequentially — any can short-circuit (e.g., rate-limited user, failed MFA, insufficient credits) to prevent unnecessary AI calls.

### 7.2 Dynamic AI Capability Router
`@naija-agent/ai`'s `AIOrchestrator` selects models based on required skills (reasoning, tool-calling, audio-in, vision-in) and cost profile, with automatic failover across providers.

### 7.3 Sector Pack System
Industry verticals (Commerce, Health, Property, Legal, Education, Research, Life) are pluggable modules. Each defines entity schemas, workflow state machines, system prompts, and tool sets. `getSectorPack()` returns the right pack for an org's sector.

### 7.4 Intentional Dual Database Writing (Migration Safety)
The codebase is currently in a "Split-Brain" mode. This is a deliberate safety feature for migrating an active financial/AI application with zero-downtime. Actively migrating from Firebase Firestore to PostgreSQL (Drizzle ORM with pgvector).

| Layer | Database | Status |
|---|---|---|
| `@naija-agent/database` | PostgreSQL (Drizzle) | Primary target — schema, queries, migrations |
| `@naija-agent/firebase` | Firestore | Legacy — still used by worker for org/onboarding/fraud queries |

`worker` uses Firestore for org/onboarding/fraud lookups. `worker-life` uses PostgreSQL for chat history, memory, and vault. Auth module does dual-writes.

### 7.5 Energy Credits Billing (Aelixxr)
Each tool call has a cost in Kobo defined in `TOOL_COSTS`. Deducted from user balance before execution. Failures roll back.

### 7.6 MCP (Model Context Protocol)
`worker-life` integrates with the Model Context Protocol for tool orchestration, allowing dynamic tool discovery and execution.

---

## 8. Tech Stack Summary

| Component | Technology |
|---|---|
| **Runtime** | Node.js 22+ (Docker), Go 1.26.3 (sidecar) |
| **Language** | TypeScript 5.9.3, Go |
| **Monorepo** | npm workspaces |
| **Web Framework** | Fastify v4 (API), Next.js 15 (Web) |
| **Queue** | BullMQ + Redis (ioredis) |
| **SQL Database** | PostgreSQL with pgvector (Drizzle ORM) |
| **NoSQL Database** | Firebase Firestore (legacy, migrating) |
| **AI Models** | Gemini 3 Flash, Gemini 3.1 Pro, DeepSeek V4, Qwen3-Omni — abstracted via `@naija-agent/ai` |
| **Payments** | Paystack, Monnify |
| **Storage** | Cloudflare R2, GCS, Alibaba OSS, Cloudinary, Tencent COS |
| **Logistics** | Terminal.africa |
| **Search** | SearXNG (primary), Brave Search (fallback) |
| **WhatsApp** | Meta Cloud API + whatsmeow (Go sidecar) |
| **MCP** | @modelcontextprotocol/sdk |
| **Styling** | Tailwind CSS v4 |
| **Testing** | Vitest 4.1.0 |
| **Linting** | ESLint + Prettier |

---

## 9. Deployment

| Component | Platform |
|---|---|
| **API + Workers + Sidecar** | Docker on Coolify/Railway (unified container via `sovereign-start.sh`) |
| **Web Dashboard** | Vercel (Next.js standalone output) |
| **Redis** | Managed instance |
| **PostgreSQL** | Managed instance with pgvector extension |
| **Firestore** | Google Cloud (legacy, being phased out) |

---

## 10. Current State & Observations

### Git Status (July 2026)
- Branch: `master`
- 4 modified `tsbuildinfo` files (build artifacts, not source changes)
- Most recent work focuses on Triad Architecture decoupling and Phase 10 planning.

### Strengths
- Clean separation of concerns between packages with clear dependency boundaries
- Robust error handling with automatic failover at multiple layers (AI providers, storage providers, payment gateways)
- Pipeline/interceptor architecture is well-structured and extensible
- Pragmatic dual-write strategy during database migration (safety-first approach)
- **Triad Architecture (Phase 10):** Successful abstraction of hardcoded TS prompts into markdown (`Soul.md`, `Agent.md`), setting the stage for RAM caching.
- Documentation hygiene has been improved (`TASK_LIST.md` accurately reflects implementations, dead links removed).
- WhatsApp sidecar in Go handles multi-tenant sessions natively, bypassing Meta API rate limits
- Energy credits billing is fine-grained and transparent

### Technical Debt & Issues
1. **The Great Firebase Purge (Pending):** The dual-writing safety net is working, but it needs a hard timeline for when Firebase will be entirely excised from the Node applications. Worker-life still has 7 active `@naija-agent/firebase` imports (org lookup, PIN auth, vault tools).
2. **`packages/storage` undeclared dependencies** — Runtime imports `@naija-agent/database`, `@naija-agent/types`, `drizzle-orm`, `pino`, and `zod` but doesn't declare them in its `package.json`.
3. **Sparse test coverage** — 193 tests across 27 files, but 8 of 12 packages/apps have zero tests (api, web, ai, firebase, logistics, payments, storage, whatsapp-sidecar). Worker and worker-life account for 22 of 27 test files.
4. **Mixed module systems** — All apps are CJS (bundled by esbuild), packages are mostly ESM (`"type": "module"`). `payments` and `logistics` are CJS. This is intentional but creates dual-package hazard for packages imported by ESM consumers.
5. **Sidecar `/download/{mediaId}` returns 501 Not Implemented** — whatsmeow doesn't support direct download by ID without message context; media retrieval from sovereign path is incomplete. Current workaround: sidecar saves media to shared `/tmp/sidecar-media/` filesystem accessible by the worker container.

### Recommendations
1. Document the Firestore → Postgres migration end-state and timeline (priority: complete before adding new data-heavy features)
2. Add `@naija-agent/database`, `@naija-agent/types`, `drizzle-orm`, `pino`, and `zod` to `@naija-agent/storage`'s declared dependencies in `package.json`
3. Add test coverage for `@naija-agent/types` (schemas/validation), `@naija-agent/payments` (gateway verification), `@naija-agent/ai` (routing/failover), and `apps/api` (webhook verification)
4. Implement sidecar media download endpoint for sovereign media retrieval
5. Complete ESM migration or standardize on CJS across all packages (currently split between the two)
6. Route future Aelixxr WhatsApp pairing through a clean proxy via `proxy_url` column (pair-code method is flagged by Meta)
7. Replace pair-code with QR code linking for new sessions to reduce bot-detection risk
