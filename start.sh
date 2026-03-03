#!/bin/sh

# Start the API in the background
echo "🚀 Starting @naija-agent/api..."
npm start --workspace=@naija-agent/api &

# Start the Worker in the foreground (keeping the container alive)
echo "🚀 Starting @naija-agent/worker..."
npm start --workspace=@naija-agent/worker
