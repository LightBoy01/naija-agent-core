# 📋 Review Later Backlog (Phase 8 & Expansion)

This document tracks strategic features, oversight tools, and technical expansions that have been deferred to maintain MVP focus and privacy boundaries during the **Empire Era (March 2026)**.

---

## 🛡️ 1. Sovereign Oversight (Master Bot Only)
*   **Global Chat Snapshot:** `get_chat_snapshot(tenantId, customerPhone)`. Allows the Master Bot to pull raw logs of any interaction in the network for auditing/dispute resolution.
*   **Network Intelligence:** `summarize_network_interactions(filter)`. A tool to scan all messages across the empire to find trends (e.g., "What are people in Lagos complaining about today?").
*   **Remote Pin Reset:** A secure protocol for the Master Admin to override a Boss's PIN if they are locked out or compromised.

## 💼 2. Business Management (Boss/Merchant Tools)
*   **Customer Briefing:** `summarize_customer_interactions(customerPhone)`. Allows the Boss to ask their bot for a "summary of the last 24 hours" with a specific customer before they step in manually.
*   **Visual Ledger Dashboard:** A web-based UI for Inventory, Sales, and archived receipts/voice notes (reducing WhatsApp "scroll fatigue").
*   **Post-Service Reviews:** Automatic follow-ups after a successful `manage_activity(status='delivered')` to collect 1-5 star ratings.

## ⚙️ 3. Technical Hardening & Expansion
*   **Native Android Bridge (.apk):** Re-evaluating the need for a dedicated app to replace the Termux SMS Relay if "Vision-First" fails at high volumes.
*   **Direct Bank API Integration:** Moving from Vision/SMS verification to official Monnify/Paystack APIs for 100% deterministic fraud prevention on high-value transactions.
*   **Proactive Reminders (BullMQ):** Using a background worker to send automated nudges for upcoming appointments, low stock, or abandoned carts without a user prompt.
*   **Multi-Currency Support:** Expanding the "Kobo Standard" to support USD/GBP ledgers for international merchants.

---
**Status:** These items are **PAUSED**. Do not implement until a specific **Sovereign Directive** is issued.
