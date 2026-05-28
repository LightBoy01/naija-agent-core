import { LifeContext } from '@naija-agent/types';
export declare class LifeMemoryService {
    private collection;
    /**
     * Hybrid Get Context:
     * Fetches financial data from PostgreSQL, merges with semantic context.
     */
    getContext(phone: string): Promise<LifeContext>;
    /**
     * Create a pending referral record.
     */
    createReferral(referrerPhone: string, referredPhoneRaw: string): Promise<string | null>;
    /**
     * Completes any pending referrals for a new user and rewards the referrer.
     */
    completeReferral(newUserIdRaw: string): Promise<void>;
    deductEnergy(phone: string, amount: number): Promise<number | null>;
    addEnergy(phone: string, amount: number, reference?: string): Promise<number | null>;
    addVaultBalance(phone: string, amountKobo: number, reference?: string, type?: 'deposit' | 'refund'): Promise<number | null>;
    deductVaultBalance(phone: string, amountKobo: number): Promise<number | null>;
    checkExists(phone: string): Promise<boolean>;
    updateContext(phone: string, updates: Partial<LifeContext>): Promise<void>;
    saveEpisodicEvent(phone: string, title: string, details: string, emotionalValence?: string): Promise<void>;
    getRecentEpisodicEvents(phone: string, limit?: number): Promise<any[]>;
    saveSemanticMemory(userId: string, orgId: string, category: string, content: string, embedding: number[], importance?: number): Promise<void>;
    searchSemanticMemory(userId: string, embedding: number[], limit?: number): Promise<any[]>;
}
export declare const lifeMemory: LifeMemoryService;
//# sourceMappingURL=lifeMemory.d.ts.map