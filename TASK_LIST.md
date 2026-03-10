# Task List

## Phase 1: Foundation (The "Fast Lane") ✅

- [x] **Project Setup**
    - [x] Initialize Monorepo (NPM Workspaces)
    - [x] Create Package Structure (`apps/api`, `apps/worker`, `packages/*`)
    - [x] Install Core Dependencies

- [x] **Database (Firebase Pivot)**
    - [x] Create Firebase Project (`naija-agent-core`)
    - [x] Implement `@naija-agent/firebase` package
    - [x] Implement Atomic Balance Deduction (Transactions)
    - [x] Implement Chat History (Sub-collections)
    - [x] Seed First Organization

- [x] **API Service (Production)**
    - [x] Setup Fastify Server
    - [x] Implement Signature Verification
    - [x] Dockerize for Cloud Deployment
    - [x] **Deploy to Railway.app** (Success - Version 1.0.2 verified)

- [x] **Worker Service (The "Slow Lane")**
    - [x] Connect to Production Redis (Railway)
    - [x] Implement Hybrid Auth (File + ENV)
    - [x] Implement Native Audio Handling (Buffer -> Gemini)
    - [x] Fix ESM Module Imports (.js extensions)

## Phase 2: Intelligence (The "Brain") ✅

- [x] **AI Integration**
    - [x] Update ConfigSchema for `gemini-2.5-flash`
    - [x] Perform First Production AI Reply (Success)
    - [x] Verify Native Audio Multimodal Support in Cloud (Verified)
    - [x] **Anti-Spam & Quota Guard:** Implement stable messaging for Gemini 429 errors.

## Phase 3: Finance & Ops (The "Bank") ✅

- [x] **Credit System Design**
    - [x] AI Credits Model (Prepaid)
    - [x] Debit Logic in Worker (Transactions)
    - [x] **Low Balance Alerts** (Implementation + Redis Cooldown)
    - [x] **Balance Context Injection** (Gemini is balance-aware)

## Phase 4: The Sovereign Empire (In Progress) 🟡

- [x] **Multi-Tenancy (Phase 4d)**
    - [x] Multi-Tenant Key Isolation (Firestore Vaults)
    - [x] Dynamic AI/Payment Provider instantiation per request.
- [x] **Media Persistence (Phase 4f)**
    - [x] **Persistent Media Pipeline:** Upload all WhatsApp media to Firebase Storage.
    - [x] Link permanent URLs to Chat History metadata.
    - [x] **Free Tier Pivot:** Implement "WhatsApp-Only" temporary link retrieval to bypass Firebase Storage Blaze requirement.
        - [x] **Secure Media Proxy:** Build backend API to fetch Meta URLs without token exposure.
        - [x] **Audit Cliff Guard:** Add "Save Forever" manual archive for high-value receipts.
        - [x] **Redis Caching:** Cache temporary URLs to prevent rate-limiting and UI lag.
- [x] **Boss Mode (Phase 4g/i)**
    - [x] **Iron-Clad Security:** Admin PIN Handshake (2-hour sessions).
    - [x] **Zero-Dashboard Training:** Boss trains AI via WhatsApp conversation.
    - [x] **Sector Flexibility:** Implement `manage_activity` for Logistics/Appointments.
- [x] **The Grand Commander (Phase 4j)**
    - [x] **Master Bot Identity:** COO bot for Sovereign management.
    - [x] **Automated Onboarding:** `create_tenant` tool for instant client setup.
    - [x] **Network Stats:** Real-time reporting for the Sovereign.
- [x] **Sovereign Auth Hardening (Phase 4m)**
    - [x] Implement WhatsApp-based MFA (Universal for all Bosses).
    - [x] **Multi-Tenant Login:** Phone-based lookup for organization owners.
    - [x] **Rate Limiting:** Redis-based protection for the login endpoint.
- [x] **Sovereign Empire Hardening (Phase 4n)**
    - [x] **Security:** Implement Salted PIN Hashing (Bcrypt) in Firestore.
    - [x] **Multi-App Support:** Implement Dynamic Signature Verification (lookup secret by phoneId).
    - [x] **Financial Integrity:** Implement "Credit Reservation" logic to prevent race conditions.
    - [x] **Idempotency:** Multi-tenant scoped message deduplication.
    - [x] **Proactive Manager Mode:** Start/Stop command, Sales Aggregation, and Reporting tools.
