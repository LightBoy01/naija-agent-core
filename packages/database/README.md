# `@naija-agent/database`

## 1. Overview and Purpose
The `@naija-agent/database` package serves as the core data persistence and access layer for the Naija Agent ecosystem. It acts as a specialized module providing type-safe PostgreSQL database operations using [Drizzle ORM](https://orm.drizzle.team/). This package encapsulates connection management, schema definitions, and domain-specific query operations, enabling decoupled and scalable data access across the monorepo architecture.

## 2. Key Dependencies
This package relies on modern and high-performance tools in the Node.js database ecosystem:
- **`drizzle-orm`**: Provides a type-safe SQL wrapper and ORM capabilities.
- **`drizzle-kit`**: Used for schema migrations and synchronizing the schema with the PostgreSQL database.
- **`postgres`**: The underlying Postgres.js client, known for being fast and native to Node.js.
- **`pgvector`** (Database-level): Exploited within the schema via custom types to store and query high-dimensional embeddings for semantic search capabilities.
- **`cron-parser`**: A utility used for parsing and validating cron expressions, especially within the autonomous cron jobs module.

## 3. Core Architecture & Schemas
The database relies on PostgreSQL and incorporates `pgvector` for semantic search and AI retrieval capabilities. The architecture is modularly split across multiple tables representing the core domains of the ecosystem.

### Key Schema Entities:
- **`organizations` & `users`**: Manages tenants (B2B) and life OS users (B2C), handling configurations, vault balances, and onboarding states.
- **`transactions` & `energyLedger`**: Immutable financial ledgers handling top-ups, deductions, commissions, and energy credit tracking.
- **`chats` & `messages`**: Stores conversation state and history. The `messages` table utilizes `pgvector` (`embedding` column) for semantic search across message histories.
- **`memories` & `vaultDocuments`**: Core components for the RAG (Retrieval-Augmented Generation) pipeline. These tables also employ `pgvector` (`embedding` column) to support high-scale vector searches and document extraction.
- **`products` & `activities` & `cartItems`**: E-commerce and operations catalogs for organizations.
- **`cronJobs` & `heartbeats`**: Infrastructure for the autonomous Sovereign capabilities (scheduled agents, polling tasks).
- **`referrals`**: Tracks partner referral links, active durations, and accrued commissions.
- **`fraudRegistry`**: A global scam-shield for blacklisting numbers using SHA-256 phone hashing.

## 4. Key Modules & Directory Structure
The package is designed with domain-driven operations. All schema definitions are centralized, but queries and updates are split logically.

```text
packages/database/
├── src/
│   ├── index.ts              # Main entry point exporting the database client, schemas, and queries.
│   ├── db.ts                 # Initializes the PostgreSQL connection and exposes core transaction helpers (e.g., `topupOrg`).
│   ├── schema.ts             # Centralized Drizzle ORM table schemas and custom type definitions (like `vector`).
│   ├── organizations.ts      # Queries and mutations regarding tenants, onboarding, referrals, and MFA.
│   ├── chat.ts               # Operations handling conversations, message ingestion, and cart interactions.
│   ├── products.ts           # Commerce logic, stock management, and product catalog interactions.
│   ├── cron.ts               # Sovereign cron job management, state updates, and interval scheduling.
│   ├── knowledge.ts          # RAG rule management.
│   ├── activities.ts         # Bookings and waybill operations.
│   ├── fraud.ts              # Interactions with the global fraud registry.
│   ├── stats.ts              # Network and organizational metric aggregations.
│   └── logs.ts               # System auditing and event logging.
├── drizzle.config.ts         # Configuration for `drizzle-kit` to handle schema generation and pushes.
└── package.json              # Package metadata and scripts (build, generate, push).
```

### Usage Example
```typescript
import { getDb, organizations, getActiveOrganizations } from '@naija-agent/database';

// Direct Query
const db = getDb();
const orgs = await db.select().from(organizations);

// Via Domain Helpers
const activeOrgs = await getActiveOrganizations();
```
