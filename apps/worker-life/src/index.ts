import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { SystemConfig } from '@naija-agent/types';
import { logger } from './utils/logger.js';
import { getLifeTools, getOrchestratorTools } from './tools.js';
import { mcpClient } from './services/mcpClient.js';
import { extractSafeText } from './utils/ai.js';
import { promptService } from './services/promptService.js';
import path from 'path';

// --- Handlers ---
import { handleLifeChat, handleLifeChatResume, ChatDependencies } from './handlers/chatHandler.js';
import { 
    handleLifeHeartbeat, 
    handleEvaluateHeartbeat, 
    handleProactiveNudge, 
    handleEvaluateNudge,
    HeartbeatDependencies
} from './handlers/heartbeatHandler.js';
import { handleSLMTask, SLMDependencies } from './handlers/slmHandler.js';
import { handleConsolidateMemory, handleMarketScrape } from './handlers/maintenanceHandler.js';

// --- Termux/Android Environment Fix ---
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined && process.platform === 'android') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    logger.info('🛡️ [TERMUX FIX]: TLS Verification disabled.');
}

// --- Redis & AI Configuration ---
const redisUrl = process.env.REDIS_URL_LOS || process.env.REDIS_URL; 
const redisClient = new Redis(redisUrl || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    tls: redisUrl?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
});

const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock-key';
const genAI = new GoogleGenAI({
  apiKey,
  httpOptions: { baseUrl: 'https://aiplatform.googleapis.com', apiVersion: 'v1/publishers/google' }
});

// --- Dynamic Tools & MCP Setup ---
let globalLifeTools: any[] | null = null;
let globalOrchestratorTools: any[] | null = null;

async function getDynamicModels(systemInstruction?: string) {
  const tools = globalOrchestratorTools || await getOrchestratorTools();
  return { 
    primaryModel: process.env.GEMINI_MODEL_LOS || SystemConfig.MODELS.AELIXXR_PRIMARY,
    fallbackModel: SystemConfig.MODELS.AELIXXR_FALLBACK,
    tools,
    systemInstruction
  };
}

(async () => {
  try {
    const scriptPath = path.join(__dirname, 'utils', 'mcp-fetch.mjs');
    await mcpClient.connectLocalServer('node', [scriptPath]);
    globalLifeTools = await getLifeTools();
    globalOrchestratorTools = await getOrchestratorTools();
    logger.info('✅ MCP & Dynamic Tools Bootstrapped');
  } catch (error: any) {
    logger.error('⚠️ MCP Bootstrap Failed');
    globalLifeTools = await getLifeTools();
    globalOrchestratorTools = await getOrchestratorTools();
  }
})();

// --- Queue & Worker ---
export const lifeQueue = new Queue('life-queue', { connection: redisClient });

const worker: Worker = new Worker(
  'life-queue',
  async (job: Job): Promise<any> => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing Life Task');

    const deps: ChatDependencies & HeartbeatDependencies & SLMDependencies = {
        genAI,
        getDynamicModels,
        lifeQueue,
        apiKey,
        extractSafeText,
        globalLifeTools,
        getLifeTools,
        worker 
        };
    try {
        switch (job.name) {
            // --- Phase 3: Administrative Control ---
            case 'admin-refresh-prompts':
                logger.info('👮 Admin Command: Refreshing Prompts');
                return { success: promptService.refresh() };

            case 'life-chat':
                return await handleLifeChat(job, deps);
            
            case 'life-chat-resume':
                return await handleLifeChatResume(job, deps);

            case 'execute-slm-task':
                return await handleSLMTask(job, deps);

            case 'life-heartbeat':
                return await handleLifeHeartbeat(job, deps);

            case 'evaluate-heartbeat':
                return await handleEvaluateHeartbeat(job, deps);

            case 'proactive-nudge':
                return await handleProactiveNudge(job, deps);

            case 'evaluate-nudge':
                return await handleEvaluateNudge(job, deps);

            case 'market-scrape':
                return await handleMarketScrape(job);

            case 'consolidate-memory':
                return await handleConsolidateMemory(job);

            default:
                logger.warn({ jobName: job.name }, 'Unknown job name');
                return { success: false, error: 'unknown_job' };
        }
    } catch (err: any) {
        logger.error({ jobId: job.id, err: err.message }, 'Job Processing Error');
        throw err;
    }
  },
  { connection: redisClient, concurrency: 5 }
);

worker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error({ jobId: job?.id, error: err.message }, '❌ Job Failed');
});

logger.info('🚀 Aelixxr LOS Worker is LIVE and Modular');
