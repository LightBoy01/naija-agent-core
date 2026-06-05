# Vynux Core: Red Team Audit & Migration Plan
*Date: June 2026*
*Target: Twin Engine Architecture (Aelixxr LOS & Zynux BOS)*

## 1. Executive Summary
The transition to the "Twin Engine" (Hybrid Hub) architecture has successfully isolated the Life OS (Aelixxr) from the Business OS (Zynux), safeguarding the revenue engine. However, the system currently operates in a "Split Brain" state regarding data persistence, relying on both Firebase and PostgreSQL. 

## 2. Red Team Vulnerability Assessment

### ⚠️ Vulnerability 1: The Firebase/Postgres "Split Brain"
* **Risk Level:** High
* **Observation:** The core worker logic (`apps/worker`) and Web Dashboard currently split reads/writes between Firebase (Configs, Products, Organizations) and PostgreSQL (Ledger, Chats, Memories). 
* **Exploit/Failure Mode:** Data desynchronization. If the Web Dashboard writes a new tenant to Postgres, but the Worker reads configs from Firebase, the new tenant will silently fail to initialize. This also prevents atomic rollbacks (e.g., if a payment succeeds in Postgres but the order fails to save in Firebase).
* **Mitigation:** Execute "The Great Firebase Purge" (Phase 11). Move all `organizations`, `products`, and `activities` exclusively to Drizzle ORM / Postgres.

### ⚠️ Vulnerability 2: The Sidecar Hydration Bottleneck
* **Risk Level:** Medium
* **Observation:** The `whatsapp-sidecar` relies on a Redis `sidecar_map` to route incoming WhatsApp messages to either Zynux or Aelixxr. Currently, this map is only populated when the Node.js server starts up (`hydrateSidecar()`).
* **Exploit/Failure Mode:** When you acquire a new client and register their bot, they will not be able to use it until you manually redeploy/restart the server on Coolify.
* **Mitigation:** Implement a Redis Pub/Sub event or an internal API webhook. When a new org is created in the database, it should instantly push the `JID -> OrgID` mapping into Redis dynamically.

### ⚠️ Vulnerability 3: Admin Command Session Hijacking
* **Risk Level:** Medium
* **Observation:** The `OrgLoadInterceptor` safely normalizes and matches the `adminPhone` to grant `isAdmin` privileges. However, physical access to the Boss's unlocked phone grants absolute control over the Sovereign Network.
* **Exploit/Failure Mode:** Unauthorized triggering of `broadcast_to_bosses` or `get_network_stats`.
* **Mitigation:** Implement the planned **MFA Interceptor**. High-stakes tools should require a 4-digit `adminPin` challenge, opening a temporary 15-minute `lastAdminAuthAt` window in Postgres before executing.

---

## 3. Action Plan: The Final Postgres Migration
To resolve Vulnerability 1 and achieve true Sovereign status, we must execute the following exact steps. 

### Step 1: Expand Postgres Schema
1. Open `@naija-agent/database/src/schema.ts`.
2. Ensure `organizations` has the `config` JSONB column (Already verified).
3. Add `products` table (or rely on flexible JSON `entityDef` as outlined in `MASTER_STRATEGY_2026.md`).
4. Add `activities` table for Waybills/Bookings.

### Step 2: The Migration Script
1. Write a `migrate-firebase-to-pg.ts` script.
2. Read all `organizations`, `knowledge`, and `products` from Firebase.
3. Batch insert them into the PostgreSQL database.

### Step 3: Refactor the Monorepo (The Purge)
1. Delete `@naija-agent/firebase` imports from `apps/worker`.
2. Replace tools like `saveProduct` and `getOrgById` with their Drizzle ORM equivalents from `@naija-agent/database`.
3. Update the Next.js `apps/web` server actions to query Postgres.

### Step 4: Network Verification
1. Run local tests utilizing the `Zynux` and `Aelixxr` test queues.
2. Verify that `hydrateSidecar()` pulls exclusively from Postgres.
