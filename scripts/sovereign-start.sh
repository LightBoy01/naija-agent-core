#!/bin/bash
# 🚀 [SOVEREIGN EMPIRE ENTRYPOINT]
# This script launches the entire polyglot stack inside a single container/VPS node.
# It is designed for maximum resource efficiency and zero network latency.

set -e

echo "----------------------------------------------------------------"
echo "👑 NAIJA AGENT CORE: SOVEREIGN EMPIRE STARTING..."
echo "----------------------------------------------------------------"

# 1. Start API Gateway (Background)
echo "🌐 Launching API Gateway (Fastify)..."
npm run start:api &
API_PID=$!

# 2. Start Unified AI Worker Engine (Background)
# This includes both Zynux (Business) and Aelixxr (Life) in one Node process.
echo "🧠 Launching Unified AI Worker Engine (Zynux + Aelixxr)..."
node scripts/start-unified-workers.mjs &
WORKER_PID=$!

# Wait for workers to hydrate Redis before Sidecar boots
echo "⏳ Waiting for AI Engine to hydrate Redis..."
sleep 15

# 3. Start Go WhatsApp Sidecar (Foreground)
echo "📡 Launching WhatsApp Sovereign Sidecar (Go)..."
PORT=8080 /app/apps/whatsapp-sidecar/sidecar-binary

# Ensure background processes die when script exits
trap "kill $API_PID $WORKER_PID 2>/dev/null || true" EXIT
