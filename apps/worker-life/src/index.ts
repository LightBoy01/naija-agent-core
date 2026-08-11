import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import 'dotenv/config';
import { SystemConfig, getEnv } from '@naija-agent/types';
const env = getEnv();

import { logger } from './utils/logger.js';
import { getLifeTools, getOrchestratorTools } from './tools/index.js';
import { mcpClient } from './services/mcpClient.js';
import { promptService } from './services/promptService.js';
import path from 'path';

// --- AI Abstraction ---
import { AIOrchestrator, GeminiProvider, OpenAIProvider, AIFactory, GlobalModelRegistry } from '@naija-agent/ai';

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
import { handleSovereignCronTick, SovereignCronDependencies } from './handlers/cronHandler.js';
import { handleVaultDeposit, VaultWebhookDependencies } from './handlers/vaultWebhookHandler.js';

// --- Redis & AI Configuration ---
const redisUrl = process.env.REDIS_URL_LOS || process.env.REDIS_URL; 
export const redisClient = new Redis(redisUrl || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    tls: redisUrl?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
});

// --- Initialize AI Orchestrator with Dynamic Capability Router ---
const aiOrchestrator = AIFactory.createRouter(GlobalModelRegistry);

const apiKey = process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';

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
const deadLetterQueue = new Queue('dead-letter', { connection: redisClient });

const worker: Worker = new Worker(
  'life-queue',
  async (job: Job): Promise<any> => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing Life Task');

    const deps: ChatDependencies & HeartbeatDependencies & SLMDependencies & SovereignCronDependencies & VaultWebhookDependencies = {
        ai: aiOrchestrator, // Use the abstracted orchestrator
        getDynamicModels,
        lifeQueue,
        apiKey,
        globalLifeTools,
        getLifeTools,
        worker 
        };
    try {
        switch (job.name) {
            case 'admin-refresh-prompts':
                logger.info('👮 Admin Command: Refreshing Prompts');
                return { success: promptService.refresh() };

            case 'process-message':
            case 'life-chat':
                return await handleLifeChat(job, deps);
            
            case 'life-chat-resume':
                return await handleLifeChatResume(job, deps);

            case 'execute-slm-task':
                return await handleSLMTask(job, deps);

            case 'sovereign-cron-tick':
                return await handleSovereignCronTick(job, deps);

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

            case 'life-vault-deposit':
                return await handleVaultDeposit(job, deps);

            case 'send-system-notification':
                // Non-AI system notification — just sends WhatsApp text
                const { to, message } = job.data;
                const { whatsappService } = await import('./services/whatsapp.js');
                await whatsappService.sendText(to, message);
                return { success: true };

            default:
                logger.warn({ jobName: job.name }, 'Unknown job name');
                return { success: false, error: 'unknown_job' };
        }
    } catch (err: any) {
        logger.error({ jobId: job.id, err: err.message }, 'Job Processing Error');
        throw err;
    }
  },
  { 
    connection: redisClient, 
    concurrency: 20, 
    limiter: {
      max: 5,
      duration: 1000
    }
  }
);

worker.on('failed', async (job: Job | undefined, err: Error) => {
  logger.error({ jobId: job?.id, error: err.message }, '❌ Job Failed');
  if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
    await deadLetterQueue.add('failed-job', {
      originalJobId: job.id,
      originalName: job.name,
      originalData: job.data,
      error: err.message,
      stack: err.stack,
      failedAt: new Date().toISOString(),
    });
    logger.warn({ jobId: job.id, originalName: job.name }, '📤 Moved to dead-letter queue');
  }
});

logger.info('🚀 Aelixxr LOS Worker is LIVE and Modular');
