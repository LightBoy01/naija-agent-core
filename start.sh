#!/bin/sh

# Change to the app directory
cd /app

# Start the API in the background
echo "🚀 Starting @naija-agent/api..."
npm run start --workspace=@naija-agent/api &

# Start the Worker in the foreground
echo "🚀 Starting @naija-agent/worker..."
npm run start --workspace=@naija-agent/worker
