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

## 4. The "Sovereign Scale" Friction (Managing 100s of Clients)
**Pain Point:** Onboarding new clients manually via database scripts is slow and error-prone. 

### Solution: The "Master Bot" Automated Onboarding
The Sovereign Owner manages the entire factory through a single WhatsApp chat.

*   **Workflow:**
    1.  **Trigger:** New payment received.
    2.  **Command:** Sovereign types: *"Create tenant: Chinedu Pharmacy, Admin: 234..."*
    3.  **Bot Action:** Calls `create_tenant` tool -> Deploys new Organization -> Pings new client.
    4.  **Result:** Zero-code scaling.

## 5. The "Security Friction" (Identity Hijacking)
**Pain Point:** If someone steals the Boss's phone, they can destroy the business knowledge or drain credits.

### Solution: The Admin PIN Handshake
*   **Workflow:** Management tools are "LOCKED" by default. The Boss must type their 4-digit PIN to "UNLOCK" tools for a 2-hour window.

## 6. The "Network Friction" (AI Quota 429 Errors)
**Pain Point:** Gemini Free Tier limits requests. Retries caused duplicate messages.

### Solution: Anti-Spam & Quota Guard
*   **Rule:** `sendText` is moved to the absolute end of the process. The bot stays silent until the AI has finished thinking and the database has been updated.

---

# Technical Institutional Memory (The Drama Archive)

## 1. Infrastructure: The Termux-Supabase Block
*   **Friction:** Supabase direct connections (Port 5432) use IPv6. Termux and many Nigerian mobile networks are IPv4-only.
*   **Solution:** **The Firebase Pivot.** Switched to Firestore which operates over standard HTTPS (Port 443).

## 2. Meta API: The "Account Not Registered" (133010)
*   **Solution:** A manual **Registration Call** is required to "wake up" the number in Meta's backend.

## 3. Webhooks: The "Delivered but Silent" Mystery
*   **Discovery:** Verification (`GET`) only proves the URL is reachable. For Meta to actually forward **Real Messages** (`POST`), the WhatsApp Business Account (WABA) must be explicitly subscribed to the App.
*   **Solution:** The **`subscribed_apps` Handshake**.

## 4. Environment: The JSON Parsing Crash
*   **Solution:** **Hybrid Auth Logic.** The `@naija-agent/firebase` package first looks for a physical `serviceAccountKey.json`.

## 5. Deployment: The "Tunnel Phishing" Filter
*   **Solution:** **Cloud-First Testing.** Moving to a real subdomain (e.g., `.up.railway.app`) provides a stable SSL certificate.

## 6. The Routing Collision Discovery (March 2026)
*   **Drama:** We realized that if the Master Bot and Demo Org use the same WhatsApp Test Number, the API routes randomly.
*   **Solution:** **Phone ID Deactivation.** We assigned `DEMO_PAUSED` to the demo org in Firestore to give the Master Bot exclusive control of the dev environment.

## 7. The Balance Deduction Gatekeeper (March 2026)
*   **Drama:** Deducting balance *after* sending the reply meant that if the deduction failed, the customer still got their answer for free.
*   **Solution:** **Strict Pre-Deduction.** Deduction is now the absolute gatekeeper.
