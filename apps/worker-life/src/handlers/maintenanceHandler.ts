import { Job } from 'bullmq';
import { logger } from '../utils/logger.js';
import { marketService } from '../services/marketData.js';

export async function handleConsolidateMemory(job: Job) {
    logger.info('💤 Running Sleep Cycle (Memory Consolidation)...');
    const { userId, orgId } = job.data;
    const { sleepCycle } = await import('../services/sleepCycle.js');
    await sleepCycle.consolidateMemory(userId, orgId);
    return { success: true };
}

export async function handleMarketScrape(job: Job) {
    logger.info('🛒 Scraping Market Prices...');
    const prices = await marketService.getPrices();
    logger.info({ count: prices.length }, '✅ Market Prices Retrieved');
    return { success: true, prices };
}
