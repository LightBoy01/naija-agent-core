# NaijaAgent Core (The Sovereign Empire Era)

A high-scale, multi-tenant AI Business Operating System built specifically for the Nigerian market. 🇳🇬

## 🏰 Empire Architecture
*   **WhatsApp Sidecar (`apps/whatsapp-sidecar`):** High-performance Go binary (`whatsmeow`) managing multi-tenant WhatsApp sessions and pushing events to Redis.
*   **API Service (`@naija-agent/api`):** High-performance Fastify server handling WhatsApp/Paystack webhooks, SMS Bridge heartbeats, and Sovereign commands.
*   **Zynux Worker (`@naija-agent/worker`):** BullMQ worker for business AI pipeline — chat, commerce, onboarding, reporting, reminders.
*   **Aelixxr Worker (`@naija-agent/worker-life`):** BullMQ worker for Life OS — personal AI, vault, heartbeats, cron, tools.
*   **Web Dashboard (`@naija-agent/web`):** Next.js 15 Sovereign Command Center and tenant portals.
*   **AI Router (`@naija-agent/ai`):** Dynamic capability-based routing across Gemini, DeepSeek, and Qwen with automatic failover.
*   **State:** PostgreSQL via Drizzle ORM (`@naija-agent/database`) + Redis (Queues/Idempotency/Locking). Firebase Firestore maintained for legacy sync during migration.
*   **Identity:** WhatsApp-first MFA and Bcrypt-salted Admin PINs.

## 🚀 Key Features (Empire Phase 10)
*   🏦 **Alajo Sovereign Finance:** Automated personal vaults with Monnify Virtual Accounts, bill payments, and goal-based savings.
*   🛒 **Conversational Commerce:** Full Shopping Cart lifecycle (`add`, `view`, `remove`, `clear`) integrated into checkout.
*   🛡️ **Deterministic Price Guard:** Algorithmic verification of AI-quoted prices against live product data to prevent fraud.
*   👁️ **Vision-First Verification:** Automated receipt scanning for instant payment confirmation (Manual fallback for high-value deals).
*   📊 **Proactive Pulse:** Daily morning sales reports for the Boss and automated appointment reminders for customers.
*   👮 **Global Fraud Guard:** Shared blacklist of fraudulent numbers across the entire network.

## 🛠️ Developer Setup

**Prerequisites:** Node.js 25+, Go 1.26+, PostgreSQL with pgvector extension, Redis

1.  **Monorepo:** `npm install`
2.  **Firebase:** Add `serviceAccountKey.json` to `packages/firebase/` (or set `FIREBASE_SERVICE_ACCOUNT_BASE64` env var for deployments).
3.  **Env:** Configure `.env` with `WHATSAPP_API_TOKEN`, `GEMINI_API_KEY`, `REDIS_PASSWORD`, `DATABASE_URL` (PostgreSQL), and payment provider keys.
4.  **WhatsApp Sidecar:** `cd apps/whatsapp-sidecar && go build`
5.  **Build:** `npm run build`
6.  **Run:** `./scripts/sovereign-start.sh` (Docker-based unified entrypoint) or run API/workers/sidecar individually.

## 🌍 Strategic Documentation
*   [Master Strategy 2026](docs/core/MASTER_STRATEGY_2026.md)
*   [Monorepo Codebase Review & Architecture](docs/core/CODEBASE_REVIEW_2026-06-17.md)
*   [Aelixxr Sovereign Protocol](docs/core/AELIXXR_SOVEREIGN_PROTOCOL_V1.md)
*   [Technical Heritage & Friction](docs/core/TECHNICAL_HERITAGE.md)
*   [Alajo Financial Guide](docs/guides/ALAJO_SYSTEM_GUIDE.md)

---
_⚡ Powered by Naija Agent AI. Built for the Hustle._
