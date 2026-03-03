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

- [x] **API Service (Webhook Receiver)**
    - [x] Setup Fastify Server
    - [x] Implement Signature Verification
    - [x] Implement Firestore Tenant Lookup
    - [x] Push Job to BullMQ

- [x] **Worker Service (The "Slow Lane")**
    - [x] Connect to Redis Queue
    - [x] Implement Firestore Persistence
    - [x] Implement Native Audio Handling (Buffer -> Gemini)
    - [x] Verified Build Success (100%)

## Phase 2: Intelligence (The "Brain")

- [ ] **AI Logic Integration**
    - [ ] Add `GEMINI_API_KEY` to `.env`
    - [ ] Test Text Processing (Pidgin awareness)
    - [ ] Test Audio Processing (Native Multimodal)

- [ ] **WhatsApp Connectivity**
    - [ ] Add `WHATSAPP_API_TOKEN` to `.env`
    - [ ] Add `WHATSAPP_PHONE_ID` to `.env`
    - [ ] Implement outbound message sending (Meta Graph API)

## Phase 3: Finance & Ops (The "Bank")

- [x] **Credit System Design**
    - [x] AI Credits Model (Prepaid)
    - [x] Debit Logic in Worker (Transactions)
- [ ] **Alerts & Safety**
    - [ ] Implement "Low Balance" WhatsApp Alerts
    - [ ] Implement #STOP / #START Safety Commands

## Phase 4: Features (High Value)

- [ ] **Fake Alert Buster**
    - [ ] Implement Gemini Vision for receipt extraction
    - [ ] Integrate Monnify/Paystack for transaction verification
- [ ] **Rider Tracking**
    - [ ] Implement "Group Chat Spy" for GPS coordinates

## Phase 5: Deployment & Scale

- [ ] **Production Readiness**
    - [ ] Dockerize API & Worker
    - [ ] Deploy to Railway (Staging)
    - [ ] Setup Structured Logging (Pino)
