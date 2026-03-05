# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# CRITICAL: Ensure we are in development mode so devDependencies (TypeScript) are installed
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

# Build all workspaces
RUN npm run build

# SAFETY CHECK: Fail the build if any artifact is missing
RUN ls -la packages/types/dist/index.js || (echo "❌ CRITICAL ERROR: packages/types/dist/index.js was NOT created!" && ls -R packages && exit 1)
RUN ls -la packages/firebase/dist/index.js || (echo "❌ CRITICAL ERROR: packages/firebase/dist/index.js was NOT created!" && ls -R packages && exit 1)
RUN ls -la apps/api/dist/index.js || (echo "❌ CRITICAL ERROR: apps/api/dist/index.js was NOT created!" && ls -R apps && exit 1)
RUN ls -la apps/worker/dist/index.js || (echo "❌ CRITICAL ERROR: apps/worker/dist/index.js was NOT created!" && ls -R apps && exit 1)

# --- Single Stage for Debugging ---
ENV NODE_ENV=production

# Default command (can be overridden by docker-compose or Railway)
CMD ["npm", "run", "start:api"]
