# PHASE 11: SOVEREIGN INFRASTRUCTURE (TENCENT CLOUD MIGRATION)
**Status:** DRAFT (Red Team & Execution Plan)
**Goal:** Migrate the Naija Agent Core from scattered SaaS/Local environments to a unified, production-grade architecture on Tencent Cloud to support long-running sovereign agents.

## 1. Architectural Blueprint
We are transitioning to a hybrid containerized setup to balance extreme scalability with deep, uninterrupted compute time.

| Component | Current Setup | Tencent Target | Reason |
| :--- | :--- | :--- | :--- |
| **API Gateway** (`apps/api`) | Local/Railway | **Tencent Cloud Run** | Handles massive, sudden bursts of WhatsApp webhooks. Scales to 0. |
| **Workers** (`apps/worker*`) | Local | **Tencent Lighthouse (VPS)** | Always-on environment. BullMQ requires persistent Redis connections. |
| **Hermes Body** (`hermes-agent`)| Local | **Tencent Lighthouse (VPS)** | Agents need 30+ minutes for browser automation and research loops. No timeouts. |
| **Message Queue** | Local Redis | **TencentDB for Redis** | Fully managed, highly available spine of the network. |
| **Media Storage** | Cloudinary / Firebase | **Tencent COS (Cloud Object Storage)** | Cheaper, Sovereign control, fully S3-compatible. |
| **Database** | Supabase Postgres | *Keep Supabase (for now)* | Avoid migrating too many stateful layers at once. Supabase Pooler handles connections perfectly. |

---

## 2. Red Team Risk Analysis & Mitigations

### 🔴 Risk 1: The Networking Split-Brain (VPC Constraints)
* **The Threat:** The API lives on serverless Cloud Run, but the Workers live on a Lighthouse VPS. Both MUST connect to the same TencentDB Redis instance securely. If Redis is exposed to the public internet without proper firewalling, we risk a devastating data breach.
* **The Mitigation:** Use **Tencent VPC (Virtual Private Cloud)** peering to bridge the Serverless API and the Lighthouse VPS securely. If peering is too complex for v1, expose Redis strictly over SSL/TLS with a complex 64-character password and whitelist *only* the IP addresses of the API and VPS.

### 🔴 Risk 2: Hermes Container Bloat (The Playwright Problem)
* **The Threat:** Autonomous research requires headless browsers (Playwright/Selenium). These binaries are massive (~1.5GB). Attempting to run this on Serverless will cause massive "Cold Start" penalties (WhatsApp messages will time out while the container boots).
* **The Mitigation:** This is exactly why Hermes *must* live on the Lighthouse VPS via Docker Compose. The container stays "warm" 24/7, pulling jobs from the queue instantly.

### 🔴 Risk 3: S3 Compatibility Quirks with COS
* **The Threat:** We plan to use the standard AWS SDK to communicate with Tencent COS (since it is S3 compatible). However, generating "Presigned URLs" or setting public read permissions sometimes requires slightly different configuration flags in Tencent.
* **The Mitigation:** Abstract the storage logic into a strict interface (`IStorageProvider`). We will write a dedicated `packages/core/storage/tencentStorage.ts` and thoroughly test binary uploads (Audio/Images) before switching traffic from Cloudinary.

---

## 4. Execution Steps (The "Migration Sprint")

### Step 1: Dockerization (The Foundation)
1. Create a `Dockerfile.api` (Optimized for Express/Node).
2. Create a `Dockerfile.worker` (Optimized for BullMQ/Node).
3. Create a `Dockerfile.hermes` (Python 3.11 + Playwright browsers).
4. Create a `docker-compose.yml` to orchestrate them locally for testing.

### Step 2: The Storage Pivot (✅ COMPLETED)
1. Found `cos-nodejs-sdk-v5` is actively installed and implemented in `tencent.ts`.
2. Updated `VaultDocumentSchema` in `@naija-agent/storage` to perfectly map `.myqcloud.com` URLs to the `tencent-cos` provider, preventing Zod validation drops.
3. System natively falls back: Tencent COS -> Alibaba OSS -> Cloudinary -> Firebase.

### Step 3: Infrastructure Provisioning
1. Spin up TencentDB for Redis.
2. Spin up the Tencent Lighthouse Ubuntu server.
3. Push Docker images to Tencent Container Registry (TCR).

### Step 4: The Cutover
1. Point the WhatsApp Webhook URL to the new Tencent Cloud Run API endpoint.
2. Monitor the logs.
