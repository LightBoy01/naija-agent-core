# ACTION PLAN: Aelixxr Empire Era Infrastructure Pivot

This document provides a granular task list for transitioning Aelixxr to a high-concurrency, low-cost "China-Africa Hybrid" stack.

## 1. Phase 1: Intelligence Abstraction (The Sovereign Brain)
**Goal:** Slashes AI costs by 90% and unlocks BytePlus credits.

- [ ] **Task 1.1: Initialize `@naija-agent/ai` Package**
  - Create package structure in `packages/ai`.
  - Define `AIProvider` interface (generateText, chat, vision).
- [ ] **Task 1.2: Implement DeepSeek/OpenAI Provider**
  - Integrate OpenAI SDK (compatible with DeepSeek and BytePlus endpoints).
  - Implement `<think>` tag parsing to handle DeepSeek-R1 reasoning logic.
- [ ] **Task 1.3: Update Worker Logic**
  - Refactor `apps/worker-life/src/handlers/chatHandler.ts` to use the new AI service.
  - Implement "Smart Fallback" logic (Primary: DeepSeek-V3 $\rightarrow$ Fallback: Gemini 1.5 Flash).
- [ ] **Task 1.4: Validation**
  - Verify Aelixxr maintains its Pidgin/English rapport and personality consistency.

## 2. Phase 2: Persistence Pivot (The Distributed Memory)
**Goal:** Transition to TiDB for ACID-compliant financial records and infinite scaling.

- [ ] **Task 2.1: Initialize `@naija-agent/database` Package**
  - Setup Drizzle ORM with `mysql2` driver.
  - Configure connection pool for TiDB Serverless.
- [ ] **Task 2.2: Define SQL Schema**
  - `users`: Core profile, phone, energy, and vault balances.
  - `vault_transactions`: Immutable financial ledger (Amount, Reference, Status).
  - `life_context`: SQL-backed semantic memory storage.
  - `referrals`: Table to track campus growth loops.
- [ ] **Task 2.3: Data Migration Script**
  - Write a secure Node.js script to read existing user data from Firestore and insert into TiDB.
- [ ] **Task 2.4: Atomic Ledger Transition**
  - Update `LifeMemoryService` to perform balance deductions/additions via SQL transactions.

## 3. Phase 3: Infrastructure & Edge (The Shield)
**Goal:** Sub-second latency and zero-egress media storage.

- [ ] **Task 3.1: Alibaba Cloud OSS Implementation**
  - Create `@naija-agent/storage` S3-compatible provider for Alibaba OSS.
  - Update receipt/voice-note uploaders to use the new provider.
- [ ] **Task 3.2: Tencent EdgeOne Proxy**
  - Draft Edge Function in Node.js to receive WABA webhooks.
  - Implement HMAC signature validation at the edge.
- [ ] **Task 3.3: Containerization & SAE**
  - Create `Dockerfile` optimized for Alibaba Serverless App Engine (SAE).
  - Configure SAE auto-scaling rules (Scale to zero, Burst to 1,000 pods).

## 4. Phase 4: Growth & Grants
**Goal:** Fuel the university blitz with external capital.

- [ ] **Task 4.1: Technical Portfolio for VStart**
  - Finalize architectural diagrams for the BytePlus application.
- [ ] **Task 4.2: University StudyBuddy Launch**
  - Finalize the `StudyBuddy.Agent.md` prompt for campus viral loops.

---
**⚡ PREPARED BY GEMINI CLI FOR NAIJA AGENT CORE.**
