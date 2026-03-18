# Repetitive Error & Debug Log

This log tracks recurring technical friction points and their established solutions to prevent regression and speed up future development.

## 🔄 Build & Environment

### 1. Firebase Service Account Parsing
*   **Issue:** `FIREBASE_SERVICE_ACCOUNT` environment variable contains hidden characters (BOM, ZWSP) or is improperly wrapped in quotes by deployment platforms.
*   **Symptoms:** `JSON.parse` fails with "Unexpected token" error.
*   **Solution:** Use robust cleaning regex `.replace(/[^\x00-\x7F]/g, "")` and look for the first `{` before parsing.
*   **Location:** `packages/firebase/src/index.ts`

### 2. CommonJS vs. ESM Interop
*   **Issue:** The project uses a mix of ESM (packages) and CommonJS (worker/api). `import.meta.url` fails in CJS, and `__dirname` is missing in ESM.
*   **Solution:**
    *   In **CJS**: Use `__dirname` and `__filename` directly.
    *   In **ESM**: Use `fileURLToPath(import.meta.url)` to derive paths.
    *   **Always** include the `.js` extension in relative imports (e.g., `import { x } from './file.js'`) even if the source is `.ts`.

### 3. Monorepo Build Order
*   **Issue:** Changes in `packages/types` or `packages/firebase` are not reflected in `apps/worker`.
*   **Symptoms:** "Type X is not assignable to type Y" errors on types that look correct.
*   **Solution:** Build from the bottom up: `types` ➔ `firebase` ➔ `storage` ➔ `payments` ➔ `worker`.

## 🛡️ Type Safety & TS Quirks

### 1. Enum/Literal Mismatches in Shared Packages
*   **Issue:** Redefining an interface (like `Message`) in two packages leads to "Type A is not assignable to type B" even if they are identical.
*   **Solution:** Strictly import core interfaces from `@naija-agent/types`. Do not redefine them locally in `firebase` or `worker`.

### 2. Unterminated Template Literals in `replace`
*   **Issue:** Using backticks inside backticks in `replace` tool calls often leads to syntax errors if not escaped properly.
*   **Symptoms:** Build fails with `TS1127: Invalid character` or `TS1160: Unterminated template literal`.
*   **Solution:** Be extremely surgical with `replace` context. If the file becomes too complex, use `write_file` to overwrite the whole file with a verified clean version.

## 🤖 AI & Tools

### 1. Gemini 429 Quota Exhaustion
*   **Issue:** `gemini-3.1-flash-lite-preview` has lower quota limits than stable models.
*   **Solution:** Implement a tiered fallback: 
    *   **Tier 1:** 3.1 Flash-Lite (Fast/Free)
    *   **Tier 2:** Flash-Lite Latest (Stable)
    *   **Tier 3:** 2.5 Flash (Ultimate Reliability)

### 2. Price Hallucination
*   **Issue:** AI quotes prices not found in the catalog (e.g., "₦15,000" for an item that is "₦15,500").
*   **Solution:** **Price Guard Protocol**. Use regex to detect all prices in the final response and verify them against the tool outputs (`search_products`) or business knowledge. Redact if unmatched.

## 💻 Frontend & Dashboard

### 1. Next.js Build Fails with `<Html>` Error
*   **Issue:** `Error: <Html> should not be imported outside of pages/_document` appearing in App Router (`app/`) project during `next build`.
*   **Symptoms:** Build crashes on prerendering `/404` or `/_error`.
*   **Root Cause:** Often a phantom error caused by corrupted `.next` cache or interrupted `npm install` processes leaving `node_modules` in an inconsistent state.
*   **Solution:** 
    1. Wipe cache: `rm -rf .next`
    2. Reinstall deps: `npm install`
    3. Build with production env: `NODE_ENV=production npm run build`

### 2. Redis Connection Refused During Static Generation
*   **Issue:** `[ioredis] Unhandled error event: Error: connect ECONNREFUSED` spamming build logs.
*   **Root Cause:** Top-level `new Redis()` initialization in API routes (`app/api/...`) executes immediately when Next.js scans files, trying to connect to a missing local Redis instance.
*   **Solution:** Use **Lazy Initialization**. Wrap the Redis client creation in a singleton function (`getRedis()`) so it only connects when an API request is actually handled, not during build time.

