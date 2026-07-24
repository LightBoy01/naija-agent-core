# Naija Agent Core - API Service

## Overview and Purpose

The `api` package is a Fastify-based Node.js service that acts as the primary ingress Gateway for the Naija Agent ecosystem. It acts as a webhook receiver, cron job trigger, and outbound messaging interface. 

Instead of processing complex business logic synchronously, the API acts as a high-performance router. It securely ingests events (e.g., from WhatsApp or payment gateways like Paystack and Monnify), verifies signatures, and pushes structured `JobData` payloads into Redis-backed queues (`BullMQ`). These queues are then processed asynchronously by background worker nodes (e.g., Zynux or Aelixxr).

## Key Technologies/Dependencies

- **Fastify:** High-performance web framework used for routing and handling HTTP requests.
- **BullMQ & ioredis:** Used for managing background job queues (`whatsapp-queue`, `life-queue`) backed by Redis.
- **Pino:** For structured, high-performance logging, configured with automatic redaction of sensitive headers and query parameters.
- **Internal Packages:** heavily relies on shared Monorepo packages:
  - `@naija-agent/database`: For database interactions (PostgreSQL/Firestore).
  - `@naija-agent/types`: For shared Zod schemas, TypeScript types, and utilities.
  - `@naija-agent/payments`: For interacting with payment providers (Paystack, Monnify).
  - `@naija-agent/firebase`: For legacy Firebase operations.

## Architecture & Data Flow

### 1. Webhooks (`/webhook`)
The API exposes endpoints to receive real-time events:
- **WhatsApp Webhooks:** Validates the `X-Hub-Signature-256`, parses incoming WhatsApp messages (text, audio, images), checks user opt-in/out status, handles rate limiting, and queues the message. Messages intended for `aelixxr` are routed to the `life-queue`, while others (e.g., `zynux`) go to the `whatsapp-queue`.
- **Payment Webhooks:** Handles events from Paystack (`/webhook/paystack`), Monnify (`/webhook/monnify`), and PocketFi (`/webhook/pocketfi`). It verifies cryptographic signatures, processes successful top-ups/vault deposits via the database, handles dispute tracking, and dispatches notification jobs to the WhatsApp queue.

### 2. Queues (BullMQ)
The API does not perform heavy processing. Instead, it enqueues tasks:
- `whatsapp-queue`: Handles core business logic, outbound messaging, and general WhatsApp processing.
- `life-queue`: Dedicated to the "Aelixxr" sovereign life companion processing.

### 3. Cron Jobs (`/cron`)
Proactive tasks are triggered via protected HTTP GET endpoints (secured with an `x-cron-secret` header). These include:
- `/cron/daily-reports`: Generates daily reports for active organizations.
- `/cron/cart-recovery`: Triggers hourly cart recovery workflows.
- `/cron/reminders`: Scans for and sends appointment reminders.
- `/cron/release-abandoned-locks`: Automatically clears ghost locks on carts abandoned for over 2 hours.
- `/cron/referral-settlement`: Settles matured referral bonuses.
- `/cron/sovereign-tick` & `/cron/life-heartbeat`: Background tasks for Hermes and Aelixxr.

### 4. Agent Discovery & Sidecar Proxy
- `/network/search`: An endpoint that queries the database to discover agents/organizations based on sectors and capabilities.
- `/sidecar/connect`: Proxies connection requests to a local Go-based WhatsApp sidecar running on port 8080.

## Core Modules/Directory Structure

```text
apps/api/
├── src/
│   ├── index.ts           # Application entry point, Fastify initialization, Redis config, and global hooks.
│   ├── routes/
│   │   ├── crons.ts       # Definitions for all scheduled cron-triggered endpoints.
│   │   └── webhooks.ts    # Logic for processing incoming webhooks (WhatsApp, Paystack, Monnify, PocketFi) and `/send`.
│   └── utils/
│       └── currency.ts    # Helper utilities for formatting currency values.
├── package.json           # Dependencies and scripts (build, dev, start).
└── tsconfig.json          # TypeScript configuration.
```
