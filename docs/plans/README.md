# Naija Agent Core: Strategic Plans Index

Welcome to the **Naija Agent Core Plans Directory**. This comprehensive index catalogs all strategic roadmaps, architectural blueprints, sprint plans, and technical debt reduction strategies that drive the evolution of the Naija Agent ecosystem. 

The documents herein chart the transition of the platform from a startup MVP to the highly scalable **Sovereign Agentic Network** capable of serving 100,000+ users securely, efficiently, and cost-effectively.

---

## 🏗️ Master Plans & Empire Era Architecture

These documents outline the macro-level strategies and architectural pivots required for massive scale.

### [FINAL_EMPIRE_ROADMAP_2026.md](FINAL_EMPIRE_ROADMAP_2026.md)
**Master Plan: Aelixxr Empire Era (100k User Sprint)**
- **Objective:** Pivot from a "Startup MVP" (Vertex/Firebase) to a "China-Africa Hybrid" stack (DeepSeek, TiDB, Alibaba SAE, Tencent EdgeOne) to slash infrastructure costs and support 100,000+ users in 60 days.
- **Key Phases:**
  1. **The Sovereign Foundation:** AI Refactor (DeepSeek) and TiDB Serverless (Drizzle ORM).
  2. **The Edge & Cloud Pivot:** Deploy to Alibaba SAE, Tencent EdgeOne proxy, and Alibaba OSS media storage.
  3. **The University Blitz:** Campus launch, viral referral loops, and TiDB HTAP dashboards.

### [EMPIRE_ERA_ACTION_PLAN.md](EMPIRE_ERA_ACTION_PLAN.md)
**Action Plan: Aelixxr Empire Era Infrastructure Pivot**
- **Objective:** Provides a granular, task-by-task breakdown for executing the Empire Era pivot.
- **Key Tasks:** 
  - Intelligence Abstraction (`@naija-agent/ai` with DeepSeek-R1 logic).
  - Persistence Pivot to TiDB and Drizzle ORM.
  - Infrastructure & Edge deployment (Alibaba OSS, Tencent EdgeOne, Docker for SAE).

### [HOSTING_STRATEGY_2026.md](HOSTING_STRATEGY_2026.md)
**Final Hosting Infrastructure Review: Naija Agent Core**
- **Objective:** A deep-dive analysis comparing PaaS (Vercel) against Bare Metal (VPS) for serving 100k+ users.
- **Decision:** Recommends the "Hybrid-Pro VPS" strategy (Database Server + App Server) using Hetzner/Contabo managed by Coolify. 
- **Security Posture:** Explores the "Iron Shield" defenses, including Docker Socket Proxies and Data Isolation.

### [VPS_MIGRATION_REPORT_2026.md](VPS_MIGRATION_REPORT_2026.md)
**Sovereign VPS Migration & Refactoring Report (June 7, 2026)**
- **Highlights:** Successfully decommissioned Supabase in favor of a Sovereign VPS PostgreSQL instance (`naija_ledger`). 
- **Upgrades:** Introduced 8-character WhatsApp Pairing Codes for frictionless onboarding, resolved Go Sidecar routing crashes, and fixed AI context caching 404 errors.

---

## 🚀 Phased Evolution Roadmaps

The core phases driving the transition from a conversational bot to a robust Multi-Agent System (MAS).

### [PHASE_8_ROADMAP.md](PHASE_8_ROADMAP.md)
**Phase 8: Global Expansion & Commerce Hardening**
- **Focus:** Expanding beyond the Nigerian context (NGN, +234).
- **Features:** 
  - Internationalization (i18n) for dynamic phone handling and multi-currency ledgers.
  - Conversational Commerce Engine: Soft reservations (Stock Lock), Frictionless Checkout invoices, and Sales Recovery nudges.

### [PHASE_9_AGENTIC_ARCHITECTURE.md](PHASE_9_AGENTIC_ARCHITECTURE.md)
**Phase 9: The Hierarchical Agentic Architecture Blueprint**
- **Focus:** Moving from a monolithic prompt structure to a Supervisor/Worker pattern.
- **Architecture:** 
  - **Supervisor (Soul):** Aelixxr handles empathy, intent routing, and synthesis.
  - **Workers (Agent):** Sector-specific Small Language Models (SLMs) execute specific workflows.
  - **Dynamic Sector Packs:** Tools are partitioned into logic packs (Commerce, Education, Life) to save context window bloat.
  - **Orchestration:** Deadlock-free BullMQ job handoffs.

### [PHASE_10_AGENTIC_NETWORK_FUSION.md](PHASE_10_AGENTIC_NETWORK_FUSION.md)
**Phase 10: The Sovereign Agentic Network**
- **Focus:** Fusing the empathetic Aelixxr (Soul) with the high-capability Hermes Agent (Body).
- **Mechanism:** Hermes runs as an isolated Python sidecar accessed via Model Context Protocol (MCP) by Aelixxr for deep research and background automation.
- **Persistence:** Syncs Hermes Python session logs into the TiDB `life_context` table for shared memory.

