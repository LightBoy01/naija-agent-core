# NaijaAgent Core

A multi-tenant, audio-first WhatsApp AI Agent platform built for the Nigerian market.

## Documentation
*   [Product Requirements (PRD)](docs/PRD.md)
*   [Architecture & Stack](docs/ARCHITECTURE.md)
*   [Setup Guide](docs/SETUP_GUIDE.md)

## Quick Start
1.  Install dependencies: `npm install`
2.  Setup `.env` (see Setup Guide).
3.  Run development server: `npm run dev`

## Architecture
*   **Webhook Service:** Fastify server handling WhatsApp callbacks.
*   **Worker Service:** BullMQ worker processing AI logic.
*   **Database:** PostgreSQL + pgvector (Supabase).
