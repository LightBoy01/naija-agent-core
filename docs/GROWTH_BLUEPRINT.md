# NaijaAgent Core - Growth & Operations Blueprint

This document outlines the operational roadmap, from "Hello World" on Termux to a scaled National Brand, specifically tailored for the Nigerian business environment.

## 1. The Infrastructure Strategy (Phone Numbers)

**The "Kpalasa" Protocol**
To use WhatsApp Business API, you need a dedicated phone number that is **NOT** active on the mobile app.

*   **Step 1:** Buy a fresh SIM (MTN/Airtel). Register it with NIN.
*   **Step 2:** Insert into a "Kpalasa" (Feature phone) or spare Android. You only need it for **SMS OTP**.
*   **Step 3:** Register on Meta Developer Portal. Input number -> Receive OTP -> Verify.
*   **Step 4:** Keep the SIM active (load ₦100 airtime monthly) to prevent recycling by the telco.

**Development Phase:**
*   Use the **Meta Test Number** (Sandbox) for free testing.
*   Only graduate to a Real SIM when you have a paying client or are ready for public demo.

---

## 2. The "SpeedyLogistics" Scenario (Lifecycle)

A step-by-step guide to onboarding your first client (Zero to Scale).

### Phase 1: The Lab (Product Completion)
*   **Action:** Seed Database. Configure System Prompt for "NaijaAgent Demo".
*   **Test:** Send Voice Note in deep Pidgin ("Abeg, how much delivery?").
*   **Success Criteria:** Bot replies intelligently in < 5 seconds.

### Phase 2: The Reachout (The Hustle)
*   **Target:** IG Vendors/Logistics companies (2k-10k followers).
*   **Pitch:** "Stop losing customers because you didn't reply fast enough. I built a system that answers inquiries, confirms payments, and tracks riders 24/7."
*   **The Hook:** Send them a link to your **Test Number**. Let them talk to the bot.

### Phase 3: Onboarding (The Setup)
*   **Fee:** ₦50,000 Setup + ₦10,000 Credit Deposit.
*   **Action:**
    1.  Client buys/provides a dedicated SIM.
    2.  You verify it on Meta.
    3.  You create their Org in DB (`organizations` table) with a custom System Prompt.
    4.  Top up their `balance`.

### Phase 4: Live Operations
*   **User:** *"Where is my package?"*
*   **Bot:** Checks "SpeedyLogistics" Google Sheet/DB -> Replies *"Rider Musa is at Yaba. ETA 15 mins."*
*   **Result:** Business owner saves time. Customer is happy.

### Phase 5: The Viral Loop (Network Effect)
*   **Strategy:** Append a footer to the final message of every successful chat:
    > *"Was this helpful? Powered by NaijaAgent. Get yours at naijaagent.ng"*
*   **Mechanism:** SpeedyLogistics' customers are often business owners themselves. They see the tech works -> They sign up.

---

## 3. Red Team Analysis (Operational Risks)

### A. The "SIM Limit" Trap
*   **Risk:** NIN regulations limit the number of SIMs one person can register.
*   **Mitigation:**
    *   **Client Ownership:** Always register the SIM in the **Client's Name** (RC Number). Do not hoard SIMs yourself.
    *   **Embedded Signup:** Eventually implement "WhatsApp Embedded Signup" (Tech Flow) where clients scan a QR code to link their own number without you touching the SIM.

### B. The "Trust" Deficit
*   **Risk:** Client refuses to pay Setup Fee because "It might not work."
*   **Mitigation:**
    *   **Freemium:** Offer 3 days free trial on *your* test number.
    *   **Hardware Bundle:** Sell a cheap tablet pre-loaded with the dashboard. Nigerians trust physical goods more than software.

### C. The "Emergency" Fail
*   **Risk:** AI hallucinates or gets stuck. Business owner panics.
*   **Mitigation:**
    *   **#STOP Command:** Allow owner to type `#stop` in the chat to pause the AI instantly and take over manually.
    *   **#START Command:** Resume AI after manual intervention.

---

## 4. Working Tips for Success

1.  **Pidgin Is King:** Your moat is the ability to understand *"I wan run kiti kiti"*. Constantly update your System Prompts with street slang.
2.  **Pre-Paid Only:** Never offer post-paid billing. In Nigeria, "Post-Paid" means "Bad Debt".
3.  **No Ads Needed:** Use the "Powered by" footer. It is free marketing to high-intent users.
4.  **Focus on Pain:** Don't sell "AI". Sell "Payment Verification" (Fake Alert Buster) and "Rider Tracking".

