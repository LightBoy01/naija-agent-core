# PHASE 10: THE SOVEREIGN AGENTIC NETWORK
**Status:** DRAFT (Fusion Strategy)
**Architecture:** Triad (Soul / Body / Skill)
**Stack:** China-Africa Hybrid (TypeScript + Python + TiDB + Alibaba SAE)

## 1. Executive Summary
This phase transitions Naija Agent Core from an "AI Chatbot" to a **Sovereign Agentic Network**. We are fusing the empathetic, financially-secure **Aelixxr (Soul)** with the high-capability, self-improving **Hermes Agent (Body)**. Aelixxr acts as the Supervisor (Managing Vaults, PINs, and User Tone), while Hermes acts as the Background Operator (Executing Shells, Web Research, and Long-Running Tasks).

---

## 2. The Triad Architecture

### A. The Soul (Supervisor): Aelixxr (TypeScript / apps/worker-life)
*   **Role:** Empathy, Financial Gatekeeper, Intent Routing.
*   **Database:** TiDB Serverless (Users, Vault, History).
*   **Safety:** Deterministic PIN Interceptor & ₦ Balance Verification.
*   **Communication:** Primary WhatsApp interface.
*   **Tool:** `delegate_to_hermes(directive: string, budget_naira: number)`

### B. The Body (Executor): Hermes (Python / hermes-agent)
*   **Role:** Technical Execution, Deep Research, Background Automation.
*   **Environment:** Scoped Docker/Modal Sidecar with full Shell/Browser access.
*   **Autonomy:** High (30+ iterations allowed per task).
*   **Capabilities:** Cron scheduling for long-term monitoring and subagent spawning.

### C. The Skill (Sector Packs): Skill.md
*   **Role:** Domain-specific tools (Commerce, Health, Edu, Code).
*   **Loading:** Dynamically injected into Hermes based on Aelixxr's routing.

---

## 3. The Integration Rails (The Bridge)

### 3.1. MCP Sidecar Implementation
*   Hermes runs as a parallel service on Alibaba SAE (Sidecar) or a dedicated Python Worker.
*   Aelixxr connects via `mcpClient.ts` using the Model Context Protocol.
*   **Security:** Aelixxr whitelists ONLY necessary environment variables for Hermes; sensitive Firebase/Monnify keys are NEVER shared with the Python engine.

### 3.2. Shared Memory & State (TiDB Pivot)
*   **Unified History:** Refactor `hermes_state.py` to sync Python session logs into the TiDB `life_context` table.
*   **Amnesia Prevention:** Even if a serverless container hibernates, the agent's state persists in SQL.

### 3.3. Financial Metering (The "Energy" Rail)
*   Every Hermes task is "pre-authorized" by Aelixxr.
*   **Metering:** Aelixxr deducts `vaultBalanceNaira` based on the compute time and token usage reported by Hermes via MCP.

---

## 4. Implementation Roadmap (The 60-Day Sprint)

### Phase 1: The Secure Handshake (Days 1-7)
*   [ ] Refactor `packages/ai` to support DeepSeek-R1 (Soul) and Gemini Flash (Body).
*   [ ] Deploy Hermes as a "Passive Toolset" (Search/PDF) via MCP client in Aelixxr.
*   [ ] Verify "Iron Shield" PIN protection on all Hermes delegation calls.

### Phase 2: The SQL Migration (Days 8-21)
*   [ ] Initialize `@naija-agent/database` with Drizzle ORM (TiDB).
*   [ ] Secure migration of user Vault balances from Firestore to TiDB.
*   [ ] Sync Hermes SQLite state to TiDB `life_context`.

### Phase 3: Long-Running Autonomy (Days 22-45)
*   [ ] Enable Hermes Cron Scheduler for "Life Defense" tasks (e.g., Visa tracking).
*   [ ] Implement "Interim Updates": Aelixxr proactively pings the user on WhatsApp while Hermes works in the background.

### Phase 4: Empire Scale (Days 46-60)
*   [ ] Deploy to Alibaba SAE with scale-to-zero hibernate logic.
*   [ ] Launch "Aelixxr Energy" recharges for high-intelligence Hermes work.
*   [ ] 100k User Stress Test.

---

## 5. Risk & Red-Team Mitigation

| Risk | Mitigation |
| :--- | :--- |
| **Hermes Hallucination** | Aelixxr acts as a "Sanity Filter" on all Hermes outputs before sending to WhatsApp. |
| **OOM / Compute Cost** | Use Sidecar containers with strict RAM limits; offload heavy browser tasks to Modal/Daytona. |
| **Credential Theft** | Strictly scoped API keys; Hermes never sees the "Master Admin" keys. |

---
**⚡ DRAFTED BY GEMINI CLI FOR NAIJA AGENT CORE FUSION.**
