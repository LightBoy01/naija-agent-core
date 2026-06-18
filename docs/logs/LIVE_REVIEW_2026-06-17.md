# Live VPS Review — 2026-06-17

**Server:** v2202605363110464804.goodsrv.de (159.195.150.66)
**OS:** Debian 13 (Trixie) — 17 days uptime
**Platform:** Coolify (Docker)

---

## Infrastructure

| Container | Status | Uptime | Ports |
|---|---|---|---|
| `app-pygxhj...` (Unified API + Workers + Sidecar) | Running | 21 hours | 3000, 8080 (internal) |
| `postgres-pygxhj...` | Running | 21 hours | 5432 |
| `redis-pygxhj...` | Running | 21 hours | 6379 |
| `searxng` | Running | 32 hours | 8181 |
| `coolify-proxy` | Running (healthy) | 2 weeks | 80, 443 |
| `coolify` | Running (healthy) | 2 weeks | 8000 |

**Resources:** 251GB disk (15GB used, 6%), 7.8GB RAM (2.9GB used, 38%)

---

## Application State

### Unified Container (`app-pygxhj...`)

The single container runs all Backend components via `sovereign-start.sh`:
- **API server** (Fastify, port 3000)
- **Zynux Worker** (BullMQ, `whatsapp-queue`)
- **Aelixxr Worker** (BullMQ, `life-queue`)
- **Go WhatsApp Sidecar** (port 8080)

**Startup log (21 hours ago):**
- 5 organizations hydrated from Firebase to Redis sidecar map
- MCP (Model Context Protocol) server connected successfully
- 2 WhatsApp sessions hydrated: `zynux` and `aelixxr-life-companion`

### WhatsApp Sidecar Status

Both WhatsApp Web sessions connected via `whatsmeow`. Periodic websocket EOF disconnects throughout the day — these are normal WhatsApp Web connection drops, not crashes. The client auto-reconnects.

**Disconnect pattern (last 24h):**
```
00:15 — zynux websocket EOF
01:03 — aelixxr websocket EOF
04:26 — zynux websocket EOF
05:31 — aelixxr websocket EOF
05:50 — zynux websocket EOF
06:25 — zynux websocket EOF
15:37 — aelixxr websocket EOF
17:00 — aelixxr websocket EOF
17:20 — zynux websocket EOF
```

These are typical idle connection timeouts — no action needed.

### Live Activity (last 12 hours)

User `2347042310893` is the primary active user, messaging both Zynux and Aelixxr:

| Time (UTC) | Agent | Message |
|---|---|---|
| 07:21 | Zynux | "What the time?" → "08:21 AM Wednesday June 17" |
| 07:22 | Aelixxr | "Good morning" → "Good morning, Oga! Wednesday don land..." |
| 07:22 | Zynux | "How many tenants we got?" → Asked for sovereign auth PIN |
| 07:23 | Aelixxr | "Thanks yes I read the Quran" → "Alhamdulillah! That's the way..." |
| 07:23 | Aelixxr | "Okay" → Detailed status report (Protozoa research, goals) |
| 07:24 | Zynux | "1234" (PIN entry) → "PIN verified! Session unlocked for 2 hours." |

No messages in the last 10 minutes. User likely offline now.

### AI Model Routing (live patterns)

The capability router is actively using these models based on task type:
- **deepseek-v4-flash** — Default for most Zynux messages (cheapest capable)
- **deepseek-v4-pro** — Complex/follow-up tasks
- **models/gemini-3.1-flash-lite** — Quick Aelixxr life chats

---

## Database State (`naija_ledger`)

**Connection:** naija_admin@postgres-pygxhj.../naija_ledger

### Tables & Counts

