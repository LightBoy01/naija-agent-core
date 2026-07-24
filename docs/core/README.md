# Naija Agent Core — Documentation Directory (`docs/core`)

Welcome to the central nervous system of the **Naija Agent Core** project. This directory (`/docs/core`) houses the foundational strategies, architectural blueprints, codebase reviews, and operational protocols that govern the **Naija Agent Empire**.

This `README.md` serves as a comprehensive index and executive summary of the entire documentation suite, providing deep insights into the core foundational strategies and the current architectural paradigm (Phase 10 & 11).

---

## 🏛️ Core Foundational Strategies

The Naija Agent Empire is built upon a philosophy of **Simplification and Trust**, designed specifically as "Digital Trust Infrastructure" for the African informal and semi-formal economy. 

### The Twin Engine Architecture
The project operates two distinct product lines serving two masters with a unified goal of **Sovereignty**:
1. **BOS (Business Operating System - Zynux):** The "Money Maker". An AI agent focused on workflow automation, customer chats, order-taking, and inventory management. It is designed to be **Sector-Agnostic** via pluggable JSON "Sector Packs" (Retail, Health, Property, Legal).
2. **LOS (Life Operating System - Aelixxr):** The "Life Guardian". A personal AI agent focused on personal bureaucracy defense, document ingestion (The Vault), proactive nudges, and heartbeats.

### The Sovereign Hierarchy
The system operates on a rigid, identity-based hierarchy:
* **Sovereign Owner:** The platform administrator.
* **Master Bot (COO):** Automates the onboarding and management of tenants.
* **Tenant Organizations (Merchants/Users):** The businesses or individuals renting the agents.
* **Digital Apprentices (Client Bots):** The AI instances interacting with end-customers or performing tasks.
* **End Customers:** The consumers interacting with the bots.

### Monetization: The Kobo Standard
Interactions are billed akin to GSM airtime using a prepaid, high-margin **Energy Credits** model. Every tool invocation (text, vision, API call) carries a specific micro-cost deducted atomically.

---

## 🏗️ Phase 10 & 11 Architectural Paradigm

The codebase is currently transitioning through **Phase 10 (Agentic Network Fusion & Triad Architecture)** and preparing for **Phase 11 (The China-Africa Hybrid Cloud)**.

### The Triad Architecture
A framework-agnostic standard defined by the **Aelixxr Sovereign Protocol (ASP)** that separates concerns into three layers:
1. **The Soul (Identity & Policy):** Markdown-based persona definitions (`Soul.md`, `Agent.md`) governing the AI's goals and friction policies.
2. **The Hands (Action Spec):** Standardized, pluggable JSON interfaces for tool execution, featuring the "Iron Shield" hook (logic-based pre-verification, autonomous Human-In-The-Loop approval, and post-action witness proofs).
3. **The Memory (Sovereign Vault):** The data persistence layer handling transactions, semantic vector memory, and user data ownership.

### The Tech Stack Evolution
* **Monorepo Structure (npm workspaces):** 5 deployable apps (`api`, `worker`, `worker-life`, `web`, `whatsapp-sidecar`) and 7 shared packages (`types`, `ai`, `database`, `firebase`, `storage`, `payments`, `logistics`).
* **WhatsApp Ingestion:** Transitioned to a high-performance Go binary (`whatsapp-sidecar`) utilizing `whatsmeow` to handle multi-tenant Web sessions, bypassing legacy Meta Cloud API constraints.
* **The Great Database Migration (Split-Brain):** Moving from a NoSQL Firebase Firestore foundation to a highly relational **PostgreSQL** architecture using Drizzle ORM and `pgvector`. The system currently employs an intentional dual-write strategy to ensure zero-downtime migration.
* **Dynamic AI Routing:** An intelligent `AIOrchestrator` (`@naija-agent/ai`) routes requests to the cheapest/fastest model (Gemini, DeepSeek, Qwen) based on required capabilities (reasoning, tool-calling, vision).

---

## 📁 Directory Index & Detailed File Breakdown

Below is a deep breakdown of every critical file within this directory.

### 1. [`MASTER_STRATEGY_2026.md`](./MASTER_STRATEGY_2026.md)
**The ultimate guiding document.**
*   **Purpose:** Defines the active, overarching strategy for 2026.
*   **Key Contents:** Explains the Core Philosophy, the Twin Engine Architecture (BOS vs. LOS), and the Sector-Agnostic Pivot. It details the execution roadmap from Phase 1 to Phase 11 (Tencent Cloud migration).
*   **Critical Directives:** Highlights immediate next steps, notably "The Great Firebase Purge" and fixing the "Cold Start" data ingestion problem.

