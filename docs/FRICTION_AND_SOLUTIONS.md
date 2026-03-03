# NaijaAgent Core - Friction Busting & Operational Strategy

This document outlines the **Human-in-the-Loop (HITL)** strategies and workflows required to make the AI Agent indispensable and robust against human error in the Nigerian business context.

## 1. The "Stock Out" Disaster (Inventory Drift)
**Pain Point:** Business owners forget to update inventory dashboards/spreadsheets. The Bot sells out-of-stock items, leading to refunds and anger.

### Solution: The "Reverse Interrogation" Ritual
Instead of a dashboard, the Bot actively queries the owner via WhatsApp.

*   **Workflow:**
    1.  **Trigger:** Daily at 8:00 AM (or shift start).
    2.  **Bot Message (To Owner):** *"Good morning Oga! Quick stock check for top items: 1. iPhone 15 Pro, 2. PS5 Slim. Reply with counts (e.g. '5, 2')."*
    3.  **Owner Action:** Replies *"5, 0"* while commuting.
    4.  **Bot Action:** Updates DB instantly. Marks PS5 as "Out of Stock".
*   **Defense:**
    *   **The Nag:** If no reply by 9:00 AM, send reminder.
    *   **The Shame:** Weekly report: *"You missed 3 updates. We risk selling ghost stock."*

## 2. The "Ghost Rider" Problem (Logistics)
**Pain Point:** Riders are unreliable, phones die, or they lie about location. Customers scream at support.

### Solution: "Group Chat Spy" & GPS Verification
Leverage existing rider behavior (WhatsApp Groups) instead of forcing a new app.

*   **Workflow:**
    1.  **Setup:** Create "SpeedyLogistics Riders" WhatsApp Group (Bot + Owner + Riders).
    2.  **Protocol:** Rider must post "Live Location" + Photo of package at delivery point.
    3.  **Bot Action:**
        *   Listens to Group messages.
        *   Extracts GPS coordinates from Live Location.
        *   Matches GPS to Customer Address in DB (Geofencing).
    4.  **Verification:**
        *   *If Match:* Bot DMs Customer: *"Rider is here! Confirm receipt? (Reply YES)"*.
        *   *If Mismatch:* Bot tags Owner in Group: *"@Oga, Rider Musa location (Yaba) does not match Customer (Lekki)."*

## 3. The "Control Freak" Anxiety (Owner vs. Bot)
**Pain Point:** Owner wants to handle VIPs personally but fights the bot for control. Double replies look unprofessional.

### Solution: "Silent Whisper Mode" (Auto-Pause)
Give the owner ultimate control without breaking the automation.

*   **Workflow:**
    1.  **Detection:** Bot listens for outbound messages from the WhatsApp Business App (sent by human).
    2.  **Trigger:** If `message.from_me` is detected (via API status hook).
    3.  **Action:** Bot **PAUSES** processing for that specific chat for 15 minutes.
    4.  **Feedback:** Bot whispers to Owner: *"I see you are typing. I am pausing for 15 mins. Type #resume to start me early."*

## 4. Red Team Analysis (Vulnerabilities)

### A. The "Dual Reply" Race Condition
*   **Risk:** Owner and Bot reply at the exact same second.
*   **Fix:**
    *   **Typing Indicator:** If Bot sees "Typing..." status from the phone app, it waits 10 seconds before generating a reply.
    *   **Strict Handover:** Owner must type `#human` to officially take over complex chats.

### B. The "Fake Photo" Scam
*   **Risk:** Rider snaps photo of a random door to claim delivery.
*   **Fix:**
    *   **Customer Confirmation:** The delivery is ONLY marked "Complete" when the **Customer** replies "YES" to the bot's private DM. Rider doesn't get paid until then.

### C. The "Morning Ritual" Fatigue
*   **Risk:** Owner stops replying to stock checks after 1 week.
*   **Fix:**
    *   **Gamification:** *"Update stock 7 days in a row -> Get 500 Free AI Credits."*
    *   **Default Safe Mode:** If no reply for 3 days, mark all low-stock items as "Ask Owner" instead of "Available".

## 5. Implementation Roadmap
1.  **Stock Check Cron:** Add a scheduled job in `Worker` to message the Owner.
2.  **Group Listener:** Update `API` to handle Group Message webhooks (`waba_group`).
3.  **Auto-Pause:** Add logic in `Worker` to check Redis `chat_paused:{id}` key before processing.
