# Naija Agent Core - Documentation Logs Index

Welcome to the `docs/logs` directory of the Naija Agent Core project. This directory serves as the definitive historical, technical, and strategic system of record for the platform's evolution. 

## Purpose of the Logs Directory

The logs stored here are not mere application logs; they are detailed developmental chronologies and architectural treatises. The primary purposes of this directory are:
1. **Strategic Documentation:** To record the "why" behind major architectural pivots (e.g., the transition from a monolithic bot to the Twin Engine architecture).
2. **Development Tracking:** To provide a granular, session-by-session breakdown of feature implementations, security hardenings, and infrastructure updates.
3. **Knowledge Retention & Debugging:** To maintain a centralized repository of recurring technical friction points, their root causes, and established solutions to prevent regression (The Master Debug Log).
4. **Production Snapshots:** To capture point-in-time assessments of live production environments, including container health, database states, and AI model routing behaviors.

## How Tracking is Maintained

Tracking within the Naija Agent Core project follows a rigorous, structured approach:
- **Phase & Session Based Logging:** Development is tracked in phases (e.g., Phase 4, Phase 5) and broken down into individual sessions. Each session documents:
  - **Status:** Current completion state.
  - **Actions Taken:** Specific technical implementations.
  - **Self-Assessment:** Evaluation against the project's "Grand Mind Rules" (e.g., Be Proactive, Begin with the End in Mind).
  - **Strategic Value:** The business or architectural impact of the session.
- **Architectural Manifestos:** Major paradigm shifts (like the Twin Engine) receive dedicated files to fully explore the context, problem space, and structural solutions.
- **Master Debugging Register:** Recurring bugs and deployment quirks are classified by domain (Build, Frontend, AI, Deployment) in a living document to speed up future development.
- **Live Reviews:** Scheduled operational snapshots of the VPS, Docker containers, and database metrics are recorded to monitor long-term stability and scaling patterns.

---

## Exhaustive File Breakdown

Below is a detailed index and summary of every file contained within this directory.

### 1. `DEBUG_LOG_SESSION_38.md`
- **Focus:** Resolution of the Master Bot Context Unawareness issue (March 18, 2026).
- **Summary:** Documents a critical bug where the Master Bot hallucinated tool calls (`web_search`) to answer internal knowledge queries, triggering unnecessary PIN authentication locks. 
- **Resolution:** Implemented explicit prompt engineering (`[WISDOM BASE INSTRUCTIONS]`) to force the bot to rely on its context window before attempting restricted tool calls.

### 2. `DEVLOG_PHASE_4.md`
- **Focus:** The Hardening Sprint, Anti-Fraud Expansion, and Project-Aware Intelligence.
- **Key Sessions:** Sessions 23 - 28 (March 9, 2026).
- **Major Implementations:**
  - **Security:** Salted Bcrypt hashing for PINs, 15-minute brute-force lockouts, and dynamic secret lookups per tenant.
  - **Anti-Fraud:** SMS Bridge API for automated bank alert matching and Forensic Vision for receipt forgery detection.
  - **Architecture:** Extraction of the "Universal DNA" (Sector Master Blueprint) to support agnostic business types, Multi-Staff RBAC (Boss vs. Rider/Assistant roles), and Atomic Booking Guards using Firestore transactions.
  - **Strategic Milestone:** Transitioned the platform into a professional-grade, multi-tenant SaaS foundation capable of managing any industry with institutional security.

### 3. `DEVLOG_PHASE_5.md`
- **Focus:** Hardened Scale & Proactivity.
- **Key Sessions:** Sessions 29 - 40 (March 10-11, 2026).
- **Major Implementations:**
  - **Proactivity:** Migrated daily reports and reminders to BullMQ Repeatable Jobs with staggered jitter and Lagos timezone (`date-fns-tz`) normalization to prevent API rate limits.
  - **The Guardian & The Snitch:** Automated system watchtowers that monitor Bridge health and alert the Sovereign via WhatsApp upon background job failures.
  - **The Fortress:** Replaced global keys with Tenant-Scoped Bridge Keys (`x-bridge-secret`) and introduced Auto-Pulse onboarding.
  - **Actionable UI:** Developed the Client Component Appointment Ledger with real-time WhatsApp customer notification upon cancellation via Next.js Server Actions.
  - **Security & Integrity:** Implemented the Deterministic Price Guard (cross-referencing AI prices with DB products), a global Fraud Registry, and strict Forensic AI vision protocols.
  - **Strategic Milestone:** Achieved "Billion-Naira Readiness," transitioning the system into an Automated AI Empire capable of zero-touch merchant onboarding and self-scaling governance.

### 4. `DEVLOG_TWIN_ENGINE.md`
- **Focus:** The Twin Engine Architecture and Dual Identity pivot (Session 41 - March 21, 2026).
- **Context:** Addressed the "Trust Contagion" risk where hallucinations in casual life conversations could destroy user trust in the bot's financial accuracy.
- **Architecture:** 
  - Split the system into a Business OS (`Zynux`) and a Life OS (`Aelixxr`), both sharing a unified core (`Vynux`) and a single digital wallet.
  - **Model Strategy:** Zynux utilizes Gemini 3.1 Flash for fast, transactional accuracy, while Aelixxr uses Gemini 3.1 Pro for empathetic, complex reasoning. 
  - **Billing:** Introduced context-aware billing to deduct credits instantly for cheap tools while requiring confirmation for expensive AI operations.

### 5. `LIVE_REVIEW_2026-06-17.md`
- **Focus:** Real-time production environment snapshot (June 17, 2026).
- **Infrastructure:** Details the Coolify/Docker setup on a Debian 13 VPS, monitoring container uptimes, RAM, and disk usage.
- **Application State:** 
  - Confirms the unified container running Fastify, BullMQ workers, and the Go WhatsApp Sidecar (`whatsmeow`).
  - Analyzes typical WhatsApp connection EOF timeouts and validates AI capability routing (e.g., dynamic shifting to DeepSeek-V4-Flash/Pro and Gemini-3.1-Flash-Lite based on task).
- **Database Status:** Reviews the PostgreSQL `naija_ledger` state, noting 5 active organizations, ongoing active chat sessions, and successful energy refund transactions.

### 6. `MASTER_DEBUG_LOG.md`
- **Focus:** Centralized repository for recurring technical friction points and solutions.
- **Categorized Fixes:**
  - **Build & Environment:** Parsing hidden characters in Firebase Service Accounts, CJS vs. ESM interop tricks (`__dirname` vs. `import.meta.url`), and Monorepo build order requirements.
  - **Type Safety & TS Quirks:** Resolving enum/literal mismatches, Next.js 15 App Router Promise-based props, and switch block-scoping errors.
  - **AI & Tools:** Strategies for Gemini 429 quota exhaustion (tiered fallbacks) and strict backend schema alignment for tool arguments.
  - **Frontend & Dashboard:** Troubleshooting phantom `<Html>` errors, lazy initializing Redis to prevent build-time crashes, and implementing the "Iron Shield" receipt amount verification logic.
  - **Deployment:** Resolving silent Master Bot issues (WABA ID/Subscription API requirements) and TLS connection bugs in Northflank production environments.
