# MASTER PLAN: Aelixxr Empire Era (100k User Sprint)

## 0. Executive Summary
Capture the Nigerian university market and scale to 100,000 users within 60 days. This is achieved by pivoting from a "Startup MVP" (Vertex/Firebase) to a "China-Africa Hybrid" stack (DeepSeek/Alibaba/TiDB), slashing infrastructure costs to near-zero via accelerator credits while ensuring infinite scalability.

---

## 1. The Architectural Pivot (China-Style Efficiency)

| Component | Current (MVP) | Target (Empire Era) | Strategic Value |
| :--- | :--- | :--- | :--- |
| **Brain (AI)** | Vertex AI (Gemini) | **DeepSeek (via BytePlus)** | $100k credit pool; 20x lower inference cost. |
| **Memory (DB)** | Firestore | **TiDB Serverless** | HTAP for real-time reporting; ACID for the Vault. |
| **Body (Worker)** | Northflank | **Alibaba SAE** | Auto-scales to 1,000 pods; Burst-ready for campus hype. |
| **Shield (Proxy)** | Direct to API | **Tencent EdgeOne** | Nigerian PoP; <800ms latency; Anti-bot WAF. |
| **Vault (Media)** | GCS / Cloudinary | **Alibaba OSS / MinIO** | Minimal egress; S3-compatible logic. |
| **Messaging** | Official WABA | **Optimized WABA** | Filtering invalid traffic at Edge to save Meta fees. |

---

## 2. Technical Implementation Roadmap

### Phase 1: The Sovereign Foundation (Days 1-7)
*   **AI Refactor:** Create `@naija-agent/ai` package. Implement `UniversalAIProvider` to support OpenAI-compatible SDKs (DeepSeek/Doubao) with Gemini fallback.
*   **Database Refactor:** Initialize `@naija-agent/database` using **Drizzle ORM**.
    *   Target: TiDB Serverless (MySQL).
    *   Schema: `users`, `vault_transactions`, `life_context`, `referrals`.
*   **Migration:** Secure script to port existing Firestore records to SQL.

### Phase 2: The Edge & Cloud Pivot (Days 8-21)
*   **Alibaba SAE Deployment:** Containerize the monorepo for Alibaba Serverless App Engine.
*   **Edge Functions:** Deploy Tencent EdgeOne functions to handle WABA webhooks at the network edge.
*   **Alibaba OSS:** Replace GCS/Cloudinary uploaders with S3-compatible Alibaba OSS client.
*   **Accelerator Apps:** Finalize and submit BytePlus VStart and Alibaba ABH grant applications.

### Phase 3: The University Blitz (Days 22-60)
*   **Viral Loops:** Launch automated referral system in the StudyBuddy agent.
*   **"Sovereign Snitch" 2.0:** Real-time financial health and growth dashboards powered by TiDB HTAP queries.
*   **Campus Launch:** Deploy Aelixxr ambassadors to 5 major Nigerian universities (UNILAG, UNILORIN, OAU, ABU, UNIBEN).

---

## 3. Risk Management & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Drizzle Migration Delay** | Incremental move: Financial ledger first, semantic memory second. |
| **DeepSeek API Latency** | Automatic "Smart Fallback" to Gemini 1.5 Flash in `slmHandler`. |
| **WABA Cost Surge** | Strict filtering at the Edge (Tencent EdgeOne) to prevent spam-induced conversation charges. |
| **Data Sovereignty** | Host Alibaba/TiDB nodes in Singapore/Germany regions to ensure NDPR compliance. |

---

## 4. Success Metrics
1.  **Infra Burn:** Total infrastructure cost < $50/mo (post-credits).
2.  **Scalability:** Support 10,000 simultaneous chats without latency degradation.
3.  **Integrity:** 0.00% discrepancy in the Alajo Vault Naira balance.
4.  **Growth:** Reach 100,000 registered phone numbers by Day 60.

---
**⚡ PREPARED BY GEMINI CLI FOR NAIJA AGENT CORE.**
