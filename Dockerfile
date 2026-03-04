# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

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

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies only (optional optimization, but for simplicity let's just copy everything for now to avoid missing peer deps)
# Actually, for monorepos, it's safer to copy node_modules from builder to avoid re-installing and potential mismatches.
# However, we should ideally prune devDependencies.
# Let's keep it simple: Copy everything from builder.

COPY --from=builder /app ./

# Default command (can be overridden by docker-compose or Railway)
CMD ["npm", "run", "start:api"]
