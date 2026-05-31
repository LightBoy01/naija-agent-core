# Final Hosting Infrastructure Review: Naija Agent Core (100k+ Users)

## Executive Summary
The goal is to host a multi-tenant AI ecosystem serving 100,000+ users on a minimal budget. While PaaS options (Vercel/Northflank/Supabase) offer high developer convenience, their usage-based pricing models become financially prohibitive at scale. The **Sovereign Strategy** prioritizes fixed-cost Bare Metal (VPS) to maximize profit margins and architectural control.

---

## 1. Approach Comparison Matrix

| Feature | Standard Cloud (PaaS) | All-in-One VPS | **Hybrid-Pro VPS (Recommended)** |
| :--- | :--- | :--- | :--- |
| **Stack** | Vercel, NF, Supabase | Single Large VPS | 2 VPS (DB + App) |
| **User Capacity** | ~10k (Cost limited) | 100k+ | **150k+ (Robust)** |
| **Estimated Cost** | $150 - $400+/mo | **$30/mo** | **$45/mo** |
| **Maintenance** | Lowest (Automatic) | High (Manual OS/DB) | **Medium (Managed by Coolify)** |
| **Reliability** | High (Multi-cloud) | Single Point of Failure | **High (Isolated Database)** |
| **Latency** | Medium (Network Tax) | Ultra-Low (Localhost) | **Low (Private Network)** |

---

## 2. The "Sovereign" Recommendation: Hybrid-Pro VPS
This strategy balances the low cost of a VPS with the reliability of high-end cloud providers.

### **Phase A: The Compute Layer (Hetzner/Contabo)**
*   **Server 1 (The Vault - $15/mo):** Dedicated to **PostgreSQL (pgvector)** and **Redis**. 
    *   *Rationale:* Your database is your lifeblood. Giving it its own RAM and CPU prevents application crashes from corrupting your data.
*   **Server 2 (The Brain - $30/mo):** Hosts the **Go WhatsApp Sidecar**, **API Gateway**, **Zynux/Aelixxr Workers**, and the **Hermes Agent**.
    *   *Rationale:* High-RAM instance (32GB+) to handle 100k concurrent WhatsApp sockets and the V8 memory heaps of multiple AI workers.

### **Phase B: The Management Layer (Coolify)**
*   Install **Coolify** (Open Source) on both servers.
*   *Benefit:* Provides a Vercel-like UI for your VPS. Handles SSL certificates, CI/CD (auto-deploy from GitHub), database backups, and health checks for free.

### **Phase C: The Data Scaling Strategy**
*   **Storage:** Move all Media (Images/Audio) to **Cloudflare R2**. Cost: $0 Egress fees.
*   **Multi-Tenancy:** Implement **SQLite-per-Tenant** for chat history logs. Use the main Postgres only for core user data and vector embeddings. This prevents your main DB from becoming sluggish.

---

## 3. Critical Warnings & Honesty Check
*   **The Vercel Trap:** 100k users on Vercel will eventually cost thousands of dollars in bandwidth and execution time. It is great for the Dashboard (Frontend), but keep the AI logic off it.
*   **Maintenance Reality:** You must become comfortable with basic Linux commands. Coolify makes it easy, but you are still "The Landlord."
*   **The "Fake Alert" Security:** At 100k users, fraud will be constant. The "All-in-One" or "Hybrid" setup allows you to run local security interceptors that are much faster than cloud-based middle-ware.

---

## 4. Immediate Next Steps (Migration Path)
1.  **Procure VPS:** Start with one 16GB RAM instance to test the "All-in-One" setup.
2.  **Install Coolify:** `curl -fsSL https://get.coolify.io | bash`
3.  **Deploy Sidecar:** Upload the Go binary and verify it can handle 10-20 test sessions.
4.  **Database Migration:** Use Drizzle to push your current schema to the new Postgres instance.
5.  **Environment Sync:** Move secrets from local `.env` to Coolify's Environment Manager.

---

## 4. Phase D: The Iron Shield (Security & Red Teaming)
To protect a 100k-user VPS environment, we implement a "Defense in Depth" strategy based on first principles.

### **D1: Least Privilege (The Docker Proxy)**
*   **The Risk:** A compromised Node.js worker using the Docker socket to take over the host OS.
*   **The Mandate:** Mount a limited Docker Socket Proxy (e.g., `tecnativa/docker-socket-proxy`) instead of the raw socket. Configure it to allow ONLY `POST /containers/create` and `POST /containers/start`.

### **D2: Data Isolation (The Hermes Sandbox)**
*   **The Risk:** Hermes leaking the `DATABASE_URL` via prompt injection while browsing the web.
*   **The Mandate:** Hermes containers must NEVER have access to database credentials or internal network IPs.
*   **The Flow:** Hermes writes output to an ephemeral shared volume (`/app/tmp/results/`). The main Worker (Zynux/Aelixxr) reads this volume and performs the DB update.

### **D3: Economic Defense (Pre-paid Energy)**
*   **The Risk:** A "Wallet Drain" attack where a user triggers thousands of compute-heavy Hermes runs.
*   **The Mandate:** Validate `vaultBalance` or `energyCredits` at the API Gateway *before* dispatching to the Worker. Enforce strict rate-limiting for non-authenticated users.

### **D4: Self-Healing & Resilience**
*   **The Mandate:** Every service in the unified engine must have a Docker Healthcheck and a `restart: always` policy. Go binaries must implement top-level panic recovery to prevent multi-tenant crashes.

---

## 5. The Future Frontier: Wasm & Firecracker
As the Empire scales beyond 100k users, we will evaluate transitioning the Hermes "On-Demand" worker from Docker to **WebAssembly (Wasm)** or **Firecracker MicroVMs** for sub-millisecond startup and 10x lower RAM overhead.

---
**Verdict:** Don't let PaaS providers tax your growth. Build the "Sovereign" way—own your iron, control your costs, and scale to the Empire.
