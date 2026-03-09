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
    - [x] Implement WhatsApp-based MFA (Bot sends 6-digit code to Boss).
    - [ ] Secure Session Rotation (Short-lived tokens).
- [x] **Sovereign Empire Hardening (Phase 4n)**
    - [x] **Security:** Implement Salted PIN Hashing (Bcrypt) in Firestore.
    - [x] **Multi-App Support:** Implement Dynamic Signature Verification (lookup secret by phoneId).
    - [x] **Financial Integrity:** Implement "Credit Reservation" logic to prevent race conditions.
    - [x] **Idempotency:** Multi-tenant scoped message deduplication.
    - [ ] **Audit Shadow Alerts:** AI pings Boss on high-value transaction detection.
- [ ] **The "Fake Alert" Finale**
    - [x] Implement Gemini Vision for receipt extraction.
    - [x] **Anti-Fraud Protocol:** Enhanced vision prompt for Photoshop detection.
    - [x] **Sector Unlock:** Generic activities to support all business types.
    - [ ] Integrate Monnify/Paystack for real-time bank verification.
- [ ] **SMS Relay Prototype**
    - [x] **Bridge API:** /bridge/sms endpoint for external bank alert syncing.
    - [x] **Android Bridge:** Python script blueprint for Termux SMS relay.
    - [ ] Build native Android "Bridge" app.

## Phase 5: Scale 🟡

- [x] **The "Boss" Dashboard (Web)**
    - [x] Next.js Portal for viewing archived receipts and live chats.
    - [x] **Chat Details View:** Real-time conversation auditing.
    - [x] **Tenant Management:** Manual top-ups and status toggling.
    - [ ] Real-time "Takeover" mode for high-stakes conversations.
- [ ] **Infrastructure Optimization**
    - [ ] Setup Structured Logging (Pino)
    - [ ] Monitoring (Sentry/Logtail)

## Phase 6: Network Intelligence (Future Suggestions) 🔵

- [ ] **Global Policy Synchronization & Hardening:**
    - [ ] **Multi-Factor Approval (MFA):** Require a WhatsApp-based 6-digit code for any network-wide policy change.
    - [ ] **Logical Hierarchy:** Program the AI to prioritize "Local Business Facts" over "Global Policies" to prevent context conflicts.
    - [ ] **Token Guard:** Implement strict character limits for global instructions to prevent network-wide cost explosions.
- [ ] **Policy Auditing & Versioning:**
    - [ ] **Immutable History:** Store all global policy changes in a `policy_history` collection for legal/audit trails.
    - [ ] **Message Snapshots:** Link every message to a `policyVersion` ID to reconstruct past bot behavior during disputes.
- [ ] **Shared Context Caching:** Utilize Gemini context caching for a "Base Brain" shared by all bots to reduce token latency and cost.
- [ ] **Sovereign Broadcast Tool:** Enable the Master Bot to "push" specific business instructions to all tenants via a single WhatsApp command.
