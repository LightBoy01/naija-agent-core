# Naija Agent Core Context

## Critical Information
- **Active Gemini Model:** `gemini-2.5-flash` (Verified via `apps/worker/scripts/test-ai.ts` on March 2, 2026).
- **Environment:** Android (Termux).
- **Build Command:** `npm run build --workspaces`

## Recent Changes
- Implemented robust `esbuild` externalization plugin in `scripts/build.js` to fix production crashes.
- Resolved ESM/CJS interop issues for `firebase-admin` in `@naija-agent/firebase`.
- Verified successful deployment of version `1.0.2` on Railway.app.
- Switched from deprecated `gemini-1.5-flash` to `gemini-2.5-flash`.

## Key Files
- `apps/api/src/index.ts`: API entry point (Version 1.0.2 diagnostic logs added).
- `apps/worker/src/index.ts`: Worker entry point (Version 1.0.2 diagnostic logs added).
- `scripts/build.js`: Unified monorepo bundler with automatic dependency externalization.

## Next Steps
- Add `FIREBASE_SERVICE_ACCOUNT` to Railway environment variables.
- Test end-to-end WhatsApp messaging flow in production.
- Implement WhatsApp outbound message sending.
- Test audio processing with `gemini-2.5-flash`.
