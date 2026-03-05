# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# CRITICAL: Ensure we are in development mode so devDependencies (TypeScript, esbuild) are installed
ENV NODE_ENV=development

# Copy package management files first for better caching
COPY package.json package-lock.json ./
COPY packages/firebase/package.json packages/firebase/
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build all workspaces via BUNDLING
# We use node to run the script because esbuild is installed as a devDependency
RUN node scripts/build.js

# SAFETY CHECK: Fail the build if any artifact is missing
RUN ls -la apps/api/dist/index.mjs || (echo "❌ CRITICAL ERROR: apps/api/dist/index.mjs was NOT created!" && ls -R apps && exit 1)
RUN ls -la apps/worker/dist/index.mjs || (echo "❌ CRITICAL ERROR: apps/worker/dist/index.mjs was NOT created!" && ls -R apps && exit 1)

# --- Single Stage for Debugging ---
# We keep this single stage for now to ensure all dependencies (node_modules) are available
# Since we bundled local packages, we don't strictly need symlinks for them, but we need node_modules for external deps
ENV NODE_ENV=production

# Default command (can be overridden by docker-compose or Railway)
CMD ["npm", "run", "start:api"]
