# @naija-agent/firebase

## Overview and Purpose

The `@naija-agent/firebase` package serves as the primary data access layer for Google Cloud Firestore within the Naija Agent Core ecosystem. As the project evolves, this package currently functions as a **Firestore legacy layer and a dual-write bridge**.

With the ongoing architectural overhaul (Phase 9.3) migrating core state from Firebase Firestore to PostgreSQL (`@naija-agent/database`), this module encapsulates all direct Firebase Admin SDK interactions. It provides a structured, domain-driven API that isolates database logic from the application logic, facilitating a smoother transition by allowing the system to maintain data consistency across both databases during the migration phase.

## Key Dependencies

The package relies on several critical dependencies (as defined in `package.json`):

*   **`firebase-admin`**: The core SDK for interacting with Firebase services (Firestore, Storage, etc.) securely from a server environment.
*   **`@naija-agent/database`**: The target PostgreSQL database package. Its inclusion signifies the integration and dual-write bridging between legacy Firestore and the new relational architecture.
*   **`@naija-agent/types`**: Ensures strict, cross-package TypeScript type integrity.
*   **`dotenv`**: Handles environment variable loading for secure credential injection.
*   **`bcrypt`**: Used for hashing and verifying sensitive data (like PINs/MFA).
*   **`libphonenumber-js`**: For E.164 phone number normalization (Internationalization).

## Core Architecture & Operations

The architecture is built around isolated, domain-specific modules that export targeted async functions for database operations. It follows a multi-tenant structure where most entities are stored within `organizations` sub-collections.

Key operational patterns include:

*   **Database Initialization (`db.ts`)**: Robust initialization logic that handles ESM/CJS interop, searches for `.env` and `serviceAccountKey.json` across different directory levels, and supports Base64 encoded credentials via environment variables for deployments.
*   **Multi-tenant Organization Roots**: Most data (products, staging products, polymorphic entities) are namespaced under an organization's document (`db.collection('organizations').doc(orgId)`).
*   **Transactional Integrity**: Critical operations use Firestore transactions (`db.runTransaction()`) to prevent race conditions. Examples include atomic stock decrementing, stock reservations, and finalizing sales (Phase 7.2).
*   **Batch Writes**: Operations affecting multiple documents (like `commitStagingProducts` and `releaseStock`) use `db.batch()` to ensure atomicity and efficiency.
*   **Dual-Write / Staging Patterns**: 
    *   **Staging Area**: Features like `saveStagingProduct` and `commitStagingProducts` show a robust review workflow where changes are held in a `staging_products` collection before being committed to the live `products` collection.
    *   **Transaction Pipeline**: `ledger.ts` implements a two-step transaction verification process (`pending` -> `success`) to prevent replay attacks and sync with external SMS bridges.
*   **Polymorphic Storage**: `polymorphic.ts` provides a generic interface (`saveEntity`, `queryEntity`) for storing flexible entity structures.

## Key Modules and Directory Structure

*   **`src/db.ts`**: The core Firebase configuration and initialization file. Exports the initialized `Firestore` instance (`db`).
*   **`src/index.ts`**: The unified entry point. Exports the `db` instance and all functions/types from the individual modules.
*   **`src/modules/`**: Contains the domain-specific data access logic.
    *   **`orgs.ts`**: Handles organization lifecycle (active/suspended), MFA codes, and high-security lookups (bridge secrets, admin phones).
    *   **`products.ts`**: Manages the inventory catalog. Handles staging, soft-reservations, final sales, and O(1) indexed queries for low-stock items.
    *   **`ledger.ts`**: Manages financial transactions, duplicate detection, and SMS-based payment confirmations.
    *   **`polymorphic.ts`**: Generic utility for managing diverse entities in tenant-specific sub-collections.
    *   **`auth.ts`**: Handles authentication-related operations and PIN management.
    *   **`chats.ts`**: Manages conversational history and messaging logs.
    *   **`onboarding.ts`**: Contains data logic for the client activation and onboarding workflow.
    *   **`stats.ts` / `fraud.ts` / `billing.ts` / `topup.ts`**: Handle analytics, security flagging, and financial operations.
