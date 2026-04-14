# Phase 9: The Hierarchical Agentic Architecture Blueprint

## 1. Executive Summary
This document outlines the architectural roadmap to transition the Naija Agent Core from a monolithic prompt structure to a **Hierarchical Multi-Agent System (Supervisor/Worker pattern)**. This shift separates the AI's "Soul" (Aelixxr, the empathetic orchestrator) from the "Skills" (Small Language Models / SLMs acting as sector-specific workers), enabling rapid iteration, safer high-stakes execution, and infinite scalability without token bloat.

## 2. Current State Assessment (Stable MVP)
As of April 2026, the MVP is **highly stable and ready for early users**. Critical production blockers have been resolved:
*   **API Stability:** Replaced unstable preview models with `gemma-4-26b-a4b-it` (Primary) and `gemini-2.5-flash` (Fallback), eliminating 503/429 crash loops.
*   **Persistent Memory:** Fixed Aelixxr's "amnesia." It now reliably reads/writes chat history to Firestore.
*   **Data Integrity:** Separated Aelixxr (`_life`) and Zynux chat histories, preventing identity conflicts.
*   **Base Capabilities:** Active MCP tool integration (`fetch_webpage` with SSL fixes) and native `web_search`.

## 3. The Supervisor/Worker Paradigm
To scale beyond the MVP, we are dismantling the "do-it-all" monolithic agent. Aelixxr will no longer load every tool into her context window. Instead, she will act as the **Orchestrator**, delegating complex tasks to specialized SLMs equipped with dynamic "Sector Packs."

### A. The Supervisor: `Soul.md` (Aelixxr's Core Identity)
The immutable heart of the AI. It dictates *how* Aelixxr thinks, speaks, and manages the user's Life Context (Energy, Family, Goals).
*   **Role:** Empathy, intent routing, and final synthesis.
*   **Primary Tool:** `delegate_task(sector: string, instruction: string)`
*   **Model:** High-reasoning (e.g., Gemma 4 or Gemini 1.5 Pro).

### B. The Workers: `Agent.md` (Sector-Specific SLMs)
Lightweight, ephemeral agents spawned by Aelixxr to execute specific workflows. They do not maintain long-term memory; they only receive the context necessary for their task.
*   **Role:** Fast, cheap execution of deterministic or research-heavy tasks.
*   **Model:** Fast/Cheap (e.g., Gemini 2.5 Flash or local 8B models).
*   **Examples:** `StudyBuddy_SLM`, `MarketAnalyst_SLM`, `VaultClerk_SLM`.

### C. Dynamic Sector Packs (`Skill.md`)
Tools are no longer globally available. They are partitioned into logical "Packs" loaded only by the relevant SLM Worker.
*   **`CommercePack`:** `get_market_prices`, `verify_nafdac` (Loaded by MarketAnalyst_SLM).
*   **`EducationPack`:** `generate_quiz` (Loaded by StudyBuddy_SLM).
*   **`LifePack`:** `search_vault`, `save_note`, `create_heartbeat` (Loaded by VaultClerk_SLM).

## 4. The Execution Flow (Deadlock-Free BullMQ Orchestration)
We will leverage our existing BullMQ infrastructure to handle multi-agent concurrency without complex frameworks (like LangGraph). To prevent queue starvation (deadlocks), Orchestrator jobs will never `await` SLM jobs; they will use a decoupled callback pattern.

1.  **Ingestion:** User sends WhatsApp message -> `life-queue` -> Aelixxr (Supervisor).
2.  **Orchestration (Job 1: `life-chat`):** Aelixxr evaluates intent. If simple chat, she replies and the job ends. If a tool is needed, she generates a `delegate_task` function call.
3.  **Delegation (Non-Blocking Handoff):** 
    *   The `life-chat` job pushes a *new* job `execute-slm-task` to the queue, passing the chat history and Aelixxr's instructions.
    *   *UX Enhancement:* The job immediately streams an interim message to WhatsApp: *"I'm on it! Let me send my market analyst to check that for you..."*
    *   **CRITICAL:** The `life-chat` job then returns `success` and terminates, freeing up the worker's concurrency slot.
4.  **Worker Execution (Job 2: `execute-slm-task`):** A fresh worker slot picks up the task. The SLM loads the required `SectorPack`, calls the tool, and generates a structured JSON report.
5.  **Synthesis (Job 3: `life-chat-resume`):** The SLM job pushes a final job back to the queue containing its report. Aelixxr is spun up one last time, receives the report as a tool response, synthesizes it using her empathetic `Soul.md` persona, and sends the final WhatsApp message.

## 5. Security & Cost Optimization (The "Red Team" Mitigations)
*   **The "Telephone Game" Risk:** Aelixxr must be strictly prompted to pass exact, unadulterated user parameters to the SLM workers to prevent data loss during delegation.
*   **Infinite Loop Prevention:** We must enforce a hard **Maximum Hops limit (e.g., 3 turns)**. If SLMs cannot resolve the task, Aelixxr forcefully terminates and apologizes to the user.
*   **Cost Control:** Aelixxr's `Soul.md` must utilize **Context Caching** to drastically reduce the per-message cost of her extensive persona prompt. SLMs use cheap models to offset the cost of orchestration turns.

## 6. Refactoring Steps (Immediate Action Plan)
1.  **Create the Triad Structure:** Draft `Aelixxr.Soul.md` and initial Sector Packs (`Commerce.Agent.md`, `Vault.Agent.md`) in a new `apps/worker-life/src/prompts/` directory.
2.  **Update `tools.ts`:** Remove monolithic tools and replace them with the single `delegate_task` tool for Aelixxr.
3.  **Implement SLM Worker:** Create the `execute-slm-task` logic in `apps/worker-life/src/index.ts` to spin up isolated Gemini Flash instances with specific Sector Packs.
4.  **Hot-Reload via Endpoint:** Implement a robust `POST /admin/refresh-prompts` endpoint instead of relying on fragile `fs.watch` in production.