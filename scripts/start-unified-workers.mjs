import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 [BLAST RADIUS ISOLATION] Starting Unified Worker Engine (Zynux + Aelixxr)...');
console.log('💡 Both AI brains are now sharing a single V8 memory heap for maximum efficiency.');

// We use dynamic imports to load the compiled index.js files of both workers.
// This forces them to run in the EXACT SAME Node.js process, saving ~70MB of base memory.
const startWorkers = async () => {
    try {
        console.log('📦 Booting Zynux (Business Logic)...');
        await import(resolve(__dirname, '../apps/worker/dist/index.js'));
        
        console.log('🧠 Booting Aelixxr (Life OS & Heavy Background)...');
        await import(resolve(__dirname, '../apps/worker-life/dist/index.js'));
        
        console.log('✅ Unified AI Engine is fully online and listening for Redis jobs.');
    } catch (err) {
        console.error('❌ FATAL: Failed to boot Unified AI Engine:', err);
        process.exit(1); // Force Northflank/Docker to restart the container
    }
};

startWorkers();
