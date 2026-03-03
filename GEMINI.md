# Naija Agent Core Context

## Critical Information
- **Active Gemini Model:** `gemini-2.5-flash` (Verified via `apps/worker/scripts/test-ai.ts` on March 2, 2026).
- **Environment:** Android (Termux).
- **Build Command:** `npm run build --workspaces`

## Recent Changes
- Updated `@google/generative-ai` to latest version in `apps/worker`.
- Switched from deprecated `gemini-1.5-flash` to `gemini-2.5-flash`.
- Verified Pidgin English capabilities with test script.

## Key Files
- `apps/worker/src/index.ts`: Main worker logic using Gemini.
- `apps/worker/scripts/test-ai.ts`: Verified script for testing AI integration.
- `apps/worker/scripts/list-models.ts`: Utility to list available Gemini models.

## Next Steps
- Implement WhatsApp outbound message sending.
- Test audio processing with `gemini-2.5-flash`.
