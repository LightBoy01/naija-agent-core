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
COPY apps/worker-life/package.json apps/worker-life/

# Pre-create dist folders to satisfy monorepo links before build
RUN mkdir -p packages/firebase/dist packages/types/dist packages/payments/dist packages/storage/dist packages/logistics/dist
RUN touch packages/firebase/dist/index.js packages/types/dist/index.js packages/payments/dist/index.js packages/storage/dist/index.js packages/logistics/dist/index.js

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Build all bundled apps
RUN npm run build

# Stage 2: Production Runner (Lean)
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy the entire workspace with node_modules and dist files
# This guarantees all workspace dependencies (like bullmq) are present.
COPY --from=builder /app ./

# SAFETY CHECK
RUN ls -la apps/api/dist/index.js && ls -la apps/worker/dist/index.js && ls -la apps/worker-life/dist/index.js

CMD ["npm", "run", "start:api"]
