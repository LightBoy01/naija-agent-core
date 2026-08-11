# Aelixxr Codebase & Architecture Review

Based on the READMEs and documentation across the `naija-agent-core` monorepo, here is a comprehensive review of the Aelixxr ecosystem:

## 1. What is Aelixxr?
Aelixxr is the **Life OS (LOS) Worker** (`@naija-agent/worker-life`) within the NaijaAgent Core Empire. While Zynux handles business logic, Aelixxr acts as a "Sovereign Financial Manager" and personal AI assistant. 
It operates as a high-concurrency BullMQ worker connected to Redis to process background asynchronous tasks instead of synchronous API requests.

## 2. Core Architecture & Technologies
Located primarily in `apps/worker-life/`, the application architecture leverages a modern, decoupled stack:
- **Queue/Broker:** `bullmq`, `ioredis`
- **AI Integration:** Dynamically routes between models (Gemini, DeepSeek, Qwen) using the `@naija-agent/ai` capability router.
- **Protocol Extensibility:** Fully supports the Model Context Protocol (MCP) using `@modelcontextprotocol/sdk` to seamlessly merge static and dynamic external tools.
- **Data Persistence:** Uses PostgreSQL (`@naija-agent/database`) for state/transactions and Firebase for legacy synchronization.

### The Triad Architecture
The system logic is divided into specialized Job Handlers to maintain scalability based on `job.name`:
- **Chat & Interaction:** `process-message`, `life-chat`, `life-chat-resume`
- **Maintenance & Cron:** `sovereign-cron-tick`, `market-scrape`, `consolidate-memory`
- **Integrations:** `execute-slm-task`, `life-vault-deposit` (Webhooks)

### The Life Pipeline (Security & Interceptors)
Before hitting the AI, requests pass through a stringent interceptor chain:
**Context → Spam → Security → Media**
Any flagged issue triggers a "short circuit" to prevent expensive or unauthorized LLM calls.

## 3. Financial Ecosystem: The Alajo System
Aelixxr operates on a sovereign financial model:
- **Unified Vault:** Every user gets a personalized Monnify Virtual Account (`vaultBalanceNaira`).
- **Energy Credits:** Compute power costs "Kobo" (e.g., standard tool costs 3000 Kobo; `delegate_to_hermes` costs 10000 Kobo).
- **Utility Vending:** Integrated VAS for Airtime, Data, and Electricity.

## 4. The Aelixxr Sovereign Protocol (ASP)
As documented in `docs/core/AELIXXR_SOVEREIGN_PROTOCOL_V1.md`, Aelixxr transcends being just an app—it acts as a "Sovereign Mind":
- **Layer 1 (The Soul):** A culturally aware (Pidgin-English optimized) persona ("Loyal Defender") mandated to protect user time, capital, and identity.
- **Layer 2 (The Hands):** An Autonomous Human-in-the-Loop (HITL) system. Aelixxr evaluates requests from external agents/frameworks (like Hermes) against the user's goals and explicitly approves/rejects them without bothering the user for benign tasks.
- **Hardened Governance:**
  - **Scam-Shield:** A network consensus rule using SHA-256 hashed phone numbers to blacklist bad actors.
  - **Deterministic Price Guard:** Algorithms cross-reference all financial quotes before sending them out to prevent AI hallucination and fraud.
  - **Zero Blind Edits:** No tool can modify the system without a "Witness Hook" (signed proof of execution).

## 5. Directory Structure (`apps/worker-life/src/`)
- `config/`: Billing rules and sector definitions.
- `handlers/`: BullMQ job processors.
- `pipeline/`: Security and spam interceptors.
- `prompts/`: Aelixxr's personality ("Soul") and skills ("Alajo").
- `services/`: Core business logic (Billing, MCP, Vault).
- `tools/`: Static tools (Finance, Utility, Education).
- `utils/`: Shared utilities like security hashing and timezone config.

---
**Summary:** The Aelixxr codebase is a highly secure, dynamically routed AI orchestrator that prioritizes financial sovereignty, deterministic guardrails, and asynchronous scalability.
