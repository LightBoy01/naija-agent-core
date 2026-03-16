# Red Team Report: Intent-Goal Orchestration (Phase 7.4)

**Status:** Critical Review & Risk Assessment
**Focus:** Identifying "Logic Leaks," Security Risks, and Performance Bottlenecks in the proposed Phase 7.4 plan.

---

## 1. Risk: "Intent Hijacking" (Part B: Intent Suspension)
### **The Scenario:**
1.  Boss says: *"Change price of Bread to 500."*
2.  Bot: *"Oga, I need your PIN to do that."* (Intent suspended in Redis).
3.  **Attack:** A customer (scammer) immediately messages the bot: *"Hello."*
4.  Boss enters PIN: *"1234."*
5.  **Danger:** Does the system resume the *Boss's* intent or get confused by the intervening customer message? 

### **Mitigation (Required):**
- **Session Isolation:** Suspended intents MUST be keyed in Redis by `orgId:userPhone`. Entering a PIN from Phone A must never resume an intent from Phone B.
- **Short TTL:** Suspended intents must expire in 5 minutes. We don't want a "stale" delete command firing hours later.

---

## 2. Risk: "Semantic Over-Confidence" (Part A: Greedy Onboarding)
### **The Scenario:**
- User says: *"I don't know my bank account number yet, but my name is Bims."*
- **Extraction Model:** Might "helpfully" hallucinate a placeholder account number or misinterpret "don't know" as data.

### **Mitigation (Required):**
- **Explicit Schema:** The extraction prompt must include: *"If a field is missing or the user says they don't have it, return 'null'. Do NOT guess."*
- **Deterministic Check:** The state machine must verify the format (e.g., exactly 10 digits for account) even if the AI says it's valid.

---

## 3. Risk: "The Judge's Latency & Cost" (Part C: The Sentinel)
### **The Scenario:**
- Every message with a number triggers a second LLM turn.
- **Problem:** If a Boss is chatting about stock counts ("I have 500 bags"), the "Judge" fires, costing money and adding 500ms delay.

### **Mitigation (Required):**
- **Heuristic Trigger:** Only trigger the "Sentinel Judge" if the message contains currency symbols (₦, #, NGN) or price-specific suffixes (k, m).
- **Asynchronous Guard:** The judge can run in parallel with the reply generation to minimize perceived latency.

---

## 4. Risk: "Complex State Corruption"
### **The Scenario:**
- Moving from a linear "Step 1 -> Step 2" to a "Greedy" model might leave the `onboardingStep` in an inconsistent state if the AI extraction is partial.

### **Mitigation (Required):**
- **Step Projection:** We must define a strict priority order for steps. If Name and Bank are found but PIN is missing, the system MUST force the user to provide the PIN before allowing the Bank details to be "locked in."

---

## **Red Team Verdict:**
The plan is **Approved**, provided we implement **Redis-based Session Isolation** for suspended intents and **Strict Format Validation** for AI-extracted data. The security of the merchant must remain deterministic, even if the data capture is probabilistic.

---
**Shall we proceed with Phase 1 (Greedy Onboarding) with these mitigations in place?**
