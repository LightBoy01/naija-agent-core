#!/bin/sh

# Start the API in the background from the root
echo "🚀 Starting @naija-agent/api..."
npm run start --workspace=@naija-agent/api &

# Start the Worker in the foreground from the root
echo "🚀 Starting @naija-agent/worker..."
npm run start --workspace=@naija-agent/worker
