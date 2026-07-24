# Naija Agent Core - Automation & Operations Scripts (`scripts/`)

Welcome to the central nervous system for operations, testing, migrations, and infrastructure automation. The `scripts/` directory houses over 140 utility scripts designed to maintain, test, and evolve the Naija Agent Empire.

This directory is strictly organized by naming conventions (prefixes) that denote the purpose of each script.

## 📂 Categorized Script Index

### 1. 🧪 Integration & E2E Tests (`test-*`)
Scripts designed to validate models, API endpoints, AI capabilities, and system workflows.
- **AI & Models:** `test-ai.ts`, `test-gemini.ts`, `test-deepseek.ts`, `test-pro.ts` - Used for isolated testing of the dynamic model routing.
- **Multimodal & Vision:** `test-image-gen.ts`, `test_image_tool.js`, `test-audio-mime.ts` - Validates vision and audio transcription pipelines.
- **Aelixxr (Life OS):** `test-aelixxr-live.ts`, `test-aelixxr-tools.ts`, `test-life-memory.ts` - Validates the Aelixxr Sovereign Agent's tools and memory storage.
- **Zynux (Business OS) & Commerce:** `test-commerce-flow.ts`, `test-price-guard.ts` - E2E tests for merchant cart logic and deterministic price verification.

### 2. 🗄️ Database Migrations (`migrate-*`)
Scripts used for "The Great Firebase Purge" and transitioning to the PostgreSQL/TiDB relational paradigm.
- **Core Migrations:** `migrate-to-sql.ts`, `migrate-to-tidb.ts`, `full-migration.ts`.
- **Data Transformation:** `migrate-chat-history.ts`, `migrate-vault-to-pg.ts`, `migrate-currency.ts`.

### 3. 🌱 Environment Seeding (`seed-*`)
Used to populate local or staging databases with mock organizations, configurations, and identity state machines.
- **Targets:** `seed-org.ts`, `seed-aelixxr.ts`, `seed-master.ts`, `seed-playground.ts`.

### 4. 🔍 Audits & Inspection (`audit-*`, `inspect-*`)
Read-only scripts designed to safely query the production or staging ledgers to verify integrity without risking side effects.
- **Security & Integrity:** `audit-ledger-snapshot.ts`, `audit-multitenancy.ts`, `deep-audit-db.ts`.
- **Data Inspection:** `inspect-db.ts`, `inspect-pg-chats.ts`.

### 5. 🛠️ Operations & Maintenance (`check-*`, `fix-*`, `update-*`)
Scripts for day-to-day administrative tasks, resolving sync issues, and updating configurations.
- **Fixes:** `fix-routing.ts`, `fix-bridge-secrets.ts`.
- **Checks:** `check-pin.ts`, `check-subscriptions.ts`, `check-aelixxr-balance.ts`.
- **Updates:** `update-org-config.ts`, `update-nf-env.ts`.

### 6. 🚨 Red Team & Simulations (`red-team-*`, `simulate-*`)
Scripts used to attack the system locally to ensure that "Iron Shield" defenses are holding.
- **Simulations:** `simulate-whatsapp.js`, `simulate-webhook.ts`, `simulate-alajo-flow.ts`.
- **Red Teaming:** `red-team-isolation-test.ts`, `red-team-onboarding-audit.ts`.

### 7. 🚀 Build & Deployment (`build.js`, `start-*`)
- **Compilation:** `build.js` - Compiles the monorepo packages in the correct dependency order.
- **Execution:** `start-unified-workers.mjs`, `sovereign-start.sh` - Entrypoints for Docker and Coolify environments.

---
*Note: Before running any script touching production data, ensure you are utilizing the `read-only` database credentials or running an `audit-*` script first.*
