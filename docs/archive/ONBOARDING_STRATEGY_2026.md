# Onboarding & App Strategy (2026)

This document outlines the strategic choice between the **Shared App** and **Owned App** models for onboarding clients to the Naija Agent network.

## 1. The Shared App Model (The "Fast Lane")
The business runs on **your** Meta Developer App and **your** WhatsApp Business Account (WABA).

*   **Setup:** 100% Seamless. You only need the client's phone number.
*   **Onboarding:** Can be done in < 60 seconds via the Master Bot.
*   **The "Naija" Factor:** Perfect for small vendors, Instagram shops, and local logistics who just want it to "work."
*   **Key Risks:** Shared reputation. If one client spams, the entire Meta App (and all clients on it) could be banned.
*   **Cost:** All clients share a single 1,000 free monthly "Service Conversation" limit.

## 2. The Owned App Model (The "Enterprise Lane")
The client provides their **own** Meta Developer App, App Secret, and WABA.

*   **Setup:** Hard. Requires the client to have a Meta Developer account and perform business verification.
*   **Onboarding:** Requires "White Glove" technical support from the Sovereign.
*   **The "Naija" Factor:** Best for established brands (Banks, Supermarkets, Large Logistics) who want a "Verified Green Tick" and data isolation.
*   **Key Benefit:** Zero cross-contamination. Each client gets their **own 1,000 free conversations per month.**
*   **Security:** The system uses **Dynamic Secret Lookup** to verify signatures using the client's specific App Secret stored in Firestore.

---

## 3. Comparison Matrix

| Feature | Shared App (Fast Lane) | Owned App (Enterprise) |
| :--- | :--- | :--- |
| **Setup Time** | 1 Minute | 1-2 Days |
| **Branding** | Your Name (usually) | Their Verified Name |
| **Risk** | Shared Risk (One fails, all fail) | Isolated Risk |
| **Meta Cost** | Shared 1,000 Free Limit | Individual 1,000 Free Limit |
| **Target** | SMEs / Solopreneurs | Corporate / Established Brands |

---

## 4. The 3-Stage "Naija Agent" Hybrid Strategy

To maximize acquisition and minimize friction, follow this 3-stage path:

### Stage 1: Acquisition (The "Hook")
Onboard the client on the **Shared App** immediately. Offer a 7-day free trial or a small "Trial Credit." This removes the technical barrier and the "commitment" friction.

### Stage 2: Retention (The "Value Add")
Once the client sees the bot closing sales and verifying receipts, sell the **Owned App** as an upgrade. Highlight the "Private Green Tick" and the "Extra 1,000 Free Messages" they will get.

### Stage 3: Professional Service (The "Upsell")
Charge a one-time "Setup & Migration Fee" to handle the Meta Developer registration for them. This turns a technical hurdle into a revenue stream.

---

## 5. Technical Implementation Note
The infrastructure is already **Hybrid-Ready**. The API automatically performs a **Dynamic Secret Lookup** by `phoneId`. If a client's `appSecret` is found in their Firestore config, the system uses it for verification; otherwise, it falls back to the global Master Secret.
