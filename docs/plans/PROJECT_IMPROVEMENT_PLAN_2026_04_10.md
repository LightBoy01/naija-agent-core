# Project Improvement Plan
*Date: April 10, 2026*
*Context: Naija Agent Core - Twin Engine Architecture (BOS/LOS)*
*Status: DRAFT*

## Executive Summary
This document outlines a structured improvement plan based on the codebase review conducted on April 10, 2026. The objective is to eliminate technical debt, strengthen the Twin Engine (BOS/LOS) architecture, and execute Phase 3 (The Sector Pivot) and Phase 2 (Build LOS Defense) of the Master Strategy.

---

## Strategic Goals & Action Items

### Goal 1: Complete the BOS "Sector-Agnostic" Entity Refactoring (High Priority)
*Alignment: Master Strategy Phase 3 (The Sector Pivot)*
Currently, the system is transitioning from a hardcoded commerce model to a flexible workflow automation engine. We need to complete this transition.

**Action Items:**
1. **Schema Migration:** Fully replace the legacy `ProductSchema` with the dynamic, JSON-based `EntityDefinition` in `packages/types`.
2. **Database Update:** Create a migration script to update existing Firestore tenant configurations to use the new `EntityDefinition` structure.
3. **Dynamic UI Rendering:** Refactor the Next.js Web Dashboard (`apps/web`) to dynamically render tables, forms, and views based on the active `EntityDefinition` (e.g., displaying "Patient Name" instead of "SKU").
- [x] **Sector Packs Expansion:** Finalize and test the `pack_health` and `pack_property` configurations in the worker plugin system.

### Goal 2: Enhance LOS "Vault" & Document Extraction (Medium Priority)
*Alignment: Master Strategy Phase 2 (Build LOS Defense)*
The Life OS (Aelixxr) is becoming a personal bureaucracy defender. We must expand its ability to ingest and understand diverse document types beyond simple bank alerts.

**Action Items:**
- [x] **Advanced OCR Pipeline:** Integrate robust OCR capabilities for general documents (receipts, utility bills, official letters).
- [x] **LLM-Based Classification:** Implement an LLM step in the `worker-life` pipeline to automatically classify incoming documents and extract key metadata (amounts, dates, reference IDs, issuing authority).
- [x] **Searchable Vault:** Ensure all extracted metadata is properly indexed in Firestore for rapid, natural-language querying by the user via WhatsApp.

### Goal 3: Implement Centralized Observability & Queue Monitoring (High Priority)
*Alignment: Operational Stability & System Health*
With the event-driven monorepo relying heavily on BullMQ (Redis) and Fastify, monitoring asynchronous jobs across BOS and LOS is critical for production reliability.

**Action Items:**
- [x] **Job Tracking Dashboard:** Deploy a centralized BullMQ dashboard (e.g., BullMQ Board or a custom Next.js admin route) to monitor queue health, active jobs, and failure rates.
- [x] **Proactive Alerts:** Configure automated alerts (via Sovereign Snitch/WhatsApp or email) for critical job failures or queue backlogs.
- [x] **Error Tracing:** Ensure all worker nodes have consistent, structured logging (JSON format) with trace IDs that follow a request from the Fastify API through the Redis queue to the final worker execution.

### Goal 4: Eradicate Technical Debt & Fortify Environment (Medium Priority)
*Alignment: Phase 7 Security & Stability Audit Continuation*
Addressing lingering technical debt ensures the foundation remains strong for future scaling.

**Action Items:**
- [x] **Decommission Legacy Bridge:** Safely archive and delete the `legacy_bridge/` directory, confirming that the new asynchronous SMS bridge has fully replaced its functionality.
- [x] **Strict Type Integrity:** Conduct a sweep of `packages/types` and other shared packages to replace all remaining `any` types with strict, Zod-backed interfaces.
- [x] **Termux Environment Optimization:** Review and optimize the `scripts/build.js` process to minimize memory consumption, mitigating the Out-Of-Memory (OOM) limits frequently hit during Android/Termux development.

---

## Execution Timeline

* **Week 1-2:** Focus heavily on Goal 4 (Technical Debt) and Goal 1 (Entity Refactoring). This stabilizes the core and unlocks the generic sector capabilities.
* **Week 3:** Implement Goal 3 (Observability) to ensure we can monitor the newly refactored systems safely.
* **Week 4:** Focus on Goal 2 (LOS Vault Enhancements) to drive user engagement and retention.

---

*Prepared by Gemini CLI*LI*