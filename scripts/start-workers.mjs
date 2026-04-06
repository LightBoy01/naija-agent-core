import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 Starting Unified Worker Container (Zynux & Aelixxr)...');

const startProcess = (name, path) => {
    const child = spawn('node', [path], {
        stdio: 'inherit',
        env: process.env // Inherit all pushed environment variables
    });

    child.on('error', (err) => {
        console.error(`❌ [${name}] Failed to start:`, err);
    });

    child.on('close', (code) => {
        console.log(`⚠️ [${name}] Exited with code ${code}. Restarting in 5 seconds...`);
        setTimeout(() => startProcess(name, path), 5000);
    });

    return child;
};

// Start both workers simultaneously in the same container
startProcess('ZYNUX-WORKER', resolve(__dirname, '../apps/worker/dist/index.js'));
startProcess('AELIXXR-WORKER', resolve(__dirname, '../apps/worker-life/dist/index.js'));
