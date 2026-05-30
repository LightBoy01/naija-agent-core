# NaijaAgent Core (The Sovereign Empire Era)

A high-scale, multi-tenant AI Business Operating System built specifically for the Nigerian market. 🇳🇬

## 🏰 Empire Architecture
*   **WhatsApp Sidecar (apps/whatsapp-sidecar):** High-performance Go binary (`whatsmeow`) managing multi-tenant WhatsApp sessions and pushing events to Redis.
*   **API Service (@naija-agent/api):** High-performance Fastify server handling WhatsApp/Paystack webhooks, SMS Bridge heartbeats, and Sovereign commands.
*   **Worker Service (@naija-agent/worker):** Intelligent BullMQ worker processing Gemini 2.5 Flash logic, Vision analysis, and proactive business reports.
*   **Brain:** Gemini 2.5 Flash with native tool-calling, audio processing, and visual receipt extraction (now decoupled into `@naija-agent/ai`).
*   **State:** PostgreSQL via Drizzle ORM (`@naija-agent/database`) + Redis (Heartbeats/Idempotency/Locking). Firebase Firestore is maintained for legacy/web sync.
*   **Identity:** WhatsApp-first MFA and Bcrypt-salted Admin PINs.

## 🚀 Key Features (Empire Phase 9)
*   🏦 **Alajo Sovereign Finance:** Automated personal vaults with Monnify Virtual Accounts, bill payments, and goal-based savings.
*   🛒 **Conversational Commerce:** Full Shopping Cart lifecycle (`add`, `view`, `remove`, `clear`) integrated into checkout.
*   🛡️ **Deterministic Price Guard:** Algorithmic verification of AI-quoted prices against live product data to prevent fraud.
*   📱 **SMS Bridge Relay:** Real-time bank alert matching via Termux-based bridge devices.
*   👁️ **Vision-First Verification:** Automated receipt scanning for instant payment confirmation (Manual fallback for high-value deals).
*   📊 **Proactive Pulse:** Daily morning sales reports for the Boss and automated appointment reminders for customers.
*   👮 **Global Fraud Guard:** Shared blacklist of fraudulent numbers across the entire network.

## 🛠️ Developer Setup
1.  **Monorepo:** `npm install`
2.  **Firebase:** Add `serviceAccountKey.json` to `packages/firebase/`.
3.  **Env:** Configure `.env` with `WHATSAPP_API_TOKEN`, `GEMINI_API_KEY`, and `REDIS_PASSWORD`.
4.  **Build:** `npm run build` (Targeting Node 20+ ESM).
5.  **Run:** `npm start` (Runs both API and Worker).

## 🌍 Strategic Documentation
*   [Alajo Financial Guide](docs/guides/ALAJO_SYSTEM_GUIDE.md)
*   [Constitution (Sovereign Directive 2026)](docs/SOVEREIGN_DIRECTIVE_2026_03_10.md)
*   [Empire Roadmap](docs/GROWTH_BLUEPRINT.md)
*   [Onboarding Strategy](docs/ONBOARDING_STRATEGY_2026.md)
*   [Red Team Report](docs/RED_TEAM_REPORT.md)

---
_⚡ Powered by Naija Agent AI. Built for the Hustle._
