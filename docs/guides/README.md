# Naija Agent Core - Guides & Documentation Index

Welcome to the **Naija Agent Core Guides** directory. This folder serves as the central knowledge base for deploying, configuring, testing, and marketing the Naija Agent ecosystem. It contains detailed manuals for setting up the technical infrastructure, understanding the API endpoints, executing live tests, and effectively pitching the product to prospective clients.

---

## 📑 Directory Index and Overview

Below is a detailed breakdown of each guide, summarizing its purpose, core concepts, and established workflows.

### 1. [ALAJO_SYSTEM_GUIDE.md](./ALAJO_SYSTEM_GUIDE.md)
**Purpose:** Details the architecture and operational protocols of the Alajo Sovereign Financial System, which elevates Aelixxr into a fully-fledged Sovereign Financial Manager.
*   **Key Workflows & Features:**
    *   **The "One-Vault" Strategy:** Maps users to dedicated Monnify Virtual Accounts, strictly isolating real Naira (`vaultBalanceNaira`) from AI Fuel (`energyCredits`).
    *   **Revenue & Utility Engine:** Outlines the automated vending processes (Monnify VAS) for Airtime, Data, and Electricity, including the platform's revenue model (flat fees and commissions).
    *   **The Iron Shield (Security):** Explains the implementation of Salted Bcrypt for PIN hashing, the mandatory PIN protocol for high-stakes tool calls, and the regex-based AI Interceptor designed to prevent AI hallucinations and enforce PII scrubbing.
    *   **Tool Reference:** A comprehensive list of tools for financial operations (`withdraw_vault_funds`, `vend_utility`, `convert_vault_to_energy`, etc.).

### 2. [API_REFERENCE.md](./API_REFERENCE.md)
**Purpose:** A concise reference manual for all public and internal engine endpoints powering the Naija Agent platform in 2026.
*   **Key Workflows & Features:**
    *   **WhatsApp Webhook (`/webhook`):** Endpoints for Meta handshake verification and secure, asynchronous message ingestion via BullMQ.
    *   **Payments & Billing (`/payments/paystack`):** The official Paystack webhook for securely crediting user balances in Firestore.
    *   **Onboarding V2:** Endpoints (`/register-phone`, `/verify-otp`) to streamline Meta Cloud SIM registration.
    *   **Dashboard Actions & System Monitoring:** Details endpoints for updating statuses on the Dispatch Board and performing health/uptime checks for Redis and the API service.

### 3. [EMPIRE_SETUP_GUIDE.md](./EMPIRE_SETUP_GUIDE.md)
**Purpose:** A comprehensive, zero-to-launch deployment blueprint designed for setting up the "Sovereign Empire" on a Netcup RS 1000 G12 (AMD EPYC) server.
*   **Key Workflows & Features:**
    *   **Server Provisioning:** Step-by-step OS installation (Ubuntu 24.04 LTS) and SSH configuration.
    *   **Iron Shield Hardening:** Setting up UFW firewall rules and configuring emergency NVMe-backed swap files for high-scale memory management.
    *   **Command Center Setup (Coolify):** Instructions for installing Coolify to manage Docker containers, automated SSL (Let's Encrypt), and GitHub CI/CD pipelines.
    *   **Deployment & Maintenance:** Deploying the Unified Empire Bundle (Go Sidecar + API + Workers) via Docker Compose, alongside best practices for backups and Red Team proxy security.

### 4. [LIVE_WHATSAPP_TEST_GUIDE.md](./LIVE_WHATSAPP_TEST_GUIDE.md)
**Purpose:** A practical, scenario-based testing manual to validate the real-time behavior of Aelixxr (Life OS) and Zynux (Business OS) over WhatsApp.
*   **Key Workflows & Features:**
    *   **Quick Pulse:** Immediate latency and connection tests for both AI personas.
    *   **Aelixxr Scenarios (Life OS):** Tests for Vault storage/retrieval, energy credit tracking, scheduled reminders, Search Engine fallback (SearXNG/Brave), and heavy task delegation to Hermes.
    *   **Zynux Scenarios (Business OS):** Validations for contextual awareness, the Sovereignty PIN lock, Commerce Cart lifecycle (add/view/clear), Payment instructions, Spam mitigation, and Sector pack routing.
    *   **Security & Health:** Procedures for verifying PII protection, testing energy exhaustion limits, and running VPS health check commands directly against Docker logs and the PostgreSQL ledger.

### 5. [MARKETING_KIT.md](./MARKETING_KIT.md)
**Purpose:** A strategic blueprint that translates the platform's technical capabilities into high-conversion sales pitches and marketing assets.
*   **Key Workflows & Features:**
    *   **Anti-Spam Elevator Pitches:** Quick hooks designed for business owners, focusing on time-saving and fraud alert prevention.
    *   **Cold DM Templates:** Tailored WhatsApp outreach templates for Instagram vendors and Logistics companies.
    *   **Strategic Campaigns:** The "Night Owl" campaign strategy, capitalizing on late-night outreach when business owners are most stressed.
    *   **Demo Assets:** Pre-configured Sector "DNA" Prompts (Retail & Logistics) and a 2-minute "Aha!" Live Demo script to instantly prove value.
    *   **Objection Handling:** Street-smart responses to common trust and reliability concerns.

### 6. [WORKFLOW_TESTING_PLAN.md](./WORKFLOW_TESTING_PLAN.md)
**Purpose:** An overarching MVP testing strategy that categorizes core system workflows and maps them to specific execution scripts.
*   **Key Workflows & Features:**
    *   **Categorized Testing Goals:** Covers Core Messaging & AI, Commerce & Payments, Onboarding & Tenant Management, System Stability & Security, and Scheduled Tasks.
    *   **Test Script Mapping:** Links each workflow category to its respective automated testing script (e.g., `scripts/test-messaging-core.ts`, `scripts/test-price-guard.ts`).
    *   **Actionable Next Steps:** Provides a roadmap for executing baselines, creating missing scripts, and documenting results.

---

*For further context on the overarching vision driving these guides, refer to the [MASTER_STRATEGY_2026.md](../core/MASTER_STRATEGY_2026.md).*
