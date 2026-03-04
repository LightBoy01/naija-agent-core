# Stage 1: Build
FROM node:20 AS builder
WORKDIR /app

# Copy all files (Simple approach to test context)
COPY . .

# Install dependencies
RUN npm install

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
