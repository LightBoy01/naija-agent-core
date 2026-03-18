# Debug Log

## Issue: Master Bot Context Unawareness (2026-03-18)
**Status:** ✅ **Resolved**

### **Symptoms:**
- The Sovereign Admin asked the Master Bot questions about the internal knowledge base (e.g., "What is in the Red Team Report?").
- The Bot replied with an authentication challenge: "Please type your 4-digit PIN to unlock management tools."
- The Bot appeared "unaware" of the knowledge that was supposedly seeded.

### **Root Cause Analysis:**
1.  **Tool Hallucination:** The Gemini model, when asked a question, felt the need to "search" for the answer using the `web_search` or `save_knowledge` tools.
2.  **Security Gate:** These tools are listed in `PIN_PROTECTED_TOOLS`.
3.  **Auth Lock:** Since the session was not explicitly "unlocked" via PIN, the system blocked the tool call and returned an `AUTH_REQUIRED` error.
4.  **Loop:** The Bot relayed this error to the user as a PIN request, effectively blocking the conversation.

### **Fix Implementation:**
- **Prompt Engineering:** Updated the `systemPrompt` for the Master Bot (Admin Context) in `apps/worker/src/handlers/messaging.ts`.
- **Explicit Instruction:** Added a `[WISDOM BASE INSTRUCTIONS]` block:
    > "ALWAYS check this [WISDOM BASE] first before answering. Do NOT use 'web_search' to find this info; it is already here."
- **Result:** The Bot now answers directly from its context window without attempting to invoke restricted tools.

---
