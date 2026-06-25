FROM node:22-bookworm AS builder

WORKDIR /app

# 1. Install Build Tools (Python for Hermes, Go for Sidecar)
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    curl build-essential wget \
    && wget -q https://go.dev/dl/go1.26.3.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.26.3.linux-amd64.tar.gz \
    && rm go1.26.3.linux-amd64.tar.gz \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/go/bin:/root/.local/bin:$PATH"
ENV NODE_ENV=development

# 2. Monorepo Dependency Optimization
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/worker-life/package.json apps/worker-life/
COPY apps/whatsapp-sidecar/go.mod apps/whatsapp-sidecar/go.sum apps/whatsapp-sidecar/

# Pre-install Node dependencies
RUN npm install

# 3. Build Go Sovereign Sidecar
COPY apps/whatsapp-sidecar/ apps/whatsapp-sidecar/
RUN cd apps/whatsapp-sidecar && go build -o sidecar-binary main.go

# 4. Build Node.js Apps
COPY . .
RUN npm run build

# 5. Provision Hermes Python Environment
RUN cd hermes-agent && uv venv && uv pip install .

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install Runtime Dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    ffmpeg ripgrep curl ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy built artifacts from builder
COPY --from=builder /app /app
ENV PATH="/app/hermes-agent/.venv/bin:/root/.local/bin:$PATH"

# Ensure the entrypoint script is executable
RUN chmod +x /app/scripts/sovereign-start.sh

# Expose API and Sidecar ports
EXPOSE 3000 8080

# Default command starts the Sovereign Empire bundle
CMD ["/app/scripts/sovereign-start.sh"]
