# Product Requirement Document (PRD)
## Project Name: NaijaAgent Core
### Version: 1.0.3
### Date: March 8, 2026

## 1. Executive Summary
NaijaAgent Core is a multi-tenant, Sovereign-led AI platform for the Nigerian market. It converts WhatsApp from a simple chat app into a robust business operating system (SaaS) using Gemini 2.5 Flash. It is sector-agnostic, handling Retail, Logistics, and Service-based appointments with native Multimodal intelligence.

## 2. Problem Statement
*   **The Trust Deficit:** High friction in payments (Fake Alerts) and logistics (Rider tracking).
*   **Adoption Barrier:** Small business owners (Bosses) find traditional dashboards too complex to use and train.
*   **Security Risk:** Managing multiple clients on one system requires absolute context and key isolation.

## 3. Core Features

### 3.1 Sovereign Hierarchy (The Master-Tenant Model)
*   **Master Bot (COO):** A system-level agent that onboards new clients (`create_tenant`) and provides network-wide stats to the Sovereign (Owner).
*   **Tenant Bots:** Dedicated business assistants that learn prices/policies directly from their Boss via WhatsApp.

### 3.2 Security & Compliance
*   **Admin PIN Handshake:** 4-digit PIN authentication required for all management tools, with a 2-hour session window.
*   **Zero Balance Lock:** Automated service suspension for customers if the merchant's credit balance is empty.
*   **Anti-Spam messaging:** Quota-aware processing ensures zero triplicate messages during AI retries.

### 3.3 Multimodal Intelligence (Gemini 2.5 Flash)
*   **Vision:** Reads and extracts data from bank receipts for instant verification.
*   **Audio:** Native processing of voice notes in Pidgin and local dialects.
*   **Persistence:** All media (images/audio) is permanently archived in Firebase Storage.

### 3.4 Multi-Sector Flexibility
*   **Unified Activity Logging:** A single `manage_activity` tool handles Waybills, Bookings, and Orders.

## 4. User Stories
*   **As the Sovereign:** I want to onboard a new client by just telling my Master Bot their phone number and business name.
*   **As a Logistics Boss:** I want to train my bot on my delivery prices by just chatting with it from my phone.
*   **As a Retail Customer:** I want to send a receipt and get instant confirmation that my order is being processed.

## 5. Success Metrics
*   **Onboarding Time:** < 1 minute (Zero-code).
*   **Bot Wisdom:** AI handles 80%+ of routine inquiries using the Boss-trained knowledge base.
*   **Financial Accuracy:** 100% atomic credit tracking with zero balance leakage.
