# Stage 1: Build
FROM node:20 AS builder
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Create workspace directories
RUN mkdir -p apps/api apps/worker packages/firebase packages/types

# Copy workspace package files
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/firebase/package*.json ./packages/firebase/
COPY packages/types/package*.json ./packages/types/

# Debug: List files to verify structure
RUN ls -R

# Install dependencies
RUN npm install

# Copy all source code
COPY . .

# Build
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim
WORKDIR /app

# Copy built artifacts
COPY --from=builder /app ./

# Make start.sh executable
RUN chmod +x ./start.sh

# Expose API port
EXPOSE 3000

# Start API and Worker
CMD ["./start.sh"]
