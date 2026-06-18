# Aelixxr Red Team Review

## New Issues Found (Not in the Original 9-Fix Plan)

---

### 🔴 CRITICAL: `life-vault-deposit` job has no handler — Monnify deposits silently lost

**Location:** `apps/api/src/routes/webhooks.ts` line ~170 → `apps/worker-life/src/index.ts`

**What happens:**
1. Monnify webhook receives a vault deposit (`accountReference.startsWith('aelixxr_vault_')`)
2. API queues `life-queue.add('life-vault-deposit', { userPhone, amountPaid, reference })`
3. Worker dispatcher in `index.ts` has **no case for `'life-vault-deposit'`**
4. Job falls to `default:` → returns `{ success: false, error: 'unknown_job' }`
5. User's money arrives but is **never credited to their vault balance**
6. No logs, no alerts — money silently disappears

**Fix:** Add a `case 'life-vault-deposit':` handler that calls `lifeMemory.addVaultBalance()` and sends a confirmation WhatsApp message. This handler can be lightweight — the webhook already verified the Monnify signature.

---

### 🔴 BUG: `cronHandler.ts` passes energy budget as user balance

**Location:** `apps/worker-life/src/handlers/cronHandler.ts` line 25

```ts
const billResult = await billingService.billForTool(
    cronJob.userId, 
    'sovereign_cron_run', 
    cronJob.energyBudget  // ← BUG: this is the budget (e.g., 5), not the user's actual balance
);
```

`billForTool(userId, toolName, currentBalance)` uses `currentBalance` to decide if billing can proceed and to compute the new balance. Passing 5 as the balance when the user actually has 100 means:

- User with 100 credits gets billed as if they have 5 → `newBalance = 5 - cost`
- User with 2 credits gets billed as if they have 5 → `5 - cost` succeeds when it should fail
- The `lifeMemory.deductEnergy()` inside billForTool still operates on the real balance via `SELECT → check → UPDATE`, so the ACTUAL deduction works correctly. But the balance check (`currentBalance <= 0`) and error messages use the wrong number.

**Fix:** Fetch the real balance before billing:
```ts
const context = await lifeMemory.getContext(cronJob.userId);
const billResult = await billingService.billForTool(
    cronJob.userId, 
    'sovereign_cron_run', 
    context.energyCredits ?? 0
);
```

---

### 🟡 ISSUE: No audit log for vault deposits from webhook

**Location:** `apps/api/src/routes/webhooks.ts` vault deposit handler

The vault deposit from Monnify webhook queues a job but never logs an audit entry. Compare with `tools/finance/recharge.ts` and `tools/finance/vault.ts` which call `auditService.logVaultAction()` for every financial operation.

**Fix:** In the `life-vault-deposit` handler (new handler from critical fix above), add:
```ts
await auditService.logVaultAction({
    userId: userPhone,
    toolName: 'monnify_vault_deposit',
    direction: 'in',
    amountKobo: amountPaid * 100, // Monnify sends in Naira
    status: 'pending',
    reference
});
// After successful addVaultBalance, call updateLogStatus to 'success'
```

---

### 🟡 ISSUE: Zynux worker also hits dead `/download/` endpoint

**Location:** `apps/worker/src/services/whatsapp.ts` `downloadMediaFromSovereign()` method

The plan's Fix #8 correctly identifies the worker-life side, but the **Zynux worker** also has `downloadMediaFromSovereign()` that calls `GET ${sidecarUrl}/download/${mediaId}` when the phone ID is sovereign. Both workers need the fix.

**Correction to plan:** Fix #8 should target BOTH services.

---

### 🟡 ISSUE: BillForMessage can push users below the -2 floor

**Location:** `apps/worker-life/src/handlers/chatHandler.ts` line 248 → `billingService.billForMessage()` → `lifeMemory.deductEnergy(userId, 1)`

`deductEnergy()` allows going down to -2. `billForMessage(userPhone)` is called after every successful chat response with no balance check. Combined with Fix #7 (removing BatteryInterceptor), users at 0 energy can continue chatting down to -2 before `deductEnergy` blocks them. Low severity — -2 is the intended floor and free-text responses cost 1 credit.

---

### 🟡 ISSUE: SpamInterceptor shares Redis namespace with operational data

**Location:** `pipeline/interceptors/spam.ts`

Spam keys use format `spam_history:${userPhone}:${md5hash}`. Should use a dedicated prefix like `life:spam:` to prevent any theoretical collision with other Redis keys.

---

### 🟡 ISSUE: Hermes Docker container exposes ALL env vars, including secrets

**Location:** `apps/worker-life/src/services/dockerService.ts` lines 60-68

```ts
Env: [`DATABASE_URL=${process.env.DATABASE_URL}`, `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`],
```

