# Naija Agent Core - Web (Sovereign Command Center)

Welcome to the `web` application for **Naija Agent Core**. This package serves as the **Hybrid Hub** (Back-Office) for the platform, functioning as the central nervous system for operations, monitoring, and financial management.

## 1. Overview and Purpose

The `web` app is a Next.js-based web interface designed to provide distinct administrative controls over the Naija Agent platform. It effectively divides access into two major planes:

- **Sovereign (Master) Plane**: The ultimate control center for the platform operator. It provides high-level overviews of all organizations, autonomous queues, platform-wide AI behavior, and global metrics. 
- **Tenant (Merchant/Boss) Plane**: The operational dashboard for individual business owners using the Naija Agent system to track their specific inventory, AI-led WhatsApp chats, localized analytics, and ledger configurations.

## 2. Key Technologies

This application is built with modern, high-performance tooling:

- **Framework**: [Next.js (App Router, v15+)](https://nextjs.org/) for robust Server-Side Rendering (SSR), Server Components, and API routing.
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) for rapid, utility-first styling.
- **AI Integration**: [Vercel AI SDK (`ai`)](https://sdk.vercel.ai/) & `@google/genai` to manage LLM interactions directly within the interface (e.g., in the Playground).
- **Data & State**: 
  - `@naija-agent/database` (PostgreSQL/Drizzle ORM) and `@naija-agent/firebase` for persistent data.
  - `bullmq` and `ioredis` for direct queue introspection and management.
- **UI Components**: Employs `lucide-react` for iconography, `recharts` for charting, and `sonner` for toast notifications.

## 3. Architecture

### Routing & Middleware

The App Router (`app/`) architecture strictly segregates sovereign and tenant logic. Protection is enforced at the edge via `middleware.ts`:

- **Sovereign Protection**: Paths like `/dashboard`, `/vault`, `/chats`, and `/settings` require a valid `sovereign_session` cookie. If not present, the user is redirected to the sovereign `/auth` route.
- **Tenant Protection**: Paths matching `/dashboard/[id]` require a valid `tenant_session` cookie containing an `orgId` that matches the requested route, preventing cross-tenant data leakage. If invalid, the user falls back to `/login`.

### Authentication (`lib/auth.ts`)

- `verifySovereignSession()`: Ensures the actor is the Master.
- `verifyTenantSession(requestedOrgId)`: Validates the tenant and explicitly prevents cross-tenant access during data fetching and API calls.

## 4. Core Directory Structure & Pages

The `app/` directory powers the file-system-based routing:

- **`/auth`**: The secure gateway for the Sovereign (Master), including MFA workflows.
- **`/login`**: The entry point for Tenants (Merchants) to access their organization dashboard.
- **`/dashboard`**: 
  - *Sovereign View (`/dashboard/page.tsx`)*: Overview of system health, active queues, and organizations.
  - *Tenant View (`/dashboard/[id]`)*: The merchant's specific dashboard reflecting their ledger and chat data.
- **`/chats`**: Live interface for inspecting and taking over automated customer interactions.
- **`/vault`**: Sovereign Financial System view, showing aggregate and individual tenant balances, airtime/data vending usage, and platform commission.
- **`/autonomy` & `/playground`**: Interfaces for configuring and testing the underlying Aelixxr and Zynux LLM prompts and behaviors.
- **`/api`**: Backend endpoints serving the frontend:
  - `/api/aelixxr`: Interaction with the core financial/logical orchestrator.
  - `/api/media`: Proxy handling media (e.g., syncing temporary images from the Go WhatsApp sidecar).
  - `/api/onboarding`: Tenant setup APIs.
- **`components/`**: Reusable React components specifically tailored for the dashboard (e.g., QR scanners, embedded signup forms, charts).
- **`lib/`**: Contains utility functions, auth verifiers, and Redis/BullMQ queue instances (`queue.ts`).

## Getting Started

To run the Next.js application locally:

```bash
npm run dev
# or in the root directory via turbo:
npx turbo run dev --filter=web
```

The app will be accessible at `http://localhost:3000`. Ensure that Redis is running and environmental variables (`.env.local`) correctly point to your local PostgreSQL and Redis instances.