- [x] **Universal DNA Hardening (Phase 4o)**
    - [x] **Retail:** Structured Product Catalog + Search Tool.
    - [x] **Logistics:** Lifecycle Status tracking (`PICKED_UP`, `DELIVERED`).
    - [x] **Appointments:** Atomic Double-Booking Guard (Firestore Transactions).
- [ ] **The "Fake Alert" Finale**
    - [x] Implement Gemini Vision for receipt extraction.
    - [x] **Anti-Fraud Protocol:** Enhanced vision prompt for Photoshop detection.
    - [x] **Sector Unlock:** Generic activities to support all business types.
    - [ ] Integrate Monnify/Paystack for real-time bank verification.
- [ ] **SMS Relay Prototype**
    - [x] **Bridge API:** /bridge/sms endpoint for external bank alert syncing.
    - [x] **Android Bridge:** Python script blueprint for Termux SMS relay.
    - [ ] Build native Android "Bridge" app.

## Phase 5: Hardened Scale & Proactivity 🟡

- [ ] **The "Proactive Pulse" (Infra Hardening)**
    - [ ] **BullMQ Scheduler:** Move `daily-reports` from API to Worker as repeatable jobs.
    - [ ] **Melt-Down Protection:** Implement "Staggered Jitter" (randomized send windows) to prevent Gemini 429 and Meta API rate-limiting.
    - [ ] **Persistence Guard:** Add a "Scheduler Health" check to re-queue jobs if Redis is flushed.

- [ ] **The "Smart Matching" Engine (Logic Hardening)**
    - [ ] **Source Lockdown:** Restrict `extractAmountFromSMS` logic strictly to the authenticated `/bridge/sms` endpoint.
    - [ ] **Regex + LLM Hybrid:** Implement a "Cheap" Gemini 2.5 Flash fallback for ambiguous bank SMS templates (GTB, Zenith, Access, Kuda).
    - [ ] **Duplicate Alert Detection:** Use a 24-hour Redis sliding window to prevent re-processing identical bank alerts.

- [x] **The "Visual Ledger" (UI Hardening) ✅**
    - [x] **Calendar View UI:** Build the grid/list view for the Appointment sector in the dashboard.
    - [x] **Timezone Sync:** Ensure all booking timestamps are normalized to `Africa/Lagos` (GMT+1) regardless of server location.
    - [x] **Real-time "Pings":** Implement simple polling or WebSockets to update the UI when the AI books a slot.

- [x] **Phase 5.5: The "Guardian" (Reliability Hardening) ✅**
    - [x] **Health Watcher:** Implement Worker job to check Redis heartbeats.
    - [x] **Anti-Panic Filter:** Implement 15-minute grace period and 24h "Alert Cooldown" to prevent Boss spam.
    - [x] **Master Bot Escalation:** Program Master Bot to handle the "Offline" notification.

- [x] **Phase 5.6: The "Nudge" (Proactive Value) ✅**
    - [x] **Hourly Scanner:** Implement Worker job to scan for upcoming (T-2h) appointments.
    - [x] **Idempotency Guard:** Use `reminderSentAt` Firestore flag to prevent duplicate WhatsApps.
    - [x] **Timezone-Safe Logic:** Normalize all scans to `Africa/Lagos` time.

- [x] **Phase 5.7: The "Live" Ledger (UI Hardening) ✅**
    - [x] **SWR Integration:** Add `swr` to the Appointment Ledger for smart, focus-aware polling.
    - [x] **Optimistic States:** (Future) UI shows "Sent" immediately when the AI acts.

- [x] **Phase 5.8: The "Fortress" (Security & Auto-Onboarding) ✅**
    - [x] **Scoped Bridge Keys:** Implement `bridgeSecret` per organization in Firestore.
    - [x] **Auth Lockdown:** Update `/bridge/sms` and `/bridge/heartbeat` to verify tenant-specific secrets.
    - [x] **Auto-Pulse:** Update `create_tenant` tool to automatically schedule all BullMQ proactive jobs.

