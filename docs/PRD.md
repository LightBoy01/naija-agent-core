# Product Requirement Document (PRD)
## Project Name: NaijaAgent Core
### Version: 1.0.4
### Date: March 9, 2026

## 1. Executive Summary
NaijaAgent Core is a multi-tenant, Sovereign-led AI platform for the Nigerian market. It converts WhatsApp from a simple chat app into a robust business operating system (SaaS) using Gemini 2.5 Flash. It positions AI as a **"Digital Apprentice"** for SMEs, handling Retail, Logistics, and Service-based appointments with native Multimodal intelligence and street-smart Nigerian context.

## 2. Problem Statement
*   **The Trust Deficit:** High friction in payments (Fake Alerts) and logistics (Rider tracking).
*   **Adoption Barrier:** Small business owners (Bosses) find traditional dashboards too complex to use and train.
*   **Security Risk:** Managing multiple clients on one system requires absolute context and key isolation.

## 3. Core Features

### 3.1 Sovereign Hierarchy (The Master-Tenant Model)
*   **Master Bot (COO):** A system-level agent that onboards new clients (`create_tenant`) and provides network-wide stats. It is project-aware (PBA) and acts as the lead Sales Closer.
*   **Tenant Bots (Digital Apprentices):** Dedicated business assistants that learn prices/policies directly from their Boss via WhatsApp.

### 3.2 Security & Financial Integrity
*   **Admin PIN Handshake:** 4-digit Bcrypt-hashed PIN required for all management tools, with a 2-hour session window and brute-force lockout.
*   **Pre-Debit Billing:** Credits are deducted *before* AI processing to prevent race conditions, with atomic refunds on failure.
*   **Dynamic Multi-Tenancy:** Automated webhook verification using tenant-specific App Secrets.

### 3.3 Multimodal Intelligence & Anti-Fraud
*   **Vision:** Reads receipts and detects digital alterations (Photoshop detection).
*   **Auto-Matching Engine:** Android SMS Bridge that cross-references manual receipts with real-time bank SMS alerts for 100% verification.
*   **Audio:** Native processing of voice notes in Pidgin and local dialects.

### 3.4 Multi-Sector Flexibility
*   **Unified Activity Logging:** A single `manage_activity` tool handles Waybills, Bookings, and Orders.

## 4. User Stories
*   **As the Sovereign:** I want to scale my empire by telling the Master Bot to onboard 5 new clients in 5 minutes.
*   **As a Retail Boss:** I want the "Digital Apprentice" to verify payments while I sleep, using my bank's own SMS alerts.
*   **As a Customer:** I want to send a Pidgin voice note and get a professional reply and order confirmation instantly.

## 5. Success Metrics
*   **Onboarding Time:** < 1 minute (Zero-code for the Boss).
*   **Anti-Fraud Rate:** 100% detection of spoofed receipts via SMS matching.
*   **Financial Accuracy:** 100% atomic credit tracking with zero balance leakage.
