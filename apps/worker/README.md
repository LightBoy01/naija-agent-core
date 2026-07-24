# Zynux Business Worker (`@naija-agent/worker`)

## 1. Overview and Purpose

The **Zynux Business Worker** is the core asynchronous background processor for the Naija Agent platform. It is designed to handle message processing, business logic execution, and AI orchestration off the critical path of the main API gateway. 

Operating primarily via a BullMQ job queue (consuming from `whatsapp-queue`), the worker acts as the "brain" of the Sovereign Financial System and Hybrid Hub. It ingests WhatsApp events, routes them through a secure interceptor pipeline, resolves contextually rich AI prompts, and leverages a dynamic capability router to generate actions and responses for users, staff, and system administrators.

## 2. Key Technologies

- **TypeScript / Node.js**: Core language and runtime.
- **BullMQ & ioredis**: High-performance, Redis-backed job queuing system used for consuming WhatsApp messages, scheduling reminders, and running cron-style background tasks.
- **@google/genai & @naija-agent/ai**: Powers the underlying AI logic, utilizing a Dynamic Capability Router that directs tasks to appropriate models (like Gemini Pro/Flash) depending on the job.
- **Drizzle ORM / PostgreSQL & Firebase**: Mixed database strategy transitioning towards PostgreSQL for robust transactions while keeping legacy compatibility for specific operations.
- **Pino**: High-performance, low-overhead logging.
- **Internal Packages**: Relies heavily on decoupled monorepo packages like `@naija-agent/types`, `@naija-agent/payments`, `@naija-agent/database`, and `@naija-agent/storage`.

## 3. Architecture

### The Message Interceptor Pipeline
To ensure scalability, security, and O(1) domain logic organization, the worker processes every standard incoming message through the **Message Pipeline** (defined in `src/pipeline/`). This acts as an extensible middleware chain.

The pipeline executes sequentially:
1. `OrgLoadInterceptor` (Loads organization data)
2. `ReferralInterceptor` (Tracks referrals)
3. `FeedbackInterceptor`
4. `MediaInterceptor` (Parses and manages incoming images/audio)
5. `SpamInterceptor`
6. `RateLimitInterceptor` (Ensures fair usage)
7. `FraudInterceptor` (AI forensic analysis of receipts/transactions)
8. `SecurityInterceptor`
9. `MfaInterceptor` (Handles Multi-Factor Authentication/PIN drops)
10. `BillingInterceptor` (Manages Energy Credits and billing state)

If an interceptor identifies an issue (e.g., rate limit exceeded or invalid PIN), it sets a `shortCircuit` flag. The pipeline immediately halts, skips the AI handler, and directly returns a pre-configured response to the user. This creates a highly secure **Iron Shield** against abuse.

### Triad Prompt Resolution
The worker dynamically builds AI prompts using a **Triad Architecture** for maximum context awareness before hitting the LLM (in `src/handlers/messaging.ts`):
1. **Global Protocol**: The overarching Zynux soul and baseline behavioral constraints (`Zynux.Soul.md`).
2. **Persona Prompt**: Determines the agent's role (Customer Agent, Staff Agent, Master Agent, Dispatcher, or Demo Sandbox).
3. **System Context**: Injects highly dynamic variables natively, such as the exact UNIX timestamp, local organization timezone, local currency (e.g., NGN/₦), Demo status, Admin lock status, and real-time Business Knowledge fetched from the database.

## 4. Core Modules & Directory Structure

- **`src/index.ts`**: The main entry point. Initializes the BullMQ worker, hydrates Sidecar mappings into Redis, sets up the Message Pipeline, and orchestrates job dispatching (differentiating between cron tasks and standard messaging).
- **`src/handlers/`**: The domain logic execution layer.
  - `messaging.ts`: The primary AI interaction handler. Implements Triad Prompt Resolution, manages chat history, handles Demo Mode escapes, and interacts with the AI orchestrator.
  - `onboarding.ts`: Handles specialized flows for organizations that are partially set up or newly registered.
  - `reminders.ts`: Executes scheduled jobs like abandoned cart recovery (`hourly-cart-recovery`), inventory cleanup, and automated proactive nudges.
  - `reporting.ts`: Logic for generating daily sales and master system reports.
  - `system.ts`: System-level outbound handlers (e.g., OTP delivery, template messages).
- **`src/pipeline/`**: Contains the pipeline orchestrator (`index.ts`) and the `interceptors/` directory implementing the secure middleware chain.
- **`src/tools/`**: Tool definitions and handlers provided to the AI via Function Calling (e.g., `commerce.ts`, `inventory.ts`, `admin.ts`). Tools are strictly typed and heavily audited for PIN protection.
- **`src/sectors/`**: Houses the dynamic `sectorPack` plugin system. Allows the worker to hot-load specialized domain logic (e.g., specific rules for the `commerce` or `health` sectors) without altering core code.
- **`src/services/`**: Integration layers for external services, such as the `WhatsAppService` (interacting with the Go WhatsApp Sidecar or Meta Cloud API), `PriceGuard`, and the `promptService`.
- **`src/utils/`**: Shared helpers (currency parsing, logging, timezone formatting).
