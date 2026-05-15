import { Job } from 'bullmq';
import { logger } from '../utils/logger.js';
import { heartbeatService } from '../services/heartbeat.js';
import { lifeMemory } from '../services/lifeMemory.js';
import { whatsappService } from '../services/whatsapp.js';
import { proactiveService } from '../services/proactive.js';
import { searchVault } from '@naija-agent/storage';
import { Formatter } from '../utils/formatter.js';
import { AIProvider } from '@naija-agent/ai';
import { SystemConfig } from '@naija-agent/types';

export interface HeartbeatDependencies {
    ai: AIProvider;
    getDynamicModels: (systemInstruction?: string) => Promise<any>;
    lifeQueue: any;
    worker: any;
}

export async function handleLifeHeartbeat(job: Job, deps: HeartbeatDependencies) {
    const { lifeQueue, worker } = deps;
    logger.info('💓 Processing Life Heartbeat (Fan-out Phase)...');
    const activeUsers = await heartbeatService.getAllActiveUsers();
    logger.info({ count: activeUsers.length }, 'Found users with active heartbeats');
    
    for (const userId of activeUsers) {
        // --- FAN-OUT RATE LIMITING (Yielding) ---
        if (worker && typeof worker.rateLimit === 'function') {
            await worker.rateLimit(10);
        }

        const configs = await heartbeatService.getUserConfigs(userId);
        for (const config of configs) {
            const evalJobData = {
                userId,
                config,
                timestamp: Date.now()
            };
            
            await lifeQueue.add('evaluate-heartbeat', evalJobData, {
                jobId: `eval-${userId}-${config.id}-${Date.now()}`,
                removeOnComplete: true,
                removeOnFail: false
            });
        }
    }
    return { success: true, count: activeUsers.length };
}

export async function handleEvaluateHeartbeat(job: Job, deps: HeartbeatDependencies) {
    const { ai, getDynamicModels } = deps;
    const { userId, config } = job.data;
    
    try {
        const { shouldMessage, contextData } = await heartbeatService.evaluateConfig(config);
        if (shouldMessage) {
            const isSmartReminder = !!(contextData as any).vaultTopic;
            
            if ((contextData as any).deterministic && (contextData as any).payload && !isSmartReminder) {
                const payload = (contextData as any).payload;
                logger.info({ userId }, '🚀 Sending deterministic scheduled reminder...');
                await whatsappService.sendText(userId, payload);
                await heartbeatService.deactivateConfig(userId, config.id, 'completed');
                return { success: true, mode: 'deterministic' };
            }

            let vaultEnrichment = "";
            if (isSmartReminder) {
                const topic = (contextData as any).vaultTopic;
                const results = await searchVault(userId, topic);
                if (results && results.length > 0) {
                    vaultEnrichment = `\n\n[RELEVANT VAULT MEMORIES]:\n${JSON.stringify(results.slice(0, 3))}`;
                }
            }

            const context = await lifeMemory.getContext(userId);
            const systemPrompt = `
            You are "Aelixxr", the Life Companion.
            This is a PROACTIVE message. The user did not speak to you.
            You are checking their active heartbeat config: ${JSON.stringify(config)}
            Here is the latest data for this config: ${JSON.stringify(contextData)}
            ${vaultEnrichment}
            
            User Context:
            - Family: ${JSON.stringify(context.family || {})}
            - Goals: ${JSON.stringify(context.goals || [])}
            
            Your Goal: Analyze the latest data and memories. Draft a short, friendly, and specific WhatsApp message to them. 
            If no alert is needed, you MUST reply with exactly "SKIP".

            [RESPONSE FORMATTING]:
            - Wrap internal thoughts in <think> ... </think> tags.
            - Output final message outside tags.
            - If no message, output exactly "SKIP".
            `;
            
            const { primaryModel, tools } = await getDynamicModels(systemPrompt);
            
            const result = await ai.generateText("Evaluate and generate proactive message or SKIP.", {
                model: primaryModel,
                systemInstruction: systemPrompt,
                tools
            });
            
            let text = result.text.trim();
            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (text.includes('<think>')) {
                text = text.split('<think>')[0].trim();
            }
            
            if (text !== 'SKIP' && text !== '') {
                logger.info({ userId }, 'Proactive heartbeat message generated');
                const formattedText = Formatter.format(text);
                await whatsappService.sendText(userId, formattedText);
                if (config.type === 'reminder') {
                    await heartbeatService.deactivateConfig(userId, config.id, 'completed');
                }
            } else {
                logger.info({ userId }, 'Heartbeat evaluated: SKIP');
            }
        }
    } catch (err: any) {
        logger.error({ userId, err: err.message }, 'Failed heartbeat evaluation');
        
        // --- SOVEREIGN SNITCH: Heartbeat Alert ---
        try {
            const masterPhone = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
            await whatsappService.sendText(masterPhone, `🚨 *AELIXXR HEARTBEAT ERROR*\n\n*User:* ${userId}\n*Config:* ${config.id}\n*Error:* ${err.message}`);
        } catch (sErr) {}
        
        throw err;
    }
    return { success: true };
}

export async function handleProactiveNudge(job: Job, deps: HeartbeatDependencies) {
    const { lifeQueue, worker } = deps;
    logger.info('🤝 Processing Proactive Nudge...');
    const staleUsers = await proactiveService.getUsersNeedingNudge(48);
    
    for (const userId of staleUsers) {
        // Yielding
        if (worker && typeof worker.rateLimit === 'function') {
            await worker.rateLimit(10);
        }

        const evalJobData = { userId, timestamp: Date.now() };
        await lifeQueue.add('evaluate-nudge', evalJobData, {
            jobId: `nudge-${userId}-${Date.now()}`,
            removeOnComplete: true,
            removeOnFail: false
        });
    }
    return { success: true, queuedUsers: staleUsers.length };
}

export async function handleEvaluateNudge(job: Job, deps: HeartbeatDependencies) {
    const { ai, getDynamicModels } = deps;
    const nudgeUserId = job.data.userId;
    
    try {
        const context = await lifeMemory.getContext(nudgeUserId);
        const episodic = await lifeMemory.getRecentEpisodicEvents(nudgeUserId, 3);
        
        const systemPrompt = `
        You are "Aelixxr", the Life Companion.
        This is a PROACTIVE NUDGE. The user hasn't spoken in 48 hours.
        User Context: ${JSON.stringify(context)}
        Recent Events: ${JSON.stringify(episodic)}
        Draft a warm, contextual message checking in. Use <think> tags for reasoning.
        `;
        
        const { primaryModel, tools } = await getDynamicModels(systemPrompt);
        
        const result = await ai.generateText("Generate proactive nudge message.", {
            model: primaryModel,
            systemInstruction: systemPrompt,
            tools
        });
        
        let text = result.text.trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (text !== '') {
            await whatsappService.sendText(nudgeUserId, text);
            await lifeMemory.updateContext(nudgeUserId, {}); 
        }
    } catch (err: any) {
        logger.error({ userId: nudgeUserId, err: err.message }, 'Failed nudge evaluation');
        
        // --- SOVEREIGN SNITCH: Nudge Alert ---
        try {
            const masterPhone = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
            await whatsappService.sendText(masterPhone, `🚨 *AELIXXR NUDGE ERROR*\n\n*User:* ${nudgeUserId}\n*Error:* ${err.message}`);
        } catch (sErr) {}
        
        throw err;
    }
    return { success: true };
}
