# Aelixxr 2.0: The Nano-Claw LOS Upgrade Plan (Refined)

## 1. Objective
Transform the **Life OS (LOS)** from a simple document vault into a proactive, high-efficiency, and secure **Sovereign Agent** (Aelixxr 2.0). 
This upgrade integrates the **NanoBot** philosophy (minimalist, grep-based efficiency) and **IronClaw** community tactics (hardened security, WASM-style tool-caging, and PII sanitization) to handle complex, repetitive tasks while strictly protecting user privacy.

---

## 2. The Nano-Claw Architecture

### A. NanoBot DNA: "Infinite Context" Efficiency
*   **Nano-Memory (TypeScript Port):** Replace expensive RAG with a high-speed local indexing system (SQLite/FTS5 or optimized Firestore sub-collections) to simulate "grep-based" memory.
*   **The "Soul" (`SOUL.md`):** Implement a per-user `SOUL.md` configuration in Firestore that defines the agent's unique personality and custom rules.
*   **Minimalist Skill Bundles:** Refactor LOS tools into standalone, hot-swappable "Skills" (e.g., `SkillCalendar`, `SkillMarketSpy`, `SkillScholar`).
*   **Context Compression:** Automatically summarize long conversations into a `HISTORY.md` equivalent and extract persistent facts into a `MEMORY.md` Fact Sheet.

### B. IronClaw DNA: Hardened Sovereignty
*   **Iron-Gate HITL (Human-in-the-Loop):** Critical actions (e.g., "Execute Payment," "Delete Vault Entry") require a mandatory **Admin PIN** or explicit "CONFIRM" reply.
*   **PII Sanitizer (Community-Built):** Implement a post-processing filter that automatically redacts sensitive data (Bank accounts, PINs, Passwords) before sending it to external AI models.
*   **Credential Masking (The "Vault"):** Tool handlers interact with a secure execution wrapper that injects secrets at the host boundary, ensuring the LLM never sees raw API keys.
*   **Sovereign Snitch:** Real-time WhatsApp alerting for the Boss (Master Bot) upon detecting high-risk tool calls or security breaches.

---

## 3. Implementation Phases

### Phase 1: Nano-Memory & High-Speed Vault (Efficiency)
- **Goal:** Make searching the Vault 10x faster and cheaper.
- **Tasks:**
    - [ ] Create `packages/storage/src/vault/nanoMemory.ts`.
    - [ ] Implement `grepVault` tool: A high-speed keyword search that returns only relevant document snippets.
    - [ ] Refactor `apps/worker-life/src/tools.ts` to use `grepVault` instead of full-document RAG.

### Phase 1.5: Universal Skill Bridge (MCP Integration)
- **Goal:** Enable Aelixxr to "plug and play" any community skill from ClawHub or NanoBot.
- **Tasks:**
    - [ ] Integrate `@modelcontextprotocol/sdk` into the LOS worker.
    - [ ] Implement an **MCP Host** that can consume external MCP Servers (e.g., Google Calendar, Bright Data).
    - [ ] Create a "Zero-Code" skill loader that reads `SKILL.md` from community repositories.

### Phase 2: Actionable Agency (Repetitive Tasks & Skills)
- **Goal:** Enable Aelixxr to handle "works" for the user using Community Skills.
- **Tasks:**
    - [ ] **SkillCalendar:** Implement `list_events`, `add_event`, and `check_conflicts` for automated scheduling (via MCP).
    - [ ] **SkillSocial:** Port `scripts/post-to-twitter.ts` and add support for Instagram/LinkedIn via secure OAuth.
    - [ ] **SkillMarketSpy (Bright Data inspired):** Implement a high-speed price scraper for local Nigerian markets.
    - [ ] **Sovereign Scheduler:** Integrate BullMQ for recurring nudges (e.g., "Remind me to pay rent on the 25th").
    - [ ] **Voice Ingestion:** Integrate Groq Whisper support for processing voice notes.

### Phase 3: Iron-Claw Security (Protection)
- **Goal:** Ensure the AI doesn't leak secrets or act without permission.
- **Tasks:**
    - [ ] **PII Sanitizer:** Add a filter to `handleMessage` (LOS) that replaces sensitive regex patterns with `[REDACTED]`.
    - [ ] **PIN-Protected Tools:** Mark high-stakes tools (Payments, Social Posting) as `AUTH_REQUIRED`.
    - [ ] **Tool Sandboxing:** Refactor tool handlers to have zero direct access to `process.env`.

---

## 4. Repetitive Task Examples (User Scenarios)

| Task | User Command | Aelixxr Action |
| :--- | :--- | :--- |
| **Calendar** | "What's my plan for tomorrow?" | Calls `list_events`, summarizes the day, and warns of any overlaps. |
| **Nudges** | "Remind me when it's 2 PM to call Mama." | Queues a BullMQ job to send a WhatsApp message at 2 PM. |
| **Social Media** | "Aelixxr, post this on Twitter and LinkedIn." | Drafts a professional caption, asks for **PIN**, then posts. |
| **Bill Tracking** | "Did I pay the school fees last term?" | Calls `grepVault` for "school fees", finds the receipt, and confirms the date. |
| **Market Deals** | "Aelixxr, find me the best price for Rice today." | Calls `SkillMarketSpy` and compares Mile 12 with Oyingbo market data. |

---

## 5. Verification & Testing
1.  **Unit Tests:** Verify `grepVault` returns correct snippets and `PII Sanitizer` redacts sensitive patterns.
2.  **Security Audit:** Attempt to trigger a `PIN-Protected` tool and ensure the HITL gate is enforced.
3.  **Stress Test:** Simulate 100 "Vault" entries and ensure search remains sub-second.
