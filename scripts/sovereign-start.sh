#!/bin/bash
# 🚀 [SOVEREIGN EMPIRE ENTRYPOINT]
# This script launches the entire polyglot stack inside a single container/VPS node.
# It is designed for maximum resource efficiency and zero network latency.

set -e

echo "----------------------------------------------------------------"
echo "👑 NAIJA AGENT CORE: SOVEREIGN EMPIRE STARTING..."
echo "----------------------------------------------------------------"

# 1. Start Go WhatsApp Sidecar (Background)
echo "📡 Launching WhatsApp Sovereign Sidecar (Go)..."
/app/apps/whatsapp-sidecar/sidecar-binary &
SIDECAR_PID=$!

# Ensure background processes die when script exits
trap "kill $SIDECAR_PID $API_PID 2>/dev/null || true" EXIT

# Wait for sidecar to be ready
echo "⏳ Waiting for Sidecar to initialize..."
sleep 5

# 2. Start API Gateway (Background)
echo "🌐 Launching API Gateway (Fastify)..."
npm run start:api &
API_PID=$!

# 3. Start Unified AI Worker Engine (Foreground)
# This includes both Zynux (Business) and Aelixxr (Life) in one Node process.
echo "🧠 Launching Unified AI Worker Engine (Zynux + Aelixxr)..."
node scripts/start-unified-workers.mjs

# Wait for background processes if the main worker exits
wait $SIDECAR_PID $API_PID
