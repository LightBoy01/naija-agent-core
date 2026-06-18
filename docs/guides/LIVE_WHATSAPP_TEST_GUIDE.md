# Live WhatsApp Testing Guide — Zynux & Aelixxr

Send these from `2347042310893` (Sovereign Admin). All messages go to WhatsApp.

---

## ⚡ Quick Pulse (1 min — run this first)

| # | Message | To | What to watch |
|---|---|---|---|
| 1 | `Good morning` | **Aelixxr** | Response within 10s, personalized greeting |
| 2 | `Hello Zynux` | **Zynux** | Response within 10s, sovereign PIN prompt optional |

**VPS check:** `ssh root@159.195.150.66 'docker logs --tail 3 app-pygxhj...'` — no ERROR or WARN lines.

---

## 🧠 Aelixxr Life OS (5 scenarios)

### A1 — Vault Search & Save
```
save a note: my naira wallet password is hunter2
```
→ Aelixxr saves to vault. Then:
```
search my vault for password
```
→ Returns the saved note. Confirm it found it, then:
```
delete the password note from my vault
```
→ Confirms deletion. Search again to verify it's gone.

### A2 — Energy Tracking
```
how many credits do i have left
```
→ Reports current balance (should be ~618). Send 3 more messages to watch it tick down. Check VPS:

```bash
ssh root@159.195.150.66 "docker exec $(docker ps --filter name=postgres-pygxhj --format '{{.Names}}' | head -1) psql -U naija_admin -d naija_ledger -c \"SELECT phone, energy_credits FROM users WHERE phone = '2347042310893';\""
```

Also verify the ledger:
```bash
# Check energy_ledger has entries
ssh root@159.195.150.66 "docker exec $(docker ps --filter name=postgres-pygxhj --format '{{.Names}}' | head -1) psql -U naija_admin -d naija_ledger -c \"SELECT count(*), sum(amount) FROM energy_ledger WHERE user_id = '2347042310893';\""
```

### A3 — Reminder / Heartbeat
```
remind me to drink water in 5 minutes
```
→ Aelixxr should create a heartbeat. After 5 mins, check:
```bash
ssh root@159.195.150.66 "docker exec $(docker ps --filter name=postgres-pygxhj --format '{{.Names}}' | head -1) psql -U naija_admin -d naija_ledger -c \"SELECT * FROM heartbeats WHERE user_id = '2347042310893' ORDER BY created_at DESC LIMIT 3;\""
```

### A4 — Web Search (SearXNG / Brave fallback)
```
search the web for latest nigerian exchange rate usd to ngn
```
→ Should return current rate. Check VPS for SearXNG fallback traces:
```bash
ssh root@159.195.150.66 'docker logs --since 2m app-pygxhj... 2>&1 | grep -i "search\|brave\|searx"'
```

### A5 — Hermes Delegation (Heavy Task)
```
research the current state of agentic AI frameworks in 2026 using your hermes agent, budget 200 naira
```
→ Aelixxr spawns Hermes. Takes 30-90s. Energy deducted.

---

## 🏪 Zynux Business OS (6 scenarios)

### Z1 — Basic Info
```
what time is it
```
→ Returns current Lagos time. Verify model in VPS logs:
```bash
ssh root@159.195.150.66 'docker logs --since 2m app-pygxhj... 2>&1 | grep "CapabilityRouter"'
```

### Z2 — Sovereignty PIN (No Duplicate Key!)
```
how many tenants do we have
```
→ Should ask for PIN. Enter `1234`. Should unlock for 2 hours.
**Critical check:** no `duplicate key` error in logs.
```bash
ssh root@159.195.150.66 'docker logs --since 5m app-pygxhj... 2>&1 | grep -i "duplicate\|energy_ledger"'
```

### Z3 — Commerce Cart
```
add test gadget to cart
```
→ Confirms added. Then:
```
view my cart
```
→ Shows cart with "Test Gadget" at ₦5,000. Then:
```
clear my cart
```
→ Confirms cleared.

