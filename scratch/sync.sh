#!/bin/bash
set -e
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no .env root@159.195.150.66:/root/naija-agent-core/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no packages/payments/src/pocketfi.ts root@159.195.150.66:/root/naija-agent-core/packages/payments/src/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no packages/payments/src/index.ts root@159.195.150.66:/root/naija-agent-core/packages/payments/src/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/api/src/routes/webhooks.ts root@159.195.150.66:/root/naija-agent-core/apps/api/src/routes/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/worker-life/src/services/pocketfiClient.ts root@159.195.150.66:/root/naija-agent-core/apps/worker-life/src/services/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/worker-life/src/tools/finance/recharge.ts root@159.195.150.66:/root/naija-agent-core/apps/worker-life/src/tools/finance/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/worker-life/src/tools/finance/vault.ts root@159.195.150.66:/root/naija-agent-core/apps/worker-life/src/tools/finance/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/worker-life/src/tools/finance/payout.ts root@159.195.150.66:/root/naija-agent-core/apps/worker-life/src/tools/finance/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/worker-life/src/tools/systemTools.ts root@159.195.150.66:/root/naija-agent-core/apps/worker-life/src/tools/
sshpass -p '5mCo0uOCWL5sod5' scp -o StrictHostKeyChecking=no apps/worker-life/src/prompts/Aelixxr.Soul.md root@159.195.150.66:/root/naija-agent-core/apps/worker-life/src/prompts/
echo "Done sync!"
