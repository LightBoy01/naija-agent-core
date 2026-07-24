# @naija-agent/ai

## 1. Overview and Purpose
The `@naija-agent/ai` package is the central AI abstraction layer for the Naija Agent Core ecosystem. Its primary purpose is to provide a unified, provider-agnostic interface for interacting with various Large Language Models (LLMs).

Instead of hardcoding models into the application logic, this package introduces a **Capability-Based Dynamic Router** (`AIOrchestrator`). The orchestrator dynamically routes tasks to the most cost-effective and capable model based on the specific intent of the request—such as reasoning, tool-calling, audio processing, or vision analysis. This architecture ensures high availability through automatic failovers, optimizes API costs, and allows seamless integration of new AI models (e.g., DeepSeek, Qwen) without changing the upstream application code.

## 2. Key Dependencies
This package is built as a strongly-typed ECMAScript Module (ESM) for Node.js and relies on the following key dependencies:
- **`@google/genai` (^2.7.0)**: The Universal SDK for interacting with Google's Gemini models (e.g., Gemini 3 Flash, Gemini 3.1 Pro).
- **`openai` (^4.28.0)**: The official OpenAI SDK, utilized not only for OpenAI but also as a client for OpenAI-compatible endpoints like Alibaba DashScope (Qwen) and DeepSeek API.
- **`@naija-agent/types` (*)**: Shared internal type definitions for the monorepo to ensure strong type safety across all unified interfaces.

## 3. Core Architecture & Logic (AI Orchestrator)
The architecture decouples the application's AI intent from the underlying provider implementations. 

### AI Model Abstractions
The package standardizes all interactions through common interfaces (`AIMessage`, `AIOptions`, `AIResponse`, `AIProvider`). Applications never interact with provider-specific types.
- **Gemini**: Supported via `@google/genai`.
- **DeepSeek**: Supported via the OpenAI client, providing advanced reasoning and data processing capabilities.
- **Qwen (DashScope)**: Supported via the OpenAI client in compatible mode, primarily for audio-in tasks.

### Dynamic Routing Logic (`AIOrchestrator`)
The `AIOrchestrator` implements the `AIProvider` interface but acts as a smart proxy. When `orchestrator.chat()` is invoked:
1.  **Intent Detection**: It analyzes the request payload to determine the required `ModelSkill` (`reasoning`, `tool-calling`, `audio-in`, `vision-in`, etc.). For example, if tools are provided, it requires `tool-calling`. If audio files are attached, it requires `audio-in`.
2.  **Model Selection**: It filters the `GlobalModelRegistry` for models possessing the required skill. It then sorts these capable models by their `costProfile` (from `ultra-low` to `high`). By default, it selects the cheapest capable model unless a `high` cost profile or a specific `fallbackModelOverride` is requested.
3.  **Execution & Failover (`executeWithFailover`)**: The orchestrator attempts execution. If a provider returns a transient error (e.g., `429 Too Many Requests`, `503 Service Unavailable`, or `Quota Exhausted`), it catches the error and automatically falls back to the next available capable model in the sorted list.
4.  **Embeddings Bypass**: Text embedding requests bypass the standard chat routing logic and are handled explicitly (defaulting to Gemini).

## 4. Key Modules/Directory Structure
- **`src/index.ts`**: The entry point. Exports all core standard interfaces (`AIMessage`, `AIResponse`, `AIOptions`, `AIProvider`).
- **`src/registry.ts`**: The declarative configuration (`GlobalModelRegistry`) that defines available models (e.g., `gemini-3-flash-preview`, `deepseek-v4-pro`, `qwen3-omni-flash-realtime`), their capabilities (`skills`), API endpoint configurations, and `costProfile`.
- **`src/factory.ts`**: Contains the `AIFactory`, a connection manager that instantiates provider wrappers on-demand and caches them to prevent memory leaks and optimize connection pooling.
- **`src/orchestrator.ts`**: Contains the `AIOrchestrator`, responsible for capability-based routing and failover logic.
- **`src/providers/`**: Contains the concrete wrappers implementing the `AIProvider` interface:
  - `gemini.ts`: Native integration with `@google/genai`.
  - `openai.ts`: Integration with the official `openai` Node package for DeepSeek and others.
  - `dashscope.ts`: Specialized wrapper for Alibaba's DashScope API (Qwen), utilizing OpenAI compatibility mode.
