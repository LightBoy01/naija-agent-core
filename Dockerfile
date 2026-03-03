# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/firebase/package*.json ./packages/firebase/
COPY packages/types/package*.json ./packages/types/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Copy built artifacts
COPY --from=builder /app ./

# Expose API port
EXPOSE 3000

# Start API (We will run Worker separately or via a start script)
CMD ["npm", "start", "--workspace=@naija-agent/api"]
