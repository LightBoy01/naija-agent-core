# MASTER STRATEGY 2026: The Sector-Agnostic Sovereign
*Date: March 25, 2026*
*Status: ACTIVE*

## 0. Core Philosophy: Simplification & Trust
Every architectural decision, feature, and line of code must answer "YES" to:
1.  **Simplification:** Does this reduce cognitive load for the user? Does this reduce complexity for the developer?
2.  **Trust:** Does this guarantee data integrity (financial/legal)? Does this honor the user's sovereignty?

---

## 1. The Core Vision: Twin Engine Architecture
We are building a **Super Agent** that serves two distinct masters with a unified goal: **Sovereignty**.
*   **BOS (Business OS):** The "Money Maker". Focuses on Workflow Automation for *any* sector.
*   **LOS (Life OS):** The "Life Guardian". Focuses on Personal Bureaucracy Defense for *any* individual.

---

## 2. BOS Strategy: The Sector-Agnostic Pivot
*Goal: Transform from "Commerce OS" to "Workflow Automation OS".*

### A. The Conceptual Shift
We abstract specific business logic into generic entities.
*   **Product** $\rightarrow$ **Entity** (e.g., Patient Record, Case File, Apartment Unit).
*   **Order** $\rightarrow$ **Transaction** (e.g., Appointment, Retainer, Lease).
*   **Inventory** $\rightarrow$ **Availability** (e.g., Doctor's Hours, Vacancy).

### B. Implementation: "Sector Packs"
To avoid "Configuration Fatigue", we do not ask users to build the bot. We provide pre-built JSON configurations.

| Sector | Pack Name | Entity | Transaction | Workflow |
| :--- | :--- | :--- | :--- | :--- |
| **Retail** | `pack_commerce` | Product | Order | Pending $\rightarrow$ Paid $\rightarrow$ Delivered |
| **Health** | `pack_clinic` | Service/Drug | Appointment | Triage $\rightarrow$ Confirmed $\rightarrow$ Completed |
| **Real Estate** | `pack_property` | Unit | Lease/Viewing | Inquiry $\rightarrow$ Viewing $\rightarrow$ Signed |
| **Legal** | `pack_legal` | Case | Retainer | Consultation $\rightarrow$ Filing $\rightarrow$ Closed |

### C. Technical Execution
1.  **Dynamic Schema:** Replace hardcoded `ProductSchema` with a flexible JSON-based `EntityDefinition` in Firestore.
2.  **Universal UI:** The Web Dashboard reads the `EntityDefinition` to render "Patient Name" or "SKU" dynamically.

---

## 3. LOS Strategy: The Vault & The Defense
*Goal: Make the agent indispensable by solving the "Chaos of Documentation".*

### A. The "Vault" (Ingestion)
*   **Promise:** "Never lose a document again."
*   **Mechanism:** User forwards images/PDFs/SMS (Bank Alerts) to WhatsApp.
*   **Action:**
    1.  **OCR/Extraction:** AI extracts key data (Amount, Date, Ref ID).
    2.  **Classification:** "School Fees", "Tax", "Utility".
    3.  **Storage:** Save text/metadata to Firestore (Searchable). Archive image to efficient storage.

### B. The "Defense" (Action)
*   **Promise:** "I will fight your battles."
*   **Mechanism:** User commands LOS to resolve a dispute.
*   **Action:** RAG-Based Generation.
    *   **Context:** AI retrieves the specific transaction from The Vault.
    *   **Authority:** AI retrieves relevant laws (CBN Circulars, Tenancy Laws) from Vector DB.
    *   **Output:** Generates a formal, legally-sound letter (PDF) for the user to send.

---

## 4. The Bridge: Inter-Agent Commerce
*Goal: The Network Effect.*
Enable LOS agents to seamlessly purchase from BOS agents.
*   **Scenario:** LOS User asks for "Cake". LOS queries the BOS Network for `pack_commerce` agents selling "Cake".
*   **Transaction:** Atomic payment from Sovereign Wallet to Merchant Wallet.

---

## 5. Execution Roadmap

### Phase 1: Solidify BOS Commerce (Current)
*   Ensure the "Commerce Pack" is robust (Inventory, Payments, Orders).
*   **Success Metric:** 99.9% Transaction Reliability.

### Phase 2: Build LOS Defense (Next)
*   Implement "The Vault" (Document Ingestion & Search).
*   Implement "The Defense" (RAG-based Letter Generation).
*   **Success Metric:** User retention via Document Search frequency.

### Phase 3: The Sector Pivot
*   Refactor database to support `EntityDefinition`.
*   Launch `pack_health` and `pack_property`.
*   **Success Metric:** Non-retail tenant acquisition.

### Phase 10: Agentic Network Fusion (Triad Architecture)
*   Decompose monolithic prompts into Soul.md (Core Protocol), Agent.md (Persona), and Skill.md (Tools).
*   Integrate Aelixxr Sovereign Vault (Monnify Virtual Accounts) natively into onboarding.
*   **Success Metric:** Frictionless multi-tenant AI onboarding and deployment.

### Phase 11: The China-Africa Hybrid Cloud (Tencent Migration)
*   **Architecture:** Shift from Vercel/Firebase to Tencent Cloud Run (API) + Lighthouse (Workers) + Managed TencentDB (Postgres/Redis) + Tencent COS (Storage).
*   **The Sidecar Edge:** Deploy lightweight Go binaries (`whatsapp-sidecar`) to maintain 100k+ `whatsmeow` websockets with Meta, queuing payloads directly into Redis.
*   **Security:** Map `JID -> Org Slug` in Postgres for perfect tenant routing.
*   **Success Metric:** O(1) node scaling capable of handling 50,000 concurrent messages securely.

---
**CRITICAL NEXT STEPS (Post-Phase 10 Review):**
1. **The Great Firebase Purge:** Eradicate all remaining `@naija-agent/firebase` imports in `apps/api` and `apps/worker` to finalize the Drizzle/Postgres single source of truth.
2. **MFA Interceptor:** Build a deterministic chat interceptor to halt AI execution and resume only when a Boss provides a valid 6-digit MFA code for Sovereign Tools (e.g., broadcasts).
3. **Phase 11 Topography:** Document VPC security rules mapping Sidecar, Worker, and Redis on Tencent Cloud.
