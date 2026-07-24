# @naija-agent/types

## Overview and Purpose (Foundation)
The `@naija-agent/types` package serves as the foundational source of truth for the entire Naija Agent Core monorepo. It centralizes all data models, Zod schemas, TypeScript interfaces, and system-wide configurations (such as model routing, financial costs, and limits). By keeping all types and schemas in a single dedicated package, it ensures strict type safety and consistency across the diverse components of the architecture, including the API Gateway, AI Workers, Go Sidecars, and frontend dashboards. 

This package is critical for preventing runtime errors and ensuring that API requests, background jobs (BullMQ), and database operations (Firestore/PostgreSQL) conform to expected structures.

## Key Dependencies
- **`zod`**: Used extensively for runtime schema validation. All major data structures coming from webhooks, queues, or databases are validated against Zod schemas.
- **`@google/genai`**: Provides typing for AI tools and generation, specifically utilized in the Sector Pack configurations.
- **`libphonenumber-js`**: Utilized for E.164 phone number normalization and validation.

## Core Types, Schemas, & Utilities

### 1. Zod Validation Schemas (`src/index.ts`)
- **WhatsApp Webhook Schemas**: `WhatsAppMessageSchema` and `WhatsAppWebhookSchema` rigorously validate incoming payloads from Meta to prevent malformed data from crashing the workers.
- **Organization & Tenant Schemas**: `OrganizationSchema`, `ConfigSchema`, `PaymentConfigSchema`, and `BankDetailsSchema` model the tenant data stored in the database.
- **Operational Schemas**: `ActivitySchema`, `StaffSchema`, and `EntitySchema` handle the modeling of system operations.

### 2. TypeScript Interfaces (`src/interfaces/index.ts`)
- **System Internals**: `JobData` (BullMQ job structures), `Message`, `Chat`, and `TransactionData` for system-wide internal message passing and state management.
- **Aeliixr (Life OS)**: Schemas dedicated to the Sovereign Financial Manager and Life OS, such as `LifeContext` (user profile, academic status, vault balance), `VaultAuditLog`, and `LifeUserProfile`.

### 3. Sector Packs (`src/sector.ts`)
Defines the **Sector Agnostic Architecture** (Phase 8.3) which allows the system to scale across different industries dynamically.
- `EntityDefinitionSchema` & `WorkflowDefinitionSchema`: Abstract definitions for data entities and state transitions.
- `SectorPack` Interface: A contract for bundling industry-specific AI Prompts, Tools, and Execution Logic (e.g., Commerce vs. Health).

### 4. System Configuration Constants (`src/config/index.ts`)
A central `SystemConfig` object containing:
- **`MODELS`**: Configuration for AI model routing (e.g., Zynux Primary: `deepseek-v4-flash`, Router: `gemini-3-flash-preview`).
- **`COSTS`**: Financial definitions in Kobo for platform operations (e.g., reply costs, tool execution costs, Life OS interactions).
- **`LIMITS` & `DEFAULTS`**: Defines rate limits, token constraints, timeouts, and default geographical data (e.g., `Africa/Lagos`, `NGN`).

## Key Modules / Directory Structure

```text
packages/types/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # Main entrypoint, centralized Zod schemas (WhatsApp, Org, Config)
    ├── sector.ts         # Sector Pack interface & Entity/Workflow definitions
    ├── config/
    │   ├── index.ts      # SystemConfig (Costs, Models, Limits, Contacts)
    │   └── prompts.ts    # Centralized base AI prompts (e.g., Onboarding)
    ├── interfaces/
    │   └── index.ts      # TypeScript interfaces (JobData, LifeContext, Chat, etc.)
    ├── utils/            # Shared utilities for formatting/validation
    │   ├── phone.ts      # E.164 Phone normalization utilities
    │   └── currency.ts   # Multi-currency and Kobo-to-Naira logic
    └── gemini/           # Legacy/Empty directory reserved for specific GenAI extensions
```
