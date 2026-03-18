# Project Improvement Plan: Security & Scalability Hardening (Phase 8.1)

**Date:** March 18, 2026
**Status:** Draft / Ready for Review
**Objective:** Address critical security leaks and architectural bottlenecks identified during the "Iron Shield" audit to ensure the platform is ready for global scaling.

---

## 🚨 Phase 1: Critical Security Fixes (Immediate Priority)

**Goal:** Eliminate credential leakage in production logs.

### 1.1. Redact Sensitive Headers in API Logging
- **Severity:** Critical
- **Location:** `apps/api/src/index.ts`
- **Issue:** The global `onRequest` hook logs all headers, including `x-api-key`, `x-bridge-secret`, and `x-cron-secret`.
- **Action:** Implement a redaction utility in the logging hook.
- **Implementation Plan:**
  ```typescript
  // apps/api/src/index.ts
  fastify.addHook('onRequest', async (request, reply) => {
    const safeHeaders = { ...request.headers };
    ['x-api-key', 'x-bridge-secret', 'x-cron-secret', 'authorization'].forEach(k => {
      if (safeHeaders[k]) safeHeaders[k] = '***REDACTED***';
    });
    console.log(`\n🔵 [INCOMING] ${request.method} ${request.url}`);
    console.log(`   Headers:`, JSON.stringify(safeHeaders, null, 2));
  });
  ```

---

## ⚡ Phase 2: Architectural Resilience (High Priority)

**Goal:** Prevent webhook timeouts and ensure 100% reliable SMS processing.

### 2.1. Asynchronous SMS Bridge Processing
- **Severity:** High
- **Location:** `apps/api/src/index.ts` -> `apps/worker/src`
- **Issue:** The API currently performs synchronous regex parsing and *blocking* LLM calls (Gemini) within the webhook handler. This risks timeouts (>3s) during high traffic or slow LLM response times.
- **Action:** Decouple ingestion from processing.
- **Implementation Plan:**
  1.  **API (`apps/api`):** 
      - Receive SMS webhook.
      - Validate basic schema.
      - Push a `process-sms` job to the `whatsapp-queue`.
      - Return `200 OK` immediately.
  2.  **Worker (`apps/worker`):**
      - Create a new handler: `handleSmsBridge(job)`.
      - Move the "Regex vs. LLM" logic here.
      - Move the "Refill vs. Sale" matching logic here.
      - This allows Gemini to take 10+ seconds without killing the webhook connection.

---

## 🛠️ Phase 3: "Sovereign Automation" Logic Repair (Medium Priority)

**Goal:** Ensure the "Auto-Ignition" onboarding flow works without permission errors.

### 3.1. Fix WABA Permission Scope in Onboarding
- **Severity:** Medium
- **Location:** `apps/worker/src/handlers/onboarding.ts`
- **Issue:** The code uses `tenantWhatsAppService` to call `addPhoneNumber`. If a tenant has a limited token (or no token yet), this call will fail because adding a number to a WABA requires the Master/Sovereign Admin Token with `business_management` permissions.
- **Action:** Explicitly use the Master Service for infrastructure actions.
- **Implementation Plan:**
  - Instantiate a dedicated `sovereignService` using `process.env.WHATSAPP_API_TOKEN` inside the onboarding handler.
  - Use this service *only* for `addPhoneNumber` and `subscribeWaba`.
  - Continue using `tenantWhatsAppService` for messaging the user.

---

## 🧹 Phase 4: Operational Polish (Low Priority)

**Goal:** Improve maintainability and visibility.

### 4.1. Standardized Logging
- **Action:** Replace `console.log` with the structured `pino` logger instance across all modules to ensure consistent JSON formatting in production logs (Railway/Docker).

### 4.2. LLM Parsing Alerts
- **Action:** If the SMS Bridge falls back to Gemini and *still* fails (or returns "NULL"), trigger a specific "Parsing Failure" alert to the Master Bot so the regex patterns can be updated manually.

---

## 📋 Execution Roadmap

| Phase | Task | Est. Time | Assignee |
| :--- | :--- | :--- | :--- |
| **1** | **Redact API Logs** | 10 mins | `Naija-Agent` |
| **2** | **Refactor SMS Bridge (Async)** | 45 mins | `Naija-Agent` |
| **3** | **Fix Onboarding Permissions** | 20 mins | `Naija-Agent` |
| **4** | **Cleanup & Alerts** | 30 mins | `Naija-Agent` |

**Ready to proceed?** Say "Approve" to start with Phase 1.
