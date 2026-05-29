import { db, getDb } from './db.js';
import { cronJobs } from './schema.js';
import { eq, and, sql, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { CronExpressionParser } from 'cron-parser';

export interface CronJobCreation {
    userId: string;
    orgId: string;
    name: string;
    instruction: string;
    schedule: string;
    sectorPack?: string;
    energyBudget?: number;
}

export async function createCronJob(job: CronJobCreation): Promise<string> {
    const sqlDb = getDb();
    const jobId = randomUUID();
    
    let nextRunAt: Date | null = null;
    try {
        const interval = CronExpressionParser.parse(job.schedule);
        nextRunAt = interval.next().toDate();
    } catch (err) {
        throw new Error(`Invalid cron schedule: ${job.schedule}`);
    }

    await sqlDb.insert(cronJobs).values({
        id: jobId,
        ...job,
        sectorPack: job.sectorPack || 'ResearchPack',
        energyBudget: job.energyBudget || 5,
        status: 'active',
        nextRunAt
    });

    return jobId;
}

export async function getDueCronJobs(): Promise<any[]> {
    const sqlDb = getDb();
    const now = new Date();

    // Fetch jobs that are 'active' and their next_run_at is <= now
    const rows = await sqlDb.select()
        .from(cronJobs)
        .where(
            and(
                eq(cronJobs.status, 'active'),
                lte(cronJobs.nextRunAt, now)
            )
        );

    return rows;
}

export async function advanceCronJob(jobId: string, result?: string, success: boolean = true, trajectory?: any, stepCount?: number): Promise<void> {
    const sqlDb = getDb();
    
    // First fetch the job to parse its schedule again
    const jobRecord = await sqlDb.select().from(cronJobs).where(eq(cronJobs.id, jobId)).limit(1);
    if (jobRecord.length === 0) return;
    
    const schedule = jobRecord[0].schedule;
    
    let nextRunAt: Date | null = null;
    try {
        const interval = CronExpressionParser.parse(schedule);
        nextRunAt = interval.next().toDate();
    } catch (err) {
        // If it suddenly fails to parse, pause the job
        await sqlDb.update(cronJobs).set({ status: 'paused', lastResult: 'Error parsing cron' }).where(eq(cronJobs.id, jobId));
        return;
    }

    const updates: any = {
        lastRunAt: new Date(),
        nextRunAt,
        lastResult: result || null,
        status: success ? 'active' : 'failed', // Or 'paused' depending on retry logic
        updatedAt: new Date()
    };

    if (trajectory !== undefined) updates.trajectory = trajectory;
    if (stepCount !== undefined) updates.stepCount = stepCount;

    await sqlDb.update(cronJobs).set(updates).where(eq(cronJobs.id, jobId));
}

/**
 * Incremental state update for in-progress agentic runs.
 */
export async function updateCronJobState(jobId: string, trajectory: any, stepCount: number): Promise<void> {
    const sqlDb = getDb();
    await sqlDb.update(cronJobs)
        .set({ 
            trajectory, 
            stepCount,
            updatedAt: new Date() 
        })
        .where(eq(cronJobs.id, jobId));
}

export async function updateCronJobStatus(jobId: string, status: 'active' | 'paused' | 'completed' | 'failed'): Promise<void> {
    const sqlDb = getDb();
    await sqlDb.update(cronJobs)
        .set({ status, updatedAt: new Date() })
        .where(eq(cronJobs.id, jobId));
}
