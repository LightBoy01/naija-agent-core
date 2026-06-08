# Sovereign VPS Migration & Refactoring Report
**Date:** June 7, 2026

## 1. Supabase Decommissioning
*   **Status:** Complete.
*   **Action:** All environment variables have been permanently repointed to the Sovereign VPS PostgreSQL instance (`naija_ledger`).
*   **Data Integrity:** Executed a Zero-Loss migration script that successfully transferred all legacy Firebase records to the new Drizzle ORM schema.
*   **Hardening:** Enhanced the migration script to handle orphaned chats and transactions by automatically generating Archived Stub organizations.

## 2. Onboarding Experience Evolution (Pairing Codes)
*   **Status:** Complete.
*   **Action:** Deprecated the QR code onboarding flow.
*   **New Flow:** The system instantly communicates with the Go Sidecar to generate an 8-character **WhatsApp Pairing Code**.
*   **Instant Activation:** Added logic to immediately hydrate the `sidecar_map` in Redis. The bot is instantly live and aware of its identity.

## 3. Go Sidecar Resiliency Fixes
*   **Status:** Complete & Deployed.
*   **JID Routing:** Fixed the `unknown server` crash by auto-appending `@s.whatsapp.net`.
*   **400 Bad Request Fix:** Resolved the error during pairing by implementing a WebSocket sync delay and formatting the `clientDisplayName` to `Chrome (Linux)`.

## 4. AI Context Caching Resiliency
*   **Status:** Complete.
*   **Action:** Fixed persistent 404 errors from Gemini when attempting to cache large System Prompts by implementing a smart fallback mechanism.
