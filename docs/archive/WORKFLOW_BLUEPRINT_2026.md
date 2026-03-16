# Sovereign E2E Workflow Blueprint (2026 Edition)
**Status:** Draft for Final Review
**Goal:** High-Volume Operational Stability & Clean Boss DMs.

## 1. The Dual-Zone Architecture
To scale the business without overwhelming the Boss, the AI Agent operates in two distinct "Zones."

### Zone A: The Storefront (Customer DMs)
*   **Purpose:** Lead capture, Product search, Cart management, and Payment collection.
*   **Privacy:** Customers only see their own chat. They have no visibility into the internal operations.
*   **Key Tools:** `search_products`, `add_to_cart`, `view_cart`, `generate_order_summary`, `verify_transaction`.

### Zone B: The Command Center (WhatsApp Group)
*   **Purpose:** Packaging, Dispatch, and Logistics.
*   **Members:** Boss (Owner), AI Bot (Dispatcher), Staff (Packagers), Riders (Delivery).
*   **Privacy:** Internal only. This is where the "Hustle" happens.
*   **AI Role:** Acts as a **Dispatcher**. It "shouts" alerts, assigns tasks, and tracks the physical movement of goods.

---

## 2. End-to-End Operational Journey

| Stage | Step | Zone | AI Action / Trigger | Logic & Security |
| :--- | :--- | :--- | :--- | :--- |
| **1. SHOPPING** | Browsing | A | `search_products` | **Price Guard:** Prevents hallucinated discounts. |
| **2. INTENT** | Add to Cart | A | `add_to_cart` | **Soft-Reservation:** Decrements "Available" stock for 2 hours. |
| **3. CHECKOUT** | Order Summary| A | `generate_order_summary`| **Activity Creation:** Logs a `pending_payment` record in Firestore. |
| **4. PAYMENT** | Receipt Sent | A | `verify_transaction` | **Anti-Fraud Vision:** Scans for pixel-level receipt forgery. |
| **5. DISPATCH** | **Order Paid** | **B** | **Group Alert Trigger** | Bot posts to Command Center: "📦 *NEW ORDER PAID!* [ORD-101] @Packer start work." |
| **6. PACKAGING**| Packaged | B | `manage_activity` | Staff uploads photo of package. Bot updates status to `ready_for_pickup`. |
| **7. LOGISTICS**| Assigned | B | `assign_task_to_staff`| Bot mentions @Rider. Status flips to `in_transit`. |
| **8. TRACKING** | "Where?" | A | `check_order_status` | Customer asks in DM. Bot reads Activity status: "Oga, your order is with the Rider." |
| **9. DELIVERY** | Delivered | B | `manage_activity` | Rider marks Delivered. **Sovereign Snitch** notifies Boss in Private DM. |
| **10. LEDGER** | Finalized | - | `incrementDailySales` | Atomically adds to Boss's Daily Report. |

---

## 3. The "Clean Boss DM" Strategy
The Boss's private DM with the Bot is now a **High-Level Dashboard**, not a notification center.

*   **Filtered Notifications:** Only "Critical" alerts (Fraud detection, Boss Lockouts, or High-Value Sales) enter the Boss's DM.
*   **Proactive Reporting:** Every morning at 8 AM, the Bot sends a **Morning Pulse**:
    *   *"Oga, yesterday we sold ₦150k. 3 items are low in stock. Riders are all active."*
*   **Operations Muted:** The Boss can "Mute" the Command Center Group but still "Peek" to see that the Bot is assigning tasks to Riders correctly.

---

## 4. Technical Requirements for Implementation
1.  **Config Update:** Add `commandCenterGroupId` to the Organization document.
2.  **Tool Evolution:** Update `verify_transaction` to detect if a group ID exists and route success messages there instead of the Boss's DM.
3.  **New Tool:** Build `check_order_status(orderId)` to provide self-service tracking for customers.
4.  **Soft-Lock Logic:** Implement a "Reserved" field in the Product schema to prevent double-selling during checkout.

---
**Reviewer:** Gemini CLI (Senior Engineer)
**Recommendation:** Implement Phase 7.2 immediately to support merchant scaling.
