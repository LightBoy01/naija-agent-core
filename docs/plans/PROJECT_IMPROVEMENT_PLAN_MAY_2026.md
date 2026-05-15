# Naija Agent Core: Project Improvement Plan (May 2026)

## Executive Summary
Following the successful deployment of the **Phase 9 (Modular Triad)** architecture and the **Phase 9.2 (Alajo Sovereign Financial System)**, the core infrastructure is highly stable and capable of multimodal, multi-agent operations. This improvement plan outlines the strategic next steps to reduce technical debt, enhance the AI's cognitive capabilities, and harden the system for large-scale user acquisition.

## Phase 1: Debt Reduction & System Hygiene (Immediate Priority)
The rapid iteration during Phase 9 introduced some structural debt that must be addressed to ensure long-term maintainability.

*   **1.1 Modularize Tool Handlers (`tools.ts`)**
    *   **Issue:** The `apps/worker-life/src/tools.ts` file has become a monolithic switch statement (~900 lines), making it difficult to maintain and test isolated tools.
    *   **Action:** Decompose `executeLifeTool` into specialized domain modules (e.g., `src/tools/vaultTools.ts`, `src/tools/financeTools.ts`, `src/tools/utilityTools.ts`). Create a central `ToolRegistry` that dynamically routes execution based on the tool name.
*   **1.2 Git & Package Integrity**
    *   **Issue:** New foundational packages (`packages/ai`, `packages/database`) and several critical testing scripts are untracked in Git.
    *   **Action:** Review, stage, and commit untracked packages. Update `.gitignore` if any generated or local configuration files are mistakenly pending.
*   **1.3 Centralize Hardcoded Configuration**
    *   **Issue:** Critical contact information (e.g., the Master Admin Phone `2347042310893`) is hardcoded across multiple files for fallback error reporting.
    *   **Action:** Migrate all hardcoded environment-specific strings into `SystemConfig` (`packages/types/src/config/index.ts`) for single-source management.

## Phase 2: Intelligence & Semantic Memory (Short-Term)
To fulfill the promise of a "Life Companion," Aelixxr must automatically learn and adapt without requiring explicit "save this" commands.

*   **2.1 Implement the "Sleep Cycle" (Memory Consolidation)**
    *   **Concept:** Aelixxr currently maintains episodic memory (Vault) and short-term chat context. We need to automate semantic memory extraction.
    *   **Action:** Implement the `consolidate-memory` BullMQ job. During off-peak hours (or triggered by inactivity), a background SLM worker will analyze the day's chat logs to extract new user facts, relationships, and unstated goals, updating the user's `Life Context` in Firestore automatically.
*   **2.2 Context Caching Optimization**
    *   **Concept:** The `Aelixxr.Soul.md` system prompt and dynamic contexts are large, contributing to higher token costs per request.
    *   **Action:** Utilize the Gemini API's Context Caching feature (if supported by the current `@google/genai` SDK version) for the base Aelixxr system instructions, reducing latency and execution cost for high-frequency users.

## Phase 3: Security & Forensic Hardening (Medium-Term)
As the system handles real financial value (Naira), security must continuously evolve ahead of potential threats.

*   **3.1 Refine PII Redaction (`redactPII`)**
    *   **Issue:** The current regex for redacting 7-15 digit numbers (`/\d{7,15}/g`) is too aggressive and may redact valid conversational context (e.g., dates, large quantities).
    *   **Action:** Implement an NLP-assisted or context-aware regex strategy that accurately identifies phone numbers, account numbers, and credit cards while ignoring standard numeric values.
*   **3.2 Enhanced Forensic Vision Pipeline**
    *   **Concept:** Relying solely on the AI to spot visual forgery is powerful but imperfect.
    *   **Action:** Enhance the `verify_payment_and_topup` flow. If an image is submitted, attempt to extract EXIF metadata (creation date, software used) before feeding it to Gemini. If the metadata suggests manipulation (e.g., "Photoshop"), flag the receipt for manual review automatically.

## Phase 4: Sector Expansion & Ecosystem Growth (Long-Term)
With the Supervisor/Worker (Soul/Agent) architecture established, the platform can infinitely scale its capabilities without bloating Aelixxr's core context.

*   **4.1 New SLM Sector Packs**
    *   **Action:** Develop new `Skill.md` and `Agent.md` files for high-value Nigerian domains:
        *   **`HealthPack`:** Medication reminders, symptom checker (with strict liability disclaimers), and nearest pharmacy locator.
        *   **`AgriPack`:** Market prices for crops, weather alerts, and farming best practices.
        *   **`LegalPack`:** Basic Nigerian law explanation (Tenancy, Police Rights) and template document generation.
*   **4.2 User-Facing Web Dashboards (The "Client" Portal)**
    *   **Concept:** While Sovereign Bosses have a dashboard, everyday Aelixxr users only have WhatsApp.
    *   **Action:** Create a secure, mobile-optimized Web Portal for users to visually view their Vault Ledger, download generated invoices/receipts, and manage their proactive Heartbeat subscriptions.