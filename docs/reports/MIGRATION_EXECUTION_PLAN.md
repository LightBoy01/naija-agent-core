# Migration Execution Plan: The Great Firebase Purge (Phase 11)

## Overview
This plan outlines the final, zero-dataloss migration from the legacy Firebase Firestore database to the new Drizzle ORM PostgreSQL architecture. Once complete, the system will no longer suffer from "Split Brain" data desynchronization and will run as a pure Sovereign node.

## Phase 1: Schema Finalization
Before moving any data, we must ensure the PostgreSQL schema can hold all legacy data.
1. **Products & Activities**: Ensure `products` and `activities` tables are either explicitly created in `@naija-agent/database/src/schema.ts` or mapped into a polymorphic JSONB column under the `organizations` table.
2. **Push Schema**: Run `npm run push` in `packages/database` to execute the Drizzle schema sync on the live Postgres container.

## Phase 2: ETL Script Development
Create a one-off script: `scripts/maintenance/migrate-firebase-to-pg.ts`.
This script will:
1. Connect to both `firebase-admin` and `drizzle-orm`.
2. Extract all documents from the `organizations`, `products`, `knowledge`, and `activities` Firestore collections.
3. Transform the NoSQL JSON into the strongly-typed Drizzle relational models.
4. Batch `INSERT` into PostgreSQL using transaction blocks.

## Phase 3: The Maintenance Window (Zero Data Loss)
This phase requires a temporary halt to incoming traffic to prevent data drift during the migration.
1. **Halt Sidecar & API**: SSH into the VPS and stop the unified app container:
   ```bash
   docker stop app-pygxhjcfuy92zy8e31c8pn7l-093131451306
   ```
2. **Execute ETL**: Run the `migrate-firebase-to-pg.ts` script.
3. **Validate Data**: Check row counts. (e.g., `SELECT count(*) FROM organizations;` matches Firebase).

## Phase 4: Codebase Cutover (The Purge)
With data safely in Postgres, we severe all ties with Firebase in the logic.
1. Remove `@naija-agent/firebase` dependencies from `apps/worker`, `apps/worker-life`, and `apps/web`.
2. Replace all Firestore CRUD operations (like `getOrgById`, `saveProduct`) with their `packages/database` Drizzle equivalents.
3. Fix the **Sidecar Hydration Bottleneck** (`Vulnerability 2`): Update the Sidecar startup logic to pull the routing map dynamically from Postgres.

## Phase 5: Re-deployment
1. Commit the code changes and push to GitHub.
2. Coolify will detect the changes, rebuild the `Polyglot Builder` Docker image, and restart the containers.
3. Verify that the AI agents, API webhooks, and the Go Sidecar are functioning smoothly.
