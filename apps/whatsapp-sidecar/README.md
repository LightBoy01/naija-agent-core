# WhatsApp Sovereign Sidecar

## 1. Overview and Purpose
The **WhatsApp Sovereign Sidecar** is a high-performance Go-based microservice designed to act as the bridge between the Naija Agent ecosystem and the WhatsApp Web network. Its primary purpose is to autonomously manage multi-tenant WhatsApp sessions efficiently, isolating the heavy WebSocket and cryptography logic from the main Node.js/TypeScript workers. By decoupling the connection layer, this sidecar enables the main AI workers to scale independently and remain stateless, while providing a robust, highly-concurrent WhatsApp session manager.

## 2. Key Technologies
- **Go 1.26**: Core programming language, chosen for its concurrency model and memory efficiency.
- **whatsmeow (`go.mau.fi/whatsmeow`)**: The underlying Go library for interacting with the WhatsApp Web API. It handles protocol-level communications, End-to-End Encryption (E2EE), and WebSocket sessions.
- **PostgreSQL (`github.com/lib/pq`)**: Used as the persistent storage backend for WhatsApp device sessions (via `whatsmeow/store/sqlstore`) and organizational proxy configurations.
- **Redis (`github.com/redis/go-redis/v9`)**: Functions as the fast message broker (implementing the BullMQ job format) for pushing incoming messages to workers, managing distributed state (e.g., Human Locks, Privacy rules), and caching.

## 3. Architecture & Data Flow

The sidecar operates as a **Hybrid Hub**, handling both inbound events from WhatsApp and outbound commands from the internal Naija Agent API.

### Inbound Data Flow (WhatsApp -> Sidecar -> Workers)
1. **Event Listening**: The Manager module listens for events on all connected `whatsmeow` clients.
2. **Message Processing**: Incoming messages are intercepted. The sidecar handles automatic media downloading to a shared filesystem (`/tmp/sidecar-media`) and detects human-intervention commands (e.g., `#pause`, `#resume`, `#mute`, `#optin`).
3. **Queue Publishing**: If a message requires AI processing and is not muted or locked, it is transformed into a `JobData` payload and pushed directly to Redis in **BullMQ format**. It targets either the `whatsapp-queue` (business) or `life-queue` (Aelixxr/masterbot) based on the tenant.

### Outbound Data Flow (Workers -> API -> WhatsApp)
1. **Internal API**: The Sidecar exposes an HTTP API (protected by `X-API-Key`) for outbound operations.
2. **Action Execution**: When the Node.js workers need to send a message, media, or typing indicator, they send an HTTP POST request to the Sidecar API.
3. **Delivery**: The Sidecar retrieves the active `whatsmeow` client for the requested `orgID` and dispatches the action over the WhatsApp WebSocket.

### API Endpoints
- `POST /connect`: Initializes a new WhatsApp connection and returns a QR code for scanning.
- `POST /pair`: Generates an 8-character Pairing Code (OTP) for phone number linking, bypassing QR codes.
- `POST /send`: Sends a plain text message to a specific JID.
- `POST /send-media`: Sends media (image, document, video, etc.) with an optional caption.
- `POST /typing`: Sends a typing presence indicator to a specific JID.
- `GET /download/{mediaId}`: Endpoint for retrieving downloaded media (Currently a placeholder, as media is natively saved to `/tmp/`).

## 4. Core Modules / Directory Structure

- `/api`: Contains the internal HTTP Server (`server.go`). It exposes the RESTful endpoints for connecting devices and sending outbound messages/media. It acts as the command interface for the Node.js workers.
- `/manager`: The heart of the sidecar (`manager.go`). It manages the multi-tenant pool of active `whatsmeow` clients, handles automatic hydration of sessions from the database on startup, implements IP proxy rotation per organization, and processes incoming WebSocket events.
- `/queue`: Contains the Redis publisher logic (`publisher.go`). Responsible for formatting WhatsApp events into BullMQ-compatible jobs, managing human intervention locks (`human_active:` keys), and enforcing privacy rules (muted chats, opt-in contacts).
- `main.go`: The entry point. Initializes logging, connects to PostgreSQL and Redis, spins up the Multi-Tenant Manager, starts the API server, and handles graceful shutdowns.
