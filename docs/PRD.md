# Product Requirement Document (PRD)
## Project Name: NaijaAgent Core
### Version: 1.0.0
### Date: February 28, 2026

## 1. Executive Summary
NaijaAgent Core is a multi-tenant, AI-powered WhatsApp agent platform tailored for the Nigerian market. It leverages cost-effective Large Language Models (LLMs) and a robust task queue architecture to provide scalable, latency-tolerant, and audio-first customer support and business automation.

## 2. Problem Statement
*   **High Cost of existing solutions:** US-based AI agents (OpenAI, Twilio) are too expensive for Nigerian SMEs.
*   **Latency & Reliability:** Standard webhooks timeout on slow networks or heavy AI processing.
*   **Language Barrier:** Most bots fail at understanding Nigerian Pidgin and Voice Notes.
*   **Rigidity:** Existing chatbots are rule-based and cannot perform business actions (e.g., check inventory).

## 3. Core Features

### 3.1 Multi-Tenancy (SaaS)
*   Single engine serving multiple organizations.
*   Routing based on `display_phone_number` or unique identifiers in the webhook.
*   Per-tenant configuration (System Prompts, API Keys, Tool Definitions).

### 3.2 AI Intelligence
*   **Model:** Google Gemini 1.5 Flash (via AI Studio/Vertex AI).
*   **Capabilities:** 
    *   Text-to-Text generation.
    *   **Audio-to-Text (Native):** Process voice notes directly without separate transcription costs.
    *   **Function Calling:** Execute backend code based on user intent (e.g., `check_order_status`, `book_appointment`).

### 3.3 Audio-First Experience
*   Seamless handling of WhatsApp Voice Notes (OGG/AAC).
*   Contextual understanding of Nigerian Pidgin and local slang.

### 3.4 Robust Architecture
*   **Asynchronous Processing:** Webhooks are acknowledged immediately; processing happens in a background queue.
*   **State Management:** Redis for short-term conversational context; PostgreSQL for long-term business data.

## 4. User Stories
*   **As a Logistics Company:** I want the bot to answer "Where is my package?" by checking my SQL database, even if the user asks in Pidgin voice note.
*   **As a Real Estate Agent:** I want the bot to qualify leads and schedule viewings on my Google Calendar.
*   **As a Platform Admin:** I want to onboard a new business by adding a config row in the database, without deploying new code.

## 5. Success Metrics
*   **Cost per Conversation:** < ₦10.
*   **Webhook Success Rate:** 99.9% (No timeouts).
*   **Audio Processing Latency:** < 5 seconds.
*   **Concurrent Chats:** Support for 1,000+ concurrent active sessions per node.
