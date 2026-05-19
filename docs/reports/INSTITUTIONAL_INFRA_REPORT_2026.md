# Institutional Sovereign Infrastructure Report (May 2026)

## 1. Executive Summary
The Naija Agent Core infrastructure has been upgraded from a "Startup MVP" (Meta API + Firebase) to an **Institutional Sovereign Stack**. This move slashes operational costs to zero (no per-message fees), ensures data sovereignty, and provides the ACID-compliant reliability required for a high-scale financial agentic network.

---

## 2. The Sovereign Sidecar (Go Engine)
**Path:** `apps/whatsapp-sidecar/`

### **Architecture**
*   **Engine:** `whatsmeow` (Golang).
*   **Role:** Acts as a high-performance, multi-tenant WebSocket gateway between the physical WhatsApp network and the Node.js logic workers.
*   **Efficiency:** Uses ~20MB RAM per bot (v.s. 200MB+ for Node.js/Puppeteer solutions).

### **Key Features**
*   **Session Hydration:** Automatically pulls and re-connects all 1,000+ active WhatsApp sessions from PostgreSQL upon startup.
*   **Redis Integration:** Inbound messages are published directly to the BullMQ compatible `whatsapp-queue` or `life-queue`, bypassing internal HTTP lag.
*   **Outbound API:** Provides an internal REST endpoint (`/send`) for Node.js workers to dispatch messages.

---

## 3. Database: The PostgreSQL "Ledger of Record"
**Package:** `@naija-agent/database`

### **The Pivot**
We have consolidated all financial and session data from TiDB/Firebase into a unified **PostgreSQL** backbone.

### **Hardening (Iron Ledger)**
*   **Atomic Transactions:** All balance updates (`add`, `deduct`, `top-up`) now utilize **`SELECT FOR UPDATE`** row-level locking.
*   **Financial Integrity:** Prevents race conditions during high-concurrency events (e.g., thousands of users buying airtime simultaneously).
*   **Schema Consistency:** Uses **Drizzle ORM** with `jsonb` for flexible AI memory and `bigint` for precision kobo-based billing.

---

## 4. Iron Shield (Gateway Security)
We have moved critical security logic from the "soft" AI layer to the "hard" Go gateway.

*   **PIN Interceptor:** A pre-compiled Regex engine in the Go sidecar scans every incoming message. Potential 4-digit PINs are intercepted and blocked from entering the LLM processing queue.
*   **PII Scrubbing:** All conversational logs are redacted before storage to ensure sensitive data (PINs, full account numbers) never leaks into chat history.

---

## 5. Intelligence Layer (Orchestrator v2)
**Package:** `@naija-agent/ai`

*   **Universal SDK Migration:** Upgraded to the modern `@google/genai` SDK.
*   **Twin-Engine Identity:** Standardized on `gemini-3-flash` (Primary) with a robust fallback to `deepseek-chat` or `qwen` via the **AI Orchestrator**.
*   **Chain-of-Thought Guard:** Implemented regex parsing to strip `<think>` tags, preventing internal agent reasoning from being visible to the end-user.

---

## 6. Current Implementation Status

### **Phase 1: DeepSeek-R1 Integration (DashScope)**
*   **Status:** ✅ **Active**
*   **Details:** `DashScopeProvider` integrated into `@naija-agent/ai`. Standardized on Qwen/DeepSeek reasoning.

### **Phase 2: Media Sovereignty (Alibaba OSS)**
*   **Status:** ✅ **Active**
*   **Details:** `AlibabaOSSProvider` integrated into `@naija-agent/storage`. All incoming media (Business & Life) is now archived permanently.

### **Phase 3: IP & Proxy Rotation**
*   **Status:** ✅ **Active**
*   **Details:** Per-tenant SOCKS5/HTTP proxy support implemented in Go Sidecar. Prevents systemic fleet bans.

### **Phase 4: Dashboard V3**
*   **Status:** ⏳ **Planned**
*   **Details:** Pull real-time analytics from PostgreSQL ledger.


---
_⚓ "Built for the streets of Lagos, scaled for the global market."_
