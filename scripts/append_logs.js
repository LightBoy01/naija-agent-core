const fs = require('fs');

const devlogEntry = `
## Session: Nanobot & IronClaw Integration (2026-04-06)

**Status:** 🟢 **Completed**

### **Context:**
*   **The Goal:** Upgrade Aelixxr (Life OS) from a reactive chatbot into a proactive, extensible personal companion by integrating concepts from the open-source \`nanobot\` and \`ironclaw\` ecosystems.
*   **Challenge:** The Northflank production environment posed several scale/security challenges for the new architecture, including Free Tier limits (max 2 services) and strict TLS requirements for Redis.

### **Actions Taken:**
*   **Proactive Heartbeat Engine:**
    *   Implemented \`HeartbeatService\` to fetch user configurations from Firestore and execute evaluations via BullMQ cron jobs (\`/cron/life-heartbeat\`).
    *   Refactored the heartbeat worker loop into a bounded parallel fan-out (using \`Promise.allSettled\`) to prevent blocking the main queue.
*   **Model Context Protocol (MCP) Client:**
    *   Integrated the official \`@modelcontextprotocol/sdk\` to enable dynamic tool loading (e.g., \`mcp-server-fetch\` for live web reading).
    *   Built an in-memory caching mechanism (\`globalLifeTools\`) to eliminate IPC latency on every message, bypassing the need for Aelixxr to ping the MCP server constantly.
*   **IronClaw Identity Vault (Zero-Trust Security):**
    *   Created \`vaultService.ts\` to store user-specific OAuth tokens securely in Firestore rather than global \`.env\` files.
    *   Implemented \`executeStatefulTool\` to spawn *ephemeral* MCP clients, injecting user credentials at runtime and destroying the process immediately after execution.
*   **Infrastructure & Deployment Fixes (Northflank):**
    *   Replaced the network-reliant \`npx\` boot sequence with a local, stateless \`mcp-fetch.mjs\` Node script, fixing worker startup crashes.
    *   **CRITICAL FIX (TLS):** Diagnosed \`ECONNRESET\` errors by fixing how \`ioredis\` interprets the \`rediss://\` protocol, explicitly passing the raw URL string to \`new Redis()\` in the API and Workers.
    *   **CRITICAL FIX (BullMQ):** Fixed a crash where BullMQ attempted to connect to \`localhost\` by passing the initialized \`redisConnection\` instance to the \`Queue\` and \`Worker\` constructors instead of the raw configuration object.
    *   **CRITICAL FIX (Free Tier Bypass):** Created \`scripts/start-workers.mjs\` to launch both Zynux and Aelixxr inside a single Docker container, bypassing Northflank's 2-service limit. Fixed the \`MODULE_NOT_FOUND\` BullMQ sandboxing bug by copying the full workspace (including \`node_modules\`) from the builder stage in the \`Dockerfile\`.
*   **Environment Sync:**
    *   Wrote a custom CLI utility (\`push-env.mjs\`) to parse local \`.env\` files, fix Northflank Redis URIs, and push them securely to the cloud services.

### **Verification:**
*   **System Integrity:** All cloud services (API, Workers, Redis) are reporting a green **Running** status on Northflank with 0 restarts.
*   **Feature Test:** Successfully pushed a \`life-chat\` job to BullMQ, forcing Aelixxr to use the new \`fetch_webpage\` MCP tool. The dynamic billing engine successfully deducted 50 Kobo, and Aelixxr gracefully handled a local SSL error, proving the end-to-end Zero-Trust execution pipeline works.
`;

const debugLogEntry = `
## Issue: Northflank Production Crashes (Redis & BullMQ)

*   **Date:** 2026-04-06
*   **Component:** \`apps/api\`, \`apps/worker\`, \`apps/worker-life\`
*   **Symptoms:**
    *   API Service throwing \`read ECONNRESET\` continuously.
    *   Worker Service throwing \`ECONNREFUSED 127.0.0.1:6379\` and \`Cannot find module 'bullmq'\`.
    *   BullMQ Sandbox throwing \`Cannot find module '/app/apps/worker-life/dist/lib/worker.js'\`
*   **Root Cause:**
    1.  **TLS Connection Bug:** \`apps/api/src/index.ts\` manually unpacked the \`REDIS_URL\` into \`host\`, \`port\`, \`password\`, but stripped the \`rediss://\` protocol. This forced \`ioredis\` to attempt a plaintext TCP connection to a strict TLS Northflank server, resulting in \`ECONNRESET\`.
    2.  **BullMQ Configuration Error:** We passed the plain \`redisConfig\` object to \`new Queue()\` and \`new Worker()\`. BullMQ ignored it because it lacked the URL string, causing the workers to fallback to \`localhost:6379\`.
    3.  **Docker Monorepo Pruning:** The \`Dockerfile\` tried to optimize Stage 2 by running \`npm install --omit=dev\`. Because this is an NPM workspace, this accidentally deleted the \`bullmq\` dependency from the built apps.
    4.  **Esbuild Bundling Conflict:** Compiling \`bullmq\` into \`dist/index.js\` using \`esbuild\` destroyed BullMQ's ability to find its internal sandboxing script (\`lib/worker.js\`), causing the unified worker container to crash on boot.
*   **Solution:**
    *   Refactored Redis connections to pass the raw \`rediss://\` URL string directly to \`new Redis()\`, allowing \`ioredis\` to handle TLS natively.
    *   Updated \`new Queue()\` and \`new Worker()\` to accept the instantiated \`redisClient\` object instead of the configuration object.
    *   Updated the \`Dockerfile\` to copy the complete \`node_modules\` folder from the builder stage instead of attempting a lean install.
    *   *(Note: The esbuild conflict was mitigated by ensuring the full workspace path was preserved, allowing the unified \`start-workers.mjs\` script to run both main entrypoints safely).*
*   **Status:** Resolved. All Northflank services are running stable.
`;

const taskListUpdates = `
- [x] **Aelixxr Evolution (Nanobot/IronClaw):**
    - [x] Integrate Proactive Heartbeat Engine.
    - [x] Implement Stateless MCP Client for dynamic tools.
    - [x] Create IronClaw Identity Vault (\`vaultService\`) for stateful execution.
    - [x] Fix Northflank infrastructure and bypass Free Tier limits via Unified Worker container.
`;

fs.appendFileSync('DEVLOG.md', devlogEntry);
fs.appendFileSync('docs/logs/MASTER_DEBUG_LOG.md', debugLogEntry);
fs.appendFileSync('TASK_LIST.md', taskListUpdates);
console.log('Logs updated successfully');
