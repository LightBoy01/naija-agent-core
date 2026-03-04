# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files (using a more robust glob if possible, or listing them)
# Alpine's 'cp' or Docker's 'COPY' with wildcards can be tricky with directories.
# Listing them explicitly is safest for monorepo consistency.
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/firebase/package*.json ./packages/firebase/
COPY packages/types/package*.json ./packages/types/

# Install dependencies (this will respect the monorepo structure)
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the entire monorepo using Project References
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder /app ./

# Ensure start.sh is executable (it was copied in the previous step)
RUN chmod +x ./start.sh

# Expose API port
EXPOSE 3000

# Start API and Worker using the start script
CMD ["./start.sh"]
