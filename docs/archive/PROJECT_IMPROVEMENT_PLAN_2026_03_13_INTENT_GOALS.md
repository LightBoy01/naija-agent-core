# Blueprint: Transitioning from "Hardcoded Steps" to "Intent-Goal Orchestration"

**Date:** March 13, 2026
**Strategic Objective:** Move away from linear, rigid state machines toward a fluid, goal-oriented system where the AI extracts structured intent while the system enforces deterministic safety (PBA).

---

## 1. Core Philosophy: Intent vs. Step
- **The "Step" (Current):** System says: "I am in Step A. I only accept Input A. Reject everything else."
- **The "Goal" (Proposed):** System says: "My goal is to reach State Z (Setup Complete). I will extract any data (A, B, or C) from the user's message that moves me closer to that goal."

---

## 2. Part A: The "Greedy" Onboarding Engine (UX Revolution)

### **Current Friction:** 
Boss says: *"My shop is Bims Gadgets and my PIN is 1234."*
System: *"Got it: Bims Gadgets. Step 2: What is your PIN?"* (FRUSTRATING).

### **Proposed Goal-Based Flow:**
1.  **Semantic Extraction Node:** Before the state machine runs, pass the user message to a high-speed "Extraction Model" (Gemini Flash-Lite).
2.  **Schema-First Prompt:** 
    > "Extract these fields from the text: BusinessName, AdminPin (4 digits), BankName, AccountNumber (10 digits). Return JSON only."
3.  **State Projection:**
    - Update `onboardingData` with **all** found fields.
    - **Logic Jump:** If `name` and `adminPin` are found, automatically set `nextStep` to `BANK_NAME`.
    - **Proactive Confirmation:** Bot replies: *"Oga, I don set your name to 'Bims Gadgets' and your PIN is secured. Now, wetin be your Bank Name?"*

---

## 3. Part B: Tool-Goal RBAC (Security Orchestration)

### **Current Hardcoding:**
A static list `PIN_PROTECTED_TOOLS` in the worker prevents certain tools from firing.

### **Proposed Goal-Based Security:**
1.  **Tool Metadata:** Move security requirements into the tool definitions.
    ```typescript
    {
      name: "save_product",
      securityGoal: "AUTHENTICATED_ADMIN", // Requires active session + PIN
      description: "...",
    }
    ```
2.  **Intent Pre-Flight:**
    - The AI identifies the *Intent* (Goal: Update a price).
    - The System intercepts the tool call, checks the `securityGoal`.
    - If not met, the system **suspends** the intent and forces a PIN prompt, then **resumes** the original intent once verified.

---

## 4. Part C: The "Sentinel" (Semantic Guardrail)

### **Current Hardcoding:**
A Regex blocks any number that looks like a price if not found in the catalog. (Leads to false positives).

### **Proposed Goal-Based Guardrail:**
1.  **The Goal:** "Zero Hallucination Policy."
2.  **Method:** Instead of Regex, use a **Post-Processing Judge**.
    - Model generates a response.
    - If response contains currency symbols (₦, $), send a 100ms request to a judge model:
      > "Catalog: {Search Result}. Response: '{Message}'. Does the price in the response match the catalog? Yes/No."
3.  **Benefit:** Allows the AI to say *"We have 1,000 bags"* (Quantity) without the Regex redacting it as a price mistake.

---

## 5. Implementation Roadmap (Phase 7.4)

### **Phase 1: "Greedy" Extraction (Immediate)**
- Refactor `handleOnboarding` to use a `structured_extraction` turn.
- Allow the onboarding state machine to "skip ahead" based on JSON data.

### **Phase 2: Intent Suspension & Resume**
- Implement logic to store a "Pending Intent" in Redis.
- If a Boss calls a protected tool while locked, bot asks for PIN. Once PIN is entered, the bot *automatically* executes the previous command.

### **Phase 3: The Sentinel Judge**
- Replace the Regex Price Guard with a fast Semantic Verifier turn to reduce "Guardrail Noise."

---

## 6. Risk Assessment
- **Cost:** Adds 1-2 small AI turns (Flash-Lite) per onboarding message.
- **Mitigation:** Only use "Greedy Extraction" for the first message of a session or during onboarding to keep kobo-cost low.

---
**Verdict:** This plan keeps the **Merchant Protected** (deterministic rules) while making the bot feel **Human** (flexible natural language understanding).

**Shall I begin drafting the "Greedy Extraction" code for Onboarding?**