The ephemeral Docker container gets unfettered access to the production database and Gemini API key. If a user crafts a prompt that makes Hermes exfiltrate data, they could steal credentials. Worth adding a sandbox-scoped API key with restricted permissions.

---

### 🟢 NOTE: Fix #4 circuit breaker is process-local

Circuit breakers in Fix #4 are in-memory objects. If two worker processes run, each has its own circuit state. For the current single-process architecture this is fine. If scaling to multi-process workers, use Redis for shared state.

---

### 🟢 NOTE: Fix #3 retry should distinguish network errors from WhatsApp errors

Go sidecar could return "device logged out" errors that should NOT be retried. The retry should only fire on network/timeout errors (ECONNREFUSED, ETIMEDOUT, 5xx), not on WhatsApp-level errors (4xx, "device disconnected").

---

## Plan Corrections Required

| Original Fix | Correction |
|---|---|
| Fix #1 (Energy Ledger) | `billingService.billForTool` needs `jobId` parameter added to write to ledger |
| Fix #2 (Split chatHandler) | Also split `handleLifeChatResume` — it duplicates context loading, prompt building, AI calling, and send+save logic |
| Fix #5 (Rate limiting) | Use normalized phone number from `parseAndFormatPhone(from)` as key; don't use raw `from` which may have JID suffixes |
| Fix #8 (Dead code) | Target BOTH `apps/worker/src/services/whatsapp.ts` AND `apps/worker-life/src/services/whatsapp.ts` |
| Fix #9 (Hermes timeout) | The `slmHandler.ts` Hermes path calls `billingService.billForTool` with `'hermes_manual_delegation'` — this tool name is not in `TOOL_COSTS` so it falls to `DEFAULT_TOOL_COST = 3000` (3 credits), not the intended 50 credits. Add to billing config. |
| **NEW Fix #10** | Add `life-vault-deposit` handler with vault balance update + audit log + WhatsApp notification |
| **NEW Fix #11** | Fix `cronHandler.ts` energy budget vs. balance bug |
| **NEW Fix #12** | Add `job.id` passthrough to `billForTool` for ledger traceability |
| **NEW Fix #13** | SpamInterceptor key prefix hardening |

---

## Revised Files Summary

| File | Action | Change from Original |
|---|---|---|
| `packages/database/src/schema.ts` | Add `energyLedger` table | Unchanged |
| `services/lifeMemory.ts` | Add ledger writes; refactor into facade | Also include `jobId` in deduction calls |
| `services/billingService.ts` | Pass toolName + jobId to ledger; unify error messages | Added `jobId` parameter |
| `services/energyService.ts` | NEW — energy CRUD with ledger writes | Unchanged |
| `services/userService.ts` | NEW — user CRUD, referrals | Unchanged |
| `services/vaultBalanceService.ts` | NEW — vault balance CRUD | Unchanged |
| `services/memoryService.ts` | NEW — episodic + semantic memory | Unchanged |
| `services/messageBuilder.ts` | NEW — prompt + message construction | Also handle `handleLifeChatResume` |
| `services/toolExecutor.ts` | NEW — tool execution loop | Unchanged |
| `services/responseSender.ts` | NEW — send + save pipeline | Also used by `handleLifeChatResume` |
| `services/circuitBreaker.ts` | NEW — circuit breaker utility | Unchanged |
| `services/vaultWebhookHandler.ts` | NEW — handles `life-vault-deposit` | Added |
| `handlers/chatHandler.ts` | Slim down; remove BatteryInterceptor | Also slim `handleLifeChatResume` |
| `handlers/cronHandler.ts` | Fix energy budget bug | Added |
| `handlers/slmHandler.ts` | Set BullMQ job timeout for Hermes | Also add `hermes_manual_delegation` to billing config |
| `services/whatsapp.ts` (worker-life) | Add retry logic | Only retry on network errors |
| `services/whatsapp.ts` (worker) | Remove dead `downloadMediaFromSovereign` path | Added |
| `config/billing.ts` | Add `hermes_manual_delegation` cost (5000 kobo = 50 credits) | Added |
| `pipeline/interceptors/spam.ts` | Change key prefix to `life:spam:` | Added |
| `apps/api/src/routes/webhooks.ts` | Add rate limiting | Use normalized phone for key |
| `packages/payments/src/monnify.ts` | Wrap in circuit breaker | Unchanged |
| `services/audioService.ts` | Wrap Groq call in circuit breaker | Unchanged |
| `services/dockerService.ts` | Add Promise.race timeout | Unchanged |
| `pipeline/interceptors/battery.ts` | DELETE — redundant | Unchanged |
| `apps/whatsapp-sidecar/api/server.go` | Remove/comment `/download/` route | Unchanged |
| `apps/worker-life/src/index.ts` | Add `life-vault-deposit` case + `vaultWebhookHandler` import | Added |
