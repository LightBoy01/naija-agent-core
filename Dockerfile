# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Monorepo optimization: Install ALL dependencies for building
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY packages/firebase/package.json packages/firebase/
COPY packages/types/package.json packages/types/
COPY packages/payments/package.json packages/payments/
COPY packages/storage/package.json packages/storage/
COPY packages/logistics/package.json packages/logistics/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/

# Pre-create dist folders to satisfy monorepo links before build
RUN mkdir -p packages/firebase/dist packages/types/dist packages/payments/dist packages/storage/dist packages/logistics/dist
RUN touch packages/firebase/dist/index.js packages/types/dist/index.js packages/payments/dist/index.js packages/storage/dist/index.js packages/logistics/dist/index.js

# Install dependencies
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build all bundled apps
RUN npm run build

# Stage 2: Production Runner (Lean)
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Only copy necessary files from builder
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Install ONLY production dependencies (no devDeps, no TS needed for bundled CJS)
RUN npm ci --omit=dev

# SAFETY CHECK
RUN ls -la apps/api/dist/index.js && ls -la apps/worker/dist/index.js

CMD ["npm", "run", "start:api"]