### Z4 — Payment Instructions
```
how do i pay
```
→ Returns Monnify/Paystack virtual account details.

### Z5 — Spam Guard
Send the same message 3 times in a row:
```
hello
hello
hello
```
→ 3rd message should get a polite variation instead of identical reply. Third identical message should hit `SPAM_REPETITION`.

### Z6 — Legal Sector
```
what are my legal rights as a tenant in nigeria
```
→ Legal sector pack activates. Verify in logs:
```bash
ssh root@159.195.150.66 'docker logs --since 2m app-pygxhj... 2>&1 | grep -i "sector\|legal"'
```

---

## 🔒 Security & Edge Cases

### S1 — PII Protection
```
my account number is 0123456789
```
→ Aelixxr or Zynux should NOT echo back the full number. Logs should show PII redaction.

### S2 — Energy Exhaustion
Send 100+ messages rapidly (or simulate low credits):
```bash
ssh root@159.195.150.66 "docker exec $(docker ps --filter name=postgres-pygxhj --format '{{.Names}}' | head -1) psql -U naija_admin -d naija_ledger -c \"UPDATE users SET energy_credits = 2 WHERE phone = '2347042310893';\""
```
Then send a message — should get "insufficient energy" warning. Restore after:
```bash
# Restore credits
ssh root@159.195.150.66 "docker exec $(docker ps --filter name=postgres-pygxhj --format '{{.Names}}' | head -1) psql -U naija_admin -d naija_ledger -c \"UPDATE users SET energy_credits = 618 WHERE phone = '2347042310893';\""
```

### S3 — Multi-turn Conversation (No Context Loss)
Send this sequence to **Aelixxr**:
```
my favorite color is blue
```
→ Wait for response.
```
what is my favorite color
```
→ Should remember "blue" from context.

---

## 📊 VPS Health Checks (run during testing)

```bash
# Watch live logs for errors
ssh root@159.195.150.66 'docker logs -f --tail 20 app-pygxhj... 2>&1 | grep -E "ERROR|WARN|duplicate|energy_ledger"'

# Container health
ssh root@159.195.150.66 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep app-pyg'

# DB row counts
ssh root@159.195.150.66 "docker exec $(docker ps --filter name=postgres-pygxhj --format '{{.Names}}' | head -1) psql -U naija_admin -d naija_ledger -c \"
SELECT 'messages' as tbl, count(*) FROM messages
UNION ALL SELECT 'energy_ledger', count(*) FROM energy_ledger
UNION ALL SELECT 'heartbeats', count(*) FROM heartbeats
UNION ALL SELECT 'chats', count(*) FROM chats;
\""

# WhatsApp session health
ssh root@159.195.150.66 'docker logs --since 5m app-pygxhj... 2>&1 | grep -E "websocket|session|hydrated|disconnect"'
```

---

## 🎯 Stability Checklist

After running all scenarios, confirm:

- [ ] **Zero ERROR lines** in `docker logs --since 1h` (excluding expected SearXNG rate limits)
- [ ] **Zero `duplicate key` errors** (was the primary bug — must be gone)
- [ ] **`energy_ledger` has entries** (was missing — must exist now)
- [ ] **Both WhatsApp sessions connected** — `zynux` and `aelixxr-life-companion` hydrated in startup log
- [ ] **Energy credits decrement** after each Aelixxr message (deduct ~3-5 per reply)
- [ ] **AI model router active** — both `deepseek-v4-flash` and `gemini-3.1-flash-lite` appear in logs
- [ ] **Vault search works** — save → search → delete cycle completes
- [ ] **Cart lifecycle works** — add → view → clear
- [ ] **Spam guard triggers** on 3rd identical message
- [ ] **SearXNG fallback to Brave** works when SearXNG rate-limits
- [ ] **No memory leaks** — container RAM stable after 30+ mins of usage
