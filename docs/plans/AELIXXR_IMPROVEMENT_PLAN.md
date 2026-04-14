# Aelixxr (Life OS) Improvement & Monetization Plan

This document outlines the critical technical refactor for the proactive heartbeat system and a comprehensive review of the proposed Credit-Based Monetization Strategy for Aelixxr.

---

## 1. Technical Refactor: Heartbeat Scalability (Critical)

**The Problem:**
Currently, the `life-heartbeat` job fetches all active users and evaluates their monitoring configurations simultaneously in memory using `Promise.allSettled()`. If Aelixxr scales to 1,000+ users, this will cause severe API Rate Limiting (HTTP 429) from Gemini and potential Node.js Out-Of-Memory (OOM) crashes on the worker.

**The Solution: True BullMQ Fan-Out Architecture**
Instead of evaluating everything in one massive loop, the master `life-heartbeat` job will act purely as a dispatcher.

1.  **Dispatcher Job (`life-heartbeat`)**:
    *   Runs on a cron schedule (e.g., every 5 minutes).
    *   Queries Firestore for all `userId`s with active monitors.
    *   Loops through the users and pushes a new job `evaluate-heartbeat` to the `life-queue` for each user.
    *   *Result:* Completes in milliseconds.
2.  **Worker Job (`evaluate-heartbeat`)**:
    *   Picks up individual user evaluation jobs from the queue.
    *   Respects the BullMQ `concurrency` limit (currently set to 5). This guarantees we never have more than 5 parallel Gemini API calls running at the exact same time.
    *   Performs the evaluation, tool checks, and sends the WhatsApp message if an alert is triggered.

---

## 2. Monetization Strategy Review: The Credit System

The shift from direct Naira billing to a "Credit System" is a massive psychological improvement. It gamifies the experience and removes the constant "pain of paying" associated with seeing currency deductions.

### Proposed Structure Analysis:
*   **Currency Peg:** 1 Credit = ₦10
*   **Welcome Bonus:** 100 Credits (Equivalent to ₦1,000)
    *   *Feedback:* Excellent. 100 credits feels substantial. It allows a user to send ~100 basic messages or perform ~30 complex tool searches before hitting a paywall. This is the perfect "hook" to demonstrate Aelixxr's value.
*   **Pricing Tiers:**
    *   **Standard Message:** 1 Credit (₦10)
    *   **Basic Tool Call (Web Search, Market Price):** 3 Credits (₦30)
    *   **Advanced Tools (Image Generation, Vault Analysis):** 5 - 7 Credits (₦50 - ₦70)
    *   *Feedback:* This tiering accurately reflects the backend LLM token/compute costs. However, we must ensure Aelixxr is prompted to be *efficient* with tools, so users don't feel "robbed" if the AI decides to do 3 web searches for a simple question.
*   **Referral Program:** 1 New Friend = 10 Credits (₦100)
    *   *Feedback:* Standard and effective. To make it more viral, consider a "Give 10, Get 10" model. The new friend gets their 100 Welcome Bonus + 10 extra from the referral, and the referrer gets 10.

### UX & Psychology: The "Energy/Battery" Metaphor

To prevent robotic, transactional interruptions that break the illusion of Aelixxr being a "Life Companion," we will frame the Credit System as Aelixxr's **"Energy"** or **"Battery."** This naturalizes the need for top-ups (recharging).

**Best Practices for Billing Reminders (The Energy Metaphor):**

1.  **Soft Nudges (Low Battery Warning - 20% / 5%):** 
    Never send a generic `[SYSTEM: Insufficient Balance]` message. Aelixxr should deliver the news herself, blending it with empathy and urgency.
    *   *20 Credits Left:* Casual mention at the end of a normal message. "By the way, my energy is getting a bit low (20% left). Just a heads up for later!"
    *   *5 Credits Left:* A dedicated, slightly more urgent message. "Oga, my battery is flashing red o! We have just 5 units of energy left. Let's 'plug me in' (top up) so I don't sleep off on you."
2.  **Preflight Checks (Before Expensive Tasks):**
    When the user asks for a heavy task (e.g., Image Generation - 50 Credits) but Aelixxr only has 40 Credits, she should pause and ask for a charge *before* starting.
    *   *Example:* "I'd love to generate that image for you, but it takes a lot of energy (50 units) and I only have 40 left right now. Can we recharge quickly so I can get to work?"
3.  **Value-Framing the Deduction (The "Heavy Lifting" Excuse):**
    When Aelixxr uses an expensive tool successfully, she should justify the energy spent by highlighting the work done.
    *   *Instead of:* "I deducted 3 credits to use the web search tool."
    *   *Use:* "I had to use a bit of extra energy (3 units) to dig deep into the internet for this exact price, but here is what I found..."
4.  **The "Emergency Reserve" (Soft Bounce / Opportunity Credit):**
    If a user asks a crucial question and has exactly 0 credits, **do not block them immediately.** We introduce the concept of an **Emergency Reserve**. Aelixxr will dip into a `-1` or `-2` balance to answer the question, building immense goodwill and proving she is a reliable companion.
    *   *Example:* "Here is the answer you needed! My battery actually hit 0%, but I used my emergency reserve for you because this sounded important. I'm officially 'sleeping' now though—please use this link to recharge me so we can continue tomorrow!"

### Recommended Next Steps for Implementation

1.  **Refactor `life-heartbeat`** in `apps/worker-life/src/index.ts` to use the BullMQ dispatcher pattern.
2.  **Update `deductBalance` logic** in `packages/firebase` to support a secondary `credits` field alongside the traditional `walletBalance`, or migrate entirely to `credits` for Life OS users.
3.  **Implement the Welcome Bonus** webhook upon initial user registration/first message.
4.  **Update the System Prompt** in `index.ts` so Aelixxr understands her new "Credit" economy and can warn users gracefully when balances drop below 10.
