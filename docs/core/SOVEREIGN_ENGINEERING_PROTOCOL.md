# The Sovereign Engineering Protocol

This document outlines the timeless principles and the exact operational steps required to achieve maximum results when starting a new development session within the Naija Agent Core ecosystem.

---

## Part 1: The Session Boot-Up Sequence (How to Start)

Whenever we begin a new session or tackle a new section of the codebase, we must follow this strict diagnostic pipeline to ensure we act with full context and zero regression:

1. **The Compass Check (Strategic Alignment):**
   - Read the overarching `docs/core/MASTER_STRATEGY_2026.md` and the active phase plan (e.g., `docs/plans/PHASE_10_AGENTIC_NETWORK_FUSION.md`) to ensure the task aligns with the macro goals of the Empire.
   - Review `TASK_LIST.md` to see where the objective sits in the current sprint.

2. **The Knowledge Retrieval (Documentation Review):**
   - Read the `README.md` of the specific `app/` or `package/` we are targeting. (e.g., If we are touching Webhooks, read `apps/api/README.md` and `packages/payments/README.md`).
   - *Crucial:* Always review `docs/logs/MASTER_DEBUG_LOG.md` before coding to avoid falling into previously solved technical traps (e.g., Firebase Service Account newline bugs, or TS enum mismatches).

3. **The Forensic Scan (Codebase Exploration):**
   - Do not guess the architecture. Use targeted searches (`grep`) to trace the execution flow. 
   - Start at the Ingress point (e.g., the Fastify Route), trace it to the Queue (BullMQ), and follow it down to the Worker Handler and the Database Schema.

4. **Define the "Definition of Done":**
   - Before writing a single line of code, we must explicitly agree on what success looks like. Does it require a database migration? Does it need an interceptor? What is the rollback plan if it fails in production?

---

## Part 2: The "Grand Mind" Timeless Principles

These are the non-negotiable philosophical tenets governing the engineering success of the Naija Agent Empire. Every line of code written must bow to these principles.

### 1. Be Proactive & Begin With the End in Mind
Never settle for a band-aid fix. If a bug occurs, do not just patch the line; identify the systemic flaw. Build tests, write logging alerts, and update the `DEBUG_LOG.md` so the system heals permanently. Think like a Sovereign building a 100-year infrastructure, not a hacker running a script.

### 2. The "Iron Shield" Doctrine (Zero Trust Intelligence)
**Never trust an AI with high-stakes execution.**
Large Language Models will hallucinate. Therefore, the "Hands" (Tool Execution) must be surrounded by deterministic code.
- Always use **Interceptors** (e.g., Regex for 4-digit PINs).
- Always use **Price Guards** (cross-checking the DB before billing).
- Enforce **RBAC** (Role-Based Access Control) at the database layer, not just the prompt layer.

### 3. The "Kobo Standard" (Atomic Economics)
Treat compute, context windows, and API calls like GSM Airtime. Every operation carries a micro-cost. 
- Route simple tasks to cheap/fast models (`gemini-3.1-flash-lite`).
- Route complex tasks to heavy models (`deepseek-r1`, `gemini-3-pro`).
- Ensure the system fails fast if the user's `energyCredits` or `vaultBalanceNaira` are depleted. No free rides; no memory leaks.

### 4. Sector-Agnostic Modularity (The Twin Engine)
The core engine (`Vynux`) must remain ignorant of specific business logic.
- Zynux (Business) and Aelixxr (Life) achieve their personalities via Markdown (`Soul.md`) and JSON Sector Packs.
- Never hardcode "Retail" or "Logistics" logic into the core workers. Always build pluggable architectures.

### 5. Human-in-the-Loop (HITL) is a Feature, not a Flaw
When an agent faces ambiguity or a high-risk financial decision, it must gracefully execute the "Step Back" protocol. It is better for the AI to ask the Boss for permission than to confidently execute a disastrous action. Trust is built on reliability, not blind autonomy.

### 6. Code is Ephemeral; Knowledge is Sovereign
A task is never complete until the documentation is updated.
- Every architectural shift requires an update to the respective `README.md`.
- Every major bug squashed requires an entry in the `DEBUG_LOG.md`. 
- Our greatest asset is the recorded history of our hardships and solutions.
