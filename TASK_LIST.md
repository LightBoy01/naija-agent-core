# Task List

## Phase 1: Foundation (The "Fast Lane")

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

## Phase 2: Intelligence (The "Brain")

- [x] **WABA Ignition**
    - [x] Register WhatsApp Test Number (Success)
    - [x] Add Recipient Allowlist
- [x] **AI Integration**
    - [x] Update ConfigSchema for `gemini-2.5-flash`
    - [x] Perform First Production AI Reply (Success)
    - [x] Verify Native Audio Multimodal Support in Cloud (Verified)

## Phase 3: Finance & Ops (The "Bank")

- [x] **Credit System Design**
    - [x] AI Credits Model (Prepaid)
    - [x] Debit Logic in Worker (Transactions)
    - [x] **Low Balance Alerts** (Implementation + Redis Cooldown)
    - [x] **Balance Context Injection** (Gemini is balance-aware)

## Phase 4: Features (The Moat)

- [ ] **Fake Alert Buster**
    - [x] Implement Gemini Vision for receipt extraction
    - [ ] Integrate Monnify/Paystack for transaction verification
- [ ] **Safety & Compliance (Essential)**
    - [ ] Implement `#STOP` and `#START` commands (User Opt-out)
    - [ ] Rate limit strictness for Image/Audio spam
- [ ] **Outbound Engine**
    - [x] Implement `POST /send` endpoint (Success)
    - [ ] Automated follow-ups for abandoned carts
- [ ] **Rider Tracking**
    - [ ] Implement "Group Chat Spy" for GPS coordinates


## Phase 5: Scale

- [ ] **Infrastructure Optimization**
    - [ ] Setup sidecar process for Worker in Railway
    - [ ] Setup Structured Logging (Pino)
    - [ ] Monitoring (Sentry/Logtail)
