# Feasibility Report: Life Operating System (LOS) Modules

**Date:** March 2026
**Author:** Naija Agent Core (Sovereign Engine)

This report assesses the technical feasibility of the "All-in-One Life Guardian" modules based on current data availability and anti-scraping measures in Nigeria.

## 1. Market Intelligence (Food Prices)
*   **Feasibility:** ⭐⭐⭐⭐⭐ (High)
*   **Primary Source:** World Bank RTFP API (Open, Weekly).
*   **Secondary Source:** NBS NADA Portal (Monthly, Structured JSON).
*   **Strategy:** 
    *   Ingest World Bank data for "Baseline" prices.
    *   Scrape major online markets (Jumia Food, MarketSquare) for "Real-time" proxy pricing.
    *   Crowdsource: Allow users to report prices via WhatsApp for "Community Verified" data.
*   **Verdict:** **Immediate Build.** Low risk, high value.

## 2. Education (JAMB/Admission)
*   **Feasibility:** ⭐⭐⭐ (Medium)
*   **JAMB CAPS:** No public API. Requires **Headless Browser (Playwright)** automation.
    *   *Risk:* CAPTCHA and frequent portal downtime. High maintenance.
*   **JAMB Results:**
    *   *Strategy:* Web Proxy to `portal.jamb.gov.ng` (Registration Number only).
    *   *Risk:* IP Ban if polling too frequently. Needs robust proxy rotation.
*   **Verdict:** **Build with Caution.** Start with "Result Checker" (easier). CAPS automation is complex and fragile.

## 3. Healthcare (Drug Verification)
*   **Feasibility:** ⭐⭐⭐⭐ (High)
*   **NAFDAC:** Official Greenbook is scrapable.
*   **EMDEX:** Official API available (Paid/Commercial).
*   **Strategy:**
    *   Scrape NAFDAC Greenbook once to build a local **Vector Database** (Firestore/Pinecone).
    *   Perform search against local DB. Zero dependency on live NAFDAC portal uptime.
*   **Verdict:** **High Impact.** Build a local mirror of the Greenbook.

## 4. Japa (Visa/Passport)
*   **Feasibility:** ⭐⭐ (Low/Hard)
*   **Visa Slots:** Highly guarded by VFS/TLS. Cloudflare protection is aggressive.
    *   *Strategy:* Do **NOT** scrape directly. Monitor **Telegram Channels** (CheckVisaSlots) using a Telethon listener. Piggyback on existing community data.
*   **Passport:** `trackimmigration.gov.ng` is automate-able via simple HTTP requests (CSRF token handling needed).
*   **Verdict:** **Outsource Intelligence.** Listen to community signals rather than scraping embassies directly.

## 5. Implementation Roadmap (Phase 9)
1.  **Module 1: Market Guard** (Food Prices) - *Week 1*
2.  **Module 2: Health Shield** (Fake Drug Check) - *Week 2*
3.  **Module 3: Japa Monitor** (Telegram Listener) - *Week 3*
4.  **Module 4: Education** (Result Proxy) - *Week 4*

---
*Approvals:*
*   [x] Twin Engine Architecture
*   [x] Research Phase
*   [ ] Module 1 Development