### 3. Next.js App Router Page Props Type Error
*   **Issue:** `Type error: Type '{ params: { id: string; }; }' does not satisfy the constraint 'PageProps'`.
*   **Root Cause:** In Next.js 15+, `params` is a **Promise**, not a plain object.
*   **Solution:** Change the component signature to `async function Page({ params }: { params: Promise<{ id: string }> })` and `const { id } = await params;`.

### 4. Shared Type Import Mismatch (Packages vs. Apps)
*   **Issue:** Build fails because `packages/types` changes aren't reflected in `apps/worker` or `apps/web`.
*   **Symptoms:** "Property X does not exist on type Y" even if you just added it.
*   **Solution:** Rebuild the types package first (`npm run build --workspace=@naija-agent/types`) before building the dependent app. Ensure interfaces are exported in the main `src/index.ts` barrel file.

### 5. ES6 Template Literal ESLint Error
*   **Issue:** `Error: " can be escaped with &quot;`.
*   **Solution:** Replace direct double quotes inside JSX text with `&quot;`.

### 6. TS2451: Cannot redeclare block-scoped variable in Switch
*   **Issue:** `Cannot redeclare block-scoped variable 'attempts'`.
*   **Root Cause:** Two different `case` blocks in a single `switch` statement both defined a variable named `attempts`. In JS/TS, switch cases share the same block scope.
*   **Solution:** Wrap each `case` logic in curly braces `{ }` to create a dedicated block scope for that case.

### 7. The "Iron Shield" Amount Mismatch
*   **Issue:** `verify_transaction` tool accepted a valid bank reference even if the receipt amount was different.
*   **Root Cause:** Logic only checked if the reference existed, not if the value matched.
*   **Solution:** Implement `Math.abs(receiptAmount - bankAmount) < 10` check to enforce financial integrity.

### 8. Gemini Tool Argument Mismatch
*   **Issue:** AI calls a tool with arguments that don't match the backend's expected variable names.
*   **Symptoms:** Tool execution fails or performs partial updates (e.g., `manage_stock` fails to update the correct product).
*   **Root Cause:** The Gemini schema defined `productId` but the backend was looking for `id`.
*   **Solution:** Strictly align backend handler variables with the schema-defined parameter names in `apps/worker/src/tools.ts`.

### 9. Monorepo "Phantom" Build Failures
*   **Issue:** Next.js build fails with "Module not found" even if the package was recently "built".
*   **Root Cause:** The `scripts/build.js` was creating placeholder `dist/` folders instead of actually compiling the TypeScript packages. Next.js was then trying to read these placeholders.
*   **Solution:** Update the build script to perform a real bottom-up `npm run build` for all dependent packages before application bundling.

### 10. HandlerContext Property Mismatch
*   **Issue:** Adding new properties (like `currency`) to `HandlerContext` in `tools/definitions.ts` caused build failures in the main worker loop.
*   **Symptoms:** `error TS2322: Type '{ ... }' is not assignable to type 'HandlerContext'`.
*   **Root Cause:** The worker was passing `org.config || {}` directly, which lacked the core properties required by the new `HandlerContext` interface.
*   **Solution:** Pass the extracted `currency` and `region` explicitly, and use type casting `(org.config || {}) as any` when the config object is incomplete but handled safely within tool logic.

### 11. Missing AI Library Imports in Sub-Handlers
*   **Issue:** Build failed with `TS2304: Cannot find name 'GoogleGenerativeAI'` in `onboarding.ts`.
*   **Root Cause:** The greedy semantic extraction logic added to the onboarding handler used the Gemini SDK but the class was not imported in that specific file.
*   **Solution:** Ensure `import { GoogleGenerativeAI } from '@google/generative-ai'` is present in any handler file utilizing AI extraction.

### 12. Onboarding vs. Messaging Identity Conflict
*   **Issue:** Merchants at the Bank Account setup step stopped receiving replies after the Identity Fix was applied.
*   **Root Cause:** The system correctly identified them as a "Boss," causing the API to route messages to the standard `handleMessage` loop, which ignored the pending onboarding state.
*   **Solution:** Refactor `handleOnboarding` to check the `organization` document's setup state as the primary signal, ensuring the setup flow stays in control until `onboardingStep === 'COMPLETE'`.

### 13. PIN Verification Sensitivity
*   **Issue:** A valid 4-digit PIN (`0101`) was rejected by the system during verification.
*   **Root Cause:** Hidden whitespace or formatting characters in the WhatsApp text input caused the `bcrypt.compare` to fail against the clean hash.
*   **Solution:** Implement mandatory `.trim()` on all PIN inputs before hashing and before verification.
