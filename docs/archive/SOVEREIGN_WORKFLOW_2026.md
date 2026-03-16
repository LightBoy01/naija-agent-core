# Sovereign Workflow Strategy 2026: Dual-Identity & Imperial Groups

## 1. The Triple-Identity Protocol (The "Face, Engine, & Boss" Model)
To maximize conversion and minimize "Migration Panic," we recommend a three-tier setup for high-volume merchants.

### Configuration:
*   **Identity A: The "Face" (Marketing Number)**
    *   Lives on: Standard WhatsApp Business App.
    *   Used for: **WhatsApp Status updates**, Broadcast lists, and VIP human closing.
    *   Strategy: Preserves the vendor's storefront and daily "New Arrival" views.
*   **Identity B: The "Engine" (Automation Number)**
    *   Lives on: **Naija Agent Core API (The Bot)**.
    *   Used for: 24/7 automated customer service, price quoting, order logging, and group dispatching.
    *   Strategy: A dedicated number/SIM (new or secondary) that acts as the business's tireless worker.
*   **Identity C: The "Boss" (Sovereign Owner)**
    *   Lives on: Personal App & **Sovereign Dashboard**.
    *   Used for: Managing the network, auditing chats, and checking the "Visual Ledger."

## 2. The "Migration Panic" & Status Friction
*   **The Trap:** API-based numbers (Identity B) **cannot** post to WhatsApp Status. 
*   **The Risk:** If a merchant moves their *main* business number to the Bot, they lose 40-60% of their "impulse" sales from Status views.
*   **The Solution:** The Bot should never take over the "Marketing Face" unless the merchant is purely ad-driven. We must advise clients during onboarding to use a secondary SIM for the Bot "Engine."

## 3. The Imperial Group Workflow (Staff Dispatcher)
The Engine Number (Identity B) serves as the bridge between customers and the fulfillment team.

1.  **Creation:** The Face (Identity A) or Boss (Identity C) creates a Staff Group.
2.  **Dispatch:** The Engine Bot automatically posts order details from 1-on-1 customer chats into the Staff Group.
3.  **Handoff:** If the Boss (Identity A) sees a complex deal on the Engine's chat via **Meta Business Suite**, they can jump in. The system will automatically trigger the "Step Back" protocol.

## 4. The Coexistence & "Step Back" Protocol
Using Meta's "Coexistence" features, the Boss maintains full visibility without "killing" the bot.

*   **Meta Business Suite:** The human Boss uses the Meta Business Suite app to monitor the Bot's (Identity B) conversations.
*   **The "Step Back" Mechanism:** 
    *   **Detection:** The AI Worker scans the message history before generating a reply. If the most recent message was sent by an `assistant` (human) but NOT by the AI (detectable via metadata tags), the system identifies this as "Human Intervention."
    *   **Auto-Pause:** The AI will automatically suppress all replies for that specific chat for a **2-hour window**.
    *   **Safety:** This prevents "Bot vs. Human" collisions and ensures the customer doesn't receive conflicting messages.
    *   **Manual Resume:** The Boss can type a specific command (e.g., `#resume`) to give control back to the AI immediately.

## 5. Critical Friction Points & Unasked Questions

### A. The "WhatsApp Status" Trap
*   **Problem:** API numbers (Identity B) cannot post to "WhatsApp Status." Nigerian vendors rely heavily on Status for daily sales.
*   **Strategy:** During onboarding, we **must** recommend that merchants keep their "Marketing/Status" number on the standard app (Identity A) and use a secondary or new number for the Bot (Identity B).

### B. The "Group Echo" Risk
*   **Question:** How does the Bot distinguish between "Boss Instructions" and "Rider Gossip"?
*   **Mitigation:** Implement a "Mention-Only" or "Command-First" filter for group messages to prevent the AI from replying to every casual message in the staff group.

### C. The Cost of Internal Automation
*   **Question:** Meta charges for group conversations. How do we bill the merchant for "Internal Staff Dispatching" without them feeling cheated?
*   **Strategy:** Bundle "Internal Automation" as a premium tier or include a set number of "Staff Dispatches" in the monthly subscription.

### D. Context Isolation
*   **Problem:** Preventing the AI from leaking customer info into the group or vice versa.
*   **Strategy:** Strict Firestore security rules and scoped AI memory. The "Group Brain" should only have access to `Activities` (Orders), while the "Chat Brain" has access to the full conversation history.