- [x] **Phase 5.9: The "Pulse" (Visibility & Control) ✅**
    - [x] **Status Indicator:** Add a Green/Red "Bridge Pulse" to the Dashboard header.
    - [x] **Actionable Ledger:** Implement the `/api/bookings/cancel` route and link it to the UI.
    - [x] **WhatsApp Feedback:** Automatically notify the customer when a Boss cancels a booking via the UI.

- [x] **Phase 5.10: The Timezone Shield (Precision) ✅**
    - [x] **Lagos Normalization:** Implement `date-fns-tz` for all proactive scans.
    - [x] **Audit Logs:** Log every proactive "Nudge" and "Report" in a dedicated `system_logs` collection.

- [x] **Phase 5.12: The Audit Trail (Accountability) ✅**
    - [x] **System Logs:** Implement `logSystemEvent` for all proactive actions.
    - [x] **Forensic Metadata:** Track IDs and performers for every automated move.

- [x] **Phase 5.13: Scoped Bridge Guide (Merchant-Ready) ✅**
    - [x] **Interactive Bridge:** Refactor `sms_bridge.py` to prompt for config and save locally.
    - [x] **Setup Script:** Create `setup.sh` for one-click Termux installation.
    - [x] **Setup Guide UI:** Update Dashboard with the new "Copy-Paste" installation command.

- [x] **Phase 5.14: Toast Notifications (UI Modernization) ✅**
    - [x] **Sonner Integration:** Install and configure `sonner` in the web app.
    - [x] **Modern Feedback:** Replace all `alert()` and `confirm()` calls with professional toasts and modals.


## Phase 6: Imperial Scale (The "Final Mile") ✅

### Sprint A: The "Self-Scaling" Engine (Vital)
*Goal: Remove the Sovereign as the manual bottleneck.*
- [x] **Auto-Refill Loop:**
    - [x] **Link Generator:** Create utility to generate Paystack Checkout links with `orgId` metadata.
    - [x] **Low-Balance Nudge:** Update Worker to include the refill link when balance hits < ₦500.
    - [x] **Webhook Credit:** Harden API to atomically credit accounts upon `charge.success` webhook.
- [x] **The "Boss Handshake":**
    - [x] **Guided Onboarding:** Create a WhatsApp-based `#setup` flow for new merchants (PIN, Name, Tone).
    - [x] **Instant Training:** Implement tool for Boss to upload a "Price List" photo for instant knowledge extraction.
- [x] **Deterministic Price Guard:**
    - [x] **Safety Middleware:** Check all AI-generated prices against the `products` collection before sending to WhatsApp.

### Sprint B: Empire Governance (Control)
*Goal: Manage 1,000 bots from a single Master Chat.*
- [x] **Sovereign Decree:** Master Bot tool to broadcast messages/safety policies to all Bosses.
- [x] **Global Fraud Registry:** Shared blacklist of "Fake Receipt" phone numbers across the entire network.
- [x] **The Master Audit:** Master Bot tool to fetch logs and health stats for any tenant on demand.

### Sprint C: Merchant Growth (Sales Multiplier)
*Goal: Make the bots close more deals.*
- [x] **The "Closer" Tool:** Tool to generate structured Order Summaries + Bank Details for customers.
- [x] **Viral Growth Loop:** Contextual `#Apprentice` referral nudges in every customer interaction.
- [x] **Staff Dispatcher:** Role-aware internal routing (Assign order to Rider, Bot notifies Rider).

## Phase 7: VIP & Infrastructure Upgrades (Planned - Paused for MVP Launch)
- [ ] **Native Android Bridge:** Official APK to replace Termux script.
- [ ] **Visual Dashboard:** Enhanced Calendar and Inventory UI.
- [ ] **Real-time Bank Verification:** Monnify/Paystack official API expansion.
- [ ] **Automated Reminders:** BullMQ-based periodic business nudges.
- [ ] **Onboarding v2.0:** Remote OTP Relay system. (Logic built, need automated UI).
