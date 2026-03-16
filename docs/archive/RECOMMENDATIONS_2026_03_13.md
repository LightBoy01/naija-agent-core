# Strategic Recommendations & Codebase Review (March 13, 2026)

## 1. Executive Summary
The `naija-agent-core` codebase is in a strong "Post-Launch" state (Phase 7). The infrastructure is robust, modular, and secure. However, to ensure scalability and refine the user experience as we scale to hundreds of tenants, we recommend the following technical and strategic improvements.

## 2. Technical Refinements

### A. Price Guard V2 (Context-Aware)
*   **Current State:** Deterministic Regex check against *current turn* tool results.
*   **Issue:** May flag valid prices mentioned 2-3 turns ago as "hallucinations" if they aren't in the immediate tool output.
*   **Recommendation:** Implement a "Rolling Context Window" for the Price Guard.
    *   Cache the last 3 turns of `search_products` results in Redis (`price_context:${orgId}:${from}`).
    *   Check the user's quoted price against this aggregated list before redacting.

### B. High-Latency Job Separation
*   **Current State:** Single `whatsapp-queue` processes everything sequentially.
*   **Issue:** A slow Image Generation or Reporting task blocks simple text replies for other tenants.
*   **Recommendation:** Split into two queues:
    *   `fast-lane`: Text replies, simple lookups.
    *   `heavy-lane`: Image generation, detailed reporting, broadcasting.
    *   Run separate Workers (or concurrency settings) for each.

### C. Dashboard Completion
*   **Current State:** `apps/web` structure exists but is skeletal.
*   **Recommendation:** Prioritize the **Visual Inventory & Ledger** views.
    *   "Boss Mode" needs a graphical interface for bulk stock updates and checking the daily ledger, which is tedious via chat.

## 3. Strategic Observations

### A. The "Meta AI" Threat
*   **Observation:** We are building on WhatsApp, but Meta is launching its own "Meta AI" for businesses.
*   **Defense:** Double down on **Hyper-Localization** and **Vertical Integration**.
    *   **Pidgin/Culture:** Meta's AI is polite; ours is "Naija".
    *   **Payment Forensics:** Meta won't likely build specific "Fake Alert" detectors for Nigerian bank apps.
    *   **Logistics:** Deep integration with local riders/parks.

### B. Onboarding Friction
*   **Observation:** The "Owned App" model is secure but hard to set up.
*   **Recommendation:** Productize the "Setup Service". Make it a paid "White Glove" onboarding where we handle the Meta Developer Console complexity for them.