### 2. [`EMPIRE_CORE.md`](./EMPIRE_CORE.md)
**The platform's identity.**
*   **Purpose:** Establishes the technical, strategic, and financial foundation of the empire.
*   **Key Contents:** Defines the project as "Digital Trust Infrastructure". Details the Sovereign Hierarchy, the Universal DNA of every bot (State Machine, Financial Guard, RBAC), and the AI Credits Monetization model. 

### 3. [`CODEBASE_REVIEW_2026-06-17.md`](./CODEBASE_REVIEW_2026-06-17.md)
**The developer's map.**
*   **Purpose:** A highly detailed, exhaustive technical review of the entire monorepo.
*   **Key Contents:** Breaks down every `app/` and `package/` in the workspace. Details the Fastify API ingestion, the BullMQ worker pipelines (`worker` for Zynux, `worker-life` for Aelixxr), the Next.js Sovereign Command Center, and the Go WhatsApp sidecar. It traces the package dependency graph, explains the data flow, and documents architectural patterns (Interceptors, Dynamic AI Router, Sector Packs).

### 4. [`ARCHITECTURE.md`](./ARCHITECTURE.md)
**The system blueprint.**
*   **Purpose:** Outlines the specific technology stack and system topology.
*   **Key Contents:** Lists runtime environments, frameworks, and infrastructure choices (Railway, BullMQ, Redis, Firestore). Details the data models (`organizations`, `chats`, `transactions`) and operational workflows (Hybrid Hub, Identity Security, Decentralized Proactivity).

### 5. [`AELIXXR_SOVEREIGN_PROTOCOL_V1.md`](./AELIXXR_SOVEREIGN_PROTOCOL_V1.md)
**The universal AI standard.**
*   **Purpose:** Defines the "ASP" standard for AI agent interactions in the African market.
*   **Key Contents:** Introduces the Triad Architecture (Soul, Hands, Memory). Defines hardened governance rules including the "Loop Guard" (preventing excessive delegation), the "Scam-Shield" (network consensus on fraud), and the "Autonomous HITL" (where the AI acts as a legal guardian reviewing tool requests).

### 6. [`TECHNICAL_HERITAGE.md`](./TECHNICAL_HERITAGE.md)
**The friction buster.**
*   **Purpose:** Documents operational strategies to solve human-error edge cases and a historical log of technical hurdles.
*   **Key Contents:** Provides elegant solutions to real-world Nigerian business problems:
    *   *Stock Out Disaster* $\rightarrow$ Solved by "Reverse Interrogation".
    *   *Ghost Rider Problem* $\rightarrow$ Solved by "Group Chat Spy & GPS Verification".
    *   *Control Freak Anxiety* $\rightarrow$ Solved by "Silent Whisper Mode".
    *   Also contains the "Drama Archive," chronicling early technical hurdles (Termux IPv4, Meta API issues).

### 7. [`IMPROVEMENT_PLAN_2026.md`](./IMPROVEMENT_PLAN_2026.md)
**The security and feature backlog.**
*   **Purpose:** A tactical step-by-step plan for security hardening and feature deployment.
*   **Key Contents:** Outlines immediate fixes for "Skeleton Key" admin vulnerabilities and Sovereign Identity spoofing. Plans the implementation of Polymorphic Entity Handlers (for sector-agnostic storage), the LOS "Vault" ingestion, and the Agent-to-Agent discovery network.

### 8. [`DEBUG_LOG.md`](./DEBUG_LOG.md)
**The living changelog.**
*   **Purpose:** Tracks major achievements and technical debt addressed during development sessions.
*   **Key Contents:** Currently highlights successes in the Phase 10-11 transition, including Tencent COS integration, MasterBot frictionless onboarding, PostgreSQL migrations, and Sovereign MFA interceptor development.

### 9. [`EMPIRE_ROADMAP.md`](./EMPIRE_ROADMAP.md) 
**[DEPRECATED]**
*   **Purpose:** Historical roadmap. Included for legacy reference.
*   **Status:** Outdated. Superseded by `MASTER_STRATEGY_2026.md`.

---
*Generated by Antigravity AI on behalf of the Sovereign Architect.*
