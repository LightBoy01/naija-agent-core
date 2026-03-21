# Dual Identity Strategy: Zynux (Business) & Aelixxr (Life)

**Date:** March 2026
**Status:** Strategic Directive
**Project:** Vynux (formerly Naija Agent Core)

## 1. Executive Summary
This document formalizes the strategic decision to split the platform into two distinct consumer-facing identities sharing a single technological core. This approach, termed "Dual Identity, Shared Brain," addresses the "Trust Contagion" risk while maximizing operational clarity.

## 2. The Trinity Naming Convention

### A. The Core (Infrastructure) $\rightarrow$ **VYNUX**
*   **Definition:** The Monorepo, the Shared Database (Firestore), and the Intelligence Routing Layer.
*   **Role:** The "Hive Mind" that connects the two hemispheres.
*   **Repo Name:** `vynux-core` (formerly `naija-agent-core`)

### B. The Business Engine (BOS) $\rightarrow$ **ZYNUX**
*   **Identity:** "The Iron Bank."
*   **Phone Number:** Dedicated Business Line (Green Tick verified).
*   **Personality:** Professional, Concise, Transactional, Zero-Hallucination.
*   **Primary Metrics:** Transaction Volume (TPV), Uptime, Fraud Prevention.
*   **Master Bot:** "Master of Coin" (Alerts: Payments, Server Health).

### C. The Life Operating System (LOS) $\rightarrow$ **AELIXXR**
*   **Identity:** "The Daily Cure."
*   **Phone Number:** Dedicated Lifestyle Line.
*   **Personality:** Empathetic, Knowledgeable, Chatty, Helpful.
*   **Primary Metrics:** Daily Active Users (DAU), Query Resolution, "Wow" Moments.
*   **Master Bot:** "Master of Life" (Alerts: Scraper Health, Trending Topics).

## 3. Architecture of Separation

### Traffic Routing (The "Vynux" Layer)
The API (`apps/api`) acts as the traffic controller based on the receiving WhatsApp Phone ID.

```mermaid
graph TD
    User_WhatsApp -->|Msg to Zynux #| API_Gateway
    User_WhatsApp -->|Msg to Aelixxr #| API_Gateway
    
    API_Gateway -->|ID == ZYNUX_ID| Zynux_Queue[Zynux Queue]
    API_Gateway -->|ID == AELIXXR_ID| Aelixxr_Queue[Aelixxr Queue]
    
    Zynux_Queue --> Worker_BOS[Worker: Zynux (Business)]
    Aelixxr_Queue --> Worker_LOS[Worker: Aelixxr (Life)]
    
    Worker_BOS <--> Shared_DB[(Vynux Firestore)]
    Worker_LOS <--> Shared_DB
```

### Data Synergy (The "Magic")
Despite the split, the database is shared.
*   **Scenario:** User asks **Aelixxr** for the price of rice.
*   **Aelixxr:** "Rice is N45k."
*   **Cross-Sell:** Aelixxr checks **Vynux DB** -> "I see you have N500k in your **Zynux** wallet. Want me to draft a purchase order for you?"

## 4. Operational Benefits
1.  **Risk Isolation:** If **Aelixxr** gets banned by Meta for scraping or policy violation, **Zynux** (revenue) remains untouched.
2.  **Specialized Tuning:** 
    *   **Zynux** runs on low-temperature models (Deterministic).
    *   **Aelixxr** runs on high-temperature models (Creative).
3.  **Clearer Marketing:**
    *   Sell **Zynux** to Merchants.
    *   Sell **Aelixxr** to Everyone.

## 5. Implementation Roadmap
1.  [ ] **Rename Project:** Update docs/internal references to Vynux.
2.  [ ] **API Routing:** Modify `apps/api/src/index.ts` to route based on `phone_number_id`.
3.  [ ] **Env Config:** Add `ZYNUX_PHONE_ID` and `AELIXXR_PHONE_ID` to `.env`.
4.  [ ] **Master Bot Split:** Configure distinct admin numbers for BOS/LOS alerts.