### [PHASE_11_TENCENT_MIGRATION.md](PHASE_11_TENCENT_MIGRATION.md)
**Phase 11: Sovereign Infrastructure (Tencent Cloud Migration)**
- **Focus:** Migrating to Tencent Cloud for extreme scalability.
- **Architecture:** API on Tencent Cloud Run (Serverless burst), Workers and Hermes on Lighthouse VPS (always-on execution), TencentDB for Redis, and Tencent COS for media.
- **Red Team Mitigations:** Network isolation (VPC), Playwright container bloat handling, and S3-compatibility testing.

---

## 🤖 Aelixxr (Life OS) Upgrades

Specific plans tailored for the proactive, empathetic personal assistant component.

### [AELIXXR_2_0_PLAN.md](AELIXXR_2_0_PLAN.md)
**Aelixxr 2.0: The Nano-Claw LOS Upgrade Plan**
- **Objective:** Upgrade Life OS into a proactive Sovereign Agent via NanoBot philosophy and IronClaw security.
- **Key Concepts:** High-speed `grepVault` search replacing expensive RAG, community skill bundles (SkillCalendar, SkillMarketSpy), MCP integration, and Iron-Gate HITL (Human-in-the-Loop) for high-stakes actions like payments.

### [AELIXXR_IMPROVEMENT_PLAN.md](AELIXXR_IMPROVEMENT_PLAN.md)
**Aelixxr (Life OS) Improvement & Monetization Plan**
- **Technical Refactor:** Redesigns the `life-heartbeat` from an in-memory `Promise.allSettled` to a true BullMQ Fan-Out architecture to prevent OOM and API rate limits.
- **Monetization:** Introduces the "Energy/Battery" Credit System with empathetic Low Battery warnings and Emergency Reserve logic to gamify platform usage without robotic friction.

---

## 🛠️ Project Improvement Plans (Technical Debt & Hardening)

Ongoing audits and sprint goals aimed at operational excellence, security, and maintainability.

### [PROJECT_IMPROVEMENT_PLAN_2026_03_18.md](PROJECT_IMPROVEMENT_PLAN_2026_03_18.md)
**Phase 8.1: Security & Scalability Hardening (March 18, 2026)**
- **Critical Fix:** Redact API Logs to prevent `x-api-key` and `x-bridge-secret` leakage.
- **Resilience:** Decouple SMS ingestion from processing via asynchronous BullMQ jobs to prevent webhook timeouts.
- **Repair:** Fix WABA Permission scopes for auto-ignition onboarding.

### [PROJECT_IMPROVEMENT_PLAN_2026_04_10.md](PROJECT_IMPROVEMENT_PLAN_2026_04_10.md)
**Twin Engine Architecture Refinement (April 10, 2026)**
- **BOS Sector Pivot:** Migrate legacy Product Schema to the dynamic `EntityDefinition` JSON format.
- **LOS Vault Defense:** Implement advanced OCR pipelines and LLM-based classification for diverse document ingestion.
- **Observability:** Centralize BullMQ tracking and Error Tracing for asynchronous job monitoring.

### [PROJECT_IMPROVEMENT_PLAN_APR_2026.md](PROJECT_IMPROVEMENT_PLAN_APR_2026.md)
**Core Stabilizations (April 2026)**
- **Priorities:** Establish automated test coverage (especially for Price Guard and Ledger Reconciliation) and clear build warnings.
- **Debt Cleansing:** Remove legacy SMS Bridge code, fortify Identity-Based RBAC, fix Multi-Currency historical ledger tracking, and contextualize the PIN Interceptor regex.

### [PROJECT_IMPROVEMENT_PLAN_MAY_2026.md](PROJECT_IMPROVEMENT_PLAN_MAY_2026.md)
**Phase 9 Aftermath & Hygiene (May 2026)**
- **Hygiene:** Modularize the monolithic `tools.ts` into a dynamically routed `ToolRegistry` and centralize hardcoded configs.
- **Intelligence:** Implement the "Sleep Cycle" (semantic memory extraction via background SLM) and Context Caching optimization.
- **Security:** Refine PII redaction and introduce a Forensic Vision Pipeline to detect Photoshop forgery on receipts.

---

## 📈 Uncharted Territory & Final Scaling 

### [pending_tasks_toscale.md](pending_tasks_toscale.md)
**The Final Product Roadmap (Closing the Loop)**
- **Overview:** A deep conversation transcript extracting the final "invisible" gaps required to launch the Empire.
- **Commercial Needs:** Native Android SMS Bridge APK, real-time Monnify/Paystack API linking, Broadcast Tools, and Self-Service Billing UI.
- **Governance Gaps:** "Sovereign Decree" global broadcasting, suspend tenant tooling, and automated KYC operations.
- **Invisible Gaps:** Shared Network Intelligence (Global Fraud Registry), Deterministic Price Guard, Internal Bot-to-Staff Dispatching, and Emergency Overdrafts.

---
*Generated by Naija Agent Core Intelligence*