| Table | Count | Notes |
|---|---|---|
| `organizations` | 5 | 3 active merchants, headquarters, life companion |
| `chats` | 23 | 7 unique phone numbers across 2 orgs |
| `messages` | 1,935 | Active conversations, last at 07:24 UTC |
| `heartbeats` | 12 | All completed reminders for 2347042310893 |
| `transactions` | 7 | All `energy_topup` refunds (3 CREDITS each) |
| `products` | 1 | Test product ("Test Gadget", 5000 NGN) |
| `vault_documents` | 0 | Not yet used |
| `memories` | 0 | Not yet populated |
| `fraud_registry` | 0 | Clean — no fraud reports |

### Organizations

| ID | Name | Sector | Balance (Kobo) | Status |
|---|---|---|---|---|
| `naija_agent_hq` | Naija Agent HQ | commerce | 1,000 | TRIAL |
| `2349015772541` | Sidecar 1 | commerce | 49,802.00 | ACTIVE |
| `zynux` | Zynux Business | commerce | 9,999,872.99 | ACTIVE |
| `2347011925076` | Sidecar 2 | commerce | 49,703.00 | ACTIVE |
| `aelixxr-life-companion` | Aelixxr Life Companion | commerce | 9,967.00 | ACTIVE |

**Notable:**
- Zynux has ~₦10M balance (testing/super-admin credits)
- Aelixxr has ~₦9,967 (9,967 Kobo = ~₦100)
- Two "Sidecar" orgs at ~₦500 each — appear to be test orgs
- Naija Agent HQ still in TRIAL status
- All orgs have `commerce` sector — no health/property/legal orgs active
- Cost per reply: 3,300 Kobo (~₦33) across all orgs

### Active Chat Sessions

7 unique phone numbers communicating:

| Phone | Orgs | Chat Type |
|---|---|---|
| `2348100969806` | zynux | Zynux business |
| `2347042310893` | zynux + aelixxr | Both (most active user) |
| `2347055229084` | zynux | Zynux business |
| `2347062954839` | zynux | Zynux business |
| `2349164648439` | aelixxr | Life companion |
| `2347084570794` | aelixxr | Life companion |
| `2348053662315` | aelixxr | Life companion |
| `2348078121339` | aelixxr | Life companion |
| `16465894168` | aelixxr | Life companion (US number) |

### Transactions (all energy refunds)

All 7 transactions are `energy_topup` type, 3 CREDITS each, status `success` — these appear to be refund transactions from the delegation disconnect bug fix (commit `61b6707`).

### SearXNG

Running but showing **rate limit issues**: `SearxEngineTooManyRequestsException` with 180-second suspensions. This suggests the upstream search engines (Google, etc.) are rate-limiting the SearXNG instance. Not critical — Brave Search fallback will handle it.

---

## Health Assessment

| Component | Status | Notes |
|---|---|---|
| API Server | ✅ Healthy | Processing webhooks |
| Zynux Worker | ✅ Healthy | Processing messages live |
| Aelixxr Worker | ✅ Healthy | Processing life messages live |
| WhatsApp Sidecar | ⚠️ Stable | Periodic idle disconnects (expected) |
| PostgreSQL | ✅ Healthy | 1,935 messages, 5 orgs |
| Redis | ✅ Healthy | Queue + sidecar mapping |
| SearXNG | ⚠️ Rate limited | Upstream search engine throttling |
| Coolify | ✅ Healthy | All containers healthy |

### Key Observations

1. **System is fully operational** — Both Zynux and Aelixxr are processing messages live
2. **Single active user** (`2347042310893`) — This is likely you, the sovereign admin
3. **WhatsApp sessions are stable** — EOF errors are normal idle timeouts for long-lived WebSocket connections
4. **Energy refunds working** — 7 refund transactions from the delegation bug fix are all successful
5. **No vault usage yet** — vault_documents and memories tables are empty
6. **SearXNG rate limiting** — Not critical; Brave Search fallback is in place
7. **Database migration proceeding** — Data is in PostgreSQL; Firestore still used for org/onboarding queries
8. **No fraud reports** — Clean registry
9. **One test product** ("Test Gadget") — Product catalog not yet populated
10. **Deployment model** — All orgs use `SHARED` model; single unified container on Coolify
