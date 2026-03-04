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

# SAFETY CHECK: Fail the build if the artifact is missing
# This guarantees that the container will never be created if the build failed silently
RUN ls -la apps/api/dist/index.js || (echo "❌ CRITICAL ERROR: apps/api/dist/index.js was NOT created!" && ls -R apps && exit 1)
RUN ls -la apps/worker/dist/index.js || (echo "❌ CRITICAL ERROR: apps/worker/dist/index.js was NOT created!" && ls -R apps && exit 1)

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy everything from builder (including the verified dist folder)
COPY --from=builder /app ./

# Default command (can be overridden by docker-compose or Railway)
CMD ["npm", "run", "start:api"]
