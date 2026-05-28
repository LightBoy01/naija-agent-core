"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lifeMemory = exports.LifeMemoryService = void 0;
const firebase_1 = require("@naija-agent/firebase");
const database_1 = require("@naija-agent/database");
const drizzle_orm_1 = require("drizzle-orm");
const types_1 = require("@naija-agent/types");
const logger_js_1 = require("../utils/logger.js");
const crypto_1 = require("crypto");
class LifeMemoryService {
    collection = 'life_contexts';
    /**
     * Hybrid Get Context:
     * Fetches financial data from PostgreSQL, merges with semantic context.
     */
    async getContext(phone) {
        try {
            const sqlDb = (0, database_1.getDb)();
            const userResult = await sqlDb.select().from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`).limit(1);
            let user = userResult[0];
            if (!user) {
                // --- NEW USER REGISTRATION ---
                await sqlDb.insert(database_1.users).values({
                    phone: phone,
                    name: 'User',
                    energyCredits: 100,
                    vaultBalanceKobo: 0,
                    context: {}
                });
                logger_js_1.logger.info({ phone }, '🎁 New user registered in Database! Granted 100 Welcome Bonus Credits.');
                // --- CHECK FOR REFERRAL (VIRAL LOOP) ---
                await this.completeReferral(phone);
                user = {
                    phone,
                    name: 'User',
                    energyCredits: 100,
                    vaultBalanceKobo: 0,
                    pinHash: null,
                    pinLockUntil: null,
                    pinAttempts: 0,
                    context: {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            }
            // Merge with any legacy or NoSQL-only context fields
            const noSqlContext = user.context || {};
            return {
                ...noSqlContext,
                energyCredits: user.energyCredits,
                vaultBalanceKobo: user.vaultBalanceKobo,
                pinLockUntil: user.pinLockUntil || undefined,
                pinHash: user.pinHash || undefined,
                lastInteraction: user.updatedAt,
                sessionStatus: user.sessionStatus || undefined,
                sessionExpiry: user.sessionExpiry || undefined
            };
        }
        catch (error) {
            logger_js_1.logger.error({ phone, error: error.message }, 'Failed to fetch Life Context from Database');
            return {};
        }
    }
    // --- REFERRAL METHODS (PHASE 4) ---
    /**
     * Create a pending referral record.
     */
    async createReferral(referrerPhone, referredPhoneRaw) {
        const sqlDb = (0, database_1.getDb)();
        const referralId = (0, crypto_1.randomUUID)();
        // STRICT NORMALIZATION: Ensure E.164 format.
        const referredPhone = (0, types_1.parseAndFormatPhone)(referredPhoneRaw) || referredPhoneRaw.replace(/\D/g, '');
        try {
            // Check if user already exists
            const existingUser = await sqlDb.select().from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${referredPhone}`).limit(1);
            if (existingUser.length > 0) {
                logger_js_1.logger.info({ referrerPhone, referredPhone }, '🚫 Referral failed: User already exists');
                return null;
            }
            await sqlDb.insert(database_1.referrals).values({
                id: referralId,
                referrerPhone,
                referredPhone,
                status: 'pending',
                rewardAmount: 50 // Energy Credits bonus
            });
            logger_js_1.logger.info({ referrerPhone, referredPhone }, '🔗 Referral created');
            return referralId;
        }
        catch (e) {
            logger_js_1.logger.error({ error: e.message }, 'Failed to create referral');
            return null;
        }
    }
    /**
     * Completes any pending referrals for a new user and rewards the referrer.
     */
    async completeReferral(newUserIdRaw) {
        const sqlDb = (0, database_1.getDb)();
        const newUserId = (0, types_1.parseAndFormatPhone)(newUserIdRaw) || newUserIdRaw;
        try {
            // Find pending referrals for this new user
            const pendingResult = await sqlDb.select()
                .from(database_1.referrals)
                .where((0, drizzle_orm_1.sql) `${database_1.referrals.referredPhone} = ${newUserId} AND ${database_1.referrals.status} = 'pending'`)
                .limit(1);
            const pending = pendingResult[0];
            if (pending) {
                await sqlDb.transaction(async (tx) => {
                    // 1. Mark referral as completed
                    await tx.update(database_1.referrals)
                        .set({ status: 'rewarded', completedAt: new Date() })
                        .where((0, drizzle_orm_1.sql) `${database_1.referrals.id} = ${pending.id}`);
                    // 2. Reward the Referrer
                    const referrerResult = await tx.select({ currentEnergy: database_1.users.energyCredits })
                        .from(database_1.users)
                        .where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${pending.referrerPhone}`);
                    if (referrerResult[0]) {
                        const newEnergy = referrerResult[0].currentEnergy + pending.rewardAmount;
                        await tx.update(database_1.users)
                            .set({ energyCredits: newEnergy })
                            .where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${pending.referrerPhone}`);
                        // 3. Log Reward Transaction
                        await tx.insert(database_1.transactions).values({
                            id: (0, crypto_1.randomUUID)(),
                            userId: pending.referrerPhone,
                            type: 'referral_reward',
                            amount: pending.rewardAmount.toString(),
                            currency: 'CREDITS',
                            status: 'success',
                            reference: `REF_${pending.id}`
                        });
                        logger_js_1.logger.info({ referrer: pending.referrerPhone, amount: pending.rewardAmount }, '🎁 Referrer Rewarded!');
                    }
                });
            }
        }
        catch (e) {
            logger_js_1.logger.error({ error: e.message }, 'Failed to complete referral');
        }
    }
    async deductEnergy(phone, amount) {
        try {
            const sqlDb = (0, database_1.getDb)();
            let newBalance = null;
            await sqlDb.transaction(async (tx) => {
                const userResult = await tx.select().from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
                const user = userResult[0];
                if (!user)
                    throw new Error('User profile not found in Database');
                const currentBalance = user.energyCredits;
                if (currentBalance < amount && (currentBalance - amount < -2)) {
                    throw new Error(`Insufficient energy: ${currentBalance} < ${amount}`);
                }
                newBalance = currentBalance - amount;
                await tx.update(database_1.users)
                    .set({ energyCredits: newBalance })
                    .where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
            });
            return newBalance;
        }
        catch (e) {
            logger_js_1.logger.warn({ phone, error: e.message }, 'Energy deduction failed');
            return null;
        }
    }
    async addEnergy(phone, amount, reference) {
        try {
            const sqlDb = (0, database_1.getDb)();
            let newBalance = null;
            await sqlDb.transaction(async (tx) => {
                // Idempotency Check
                if (reference && reference.toLowerCase() !== 'unknown') {
                    const txExists = await tx.select().from(database_1.transactions).where((0, drizzle_orm_1.sql) `${database_1.transactions.reference} = ${reference}`).limit(1);
                    if (txExists.length > 0) {
                        throw new Error('DUPLICATE_REFERENCE');
                    }
                }
                const userResult = await tx.select().from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
                let user = userResult[0];
                if (!user) {
                    // Auto-create user
                    await tx.insert(database_1.users).values({ phone, energyCredits: amount });
                    newBalance = amount;
                }
                else {
                    newBalance = user.energyCredits + amount;
                    await tx.update(database_1.users).set({ energyCredits: newBalance }).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
                }
                // Log transaction
                if (reference && reference.toLowerCase() !== 'unknown') {
                    await tx.insert(database_1.transactions).values({
                        id: (0, crypto_1.randomUUID)(),
                        userId: phone,
                        type: 'energy_topup',
                        amount: amount.toString(),
                        currency: 'CREDITS',
                        status: 'success',
                        reference: reference
                    });
                }
            });
            logger_js_1.logger.info({ phone, added: amount, newBalance, reference }, '🔋 Energy Added Successfully');
            return newBalance;
        }
        catch (e) {
            if (e.message === 'DUPLICATE_REFERENCE') {
                logger_js_1.logger.warn({ phone, reference }, 'Blocked duplicate energy top-up attempt');
                throw e;
            }
            logger_js_1.logger.warn({ phone, error: e.message }, 'Energy addition failed');
            return null;
        }
    }
    async addVaultBalance(phone, amountKobo, reference, type = 'deposit') {
        try {
            const sqlDb = (0, database_1.getDb)();
            let newBalance = null;
            await sqlDb.transaction(async (tx) => {
                if (reference && reference.toLowerCase() !== 'unknown') {
                    const txExists = await tx.select().from(database_1.transactions).where((0, drizzle_orm_1.sql) `${database_1.transactions.reference} = ${reference}`).limit(1);
                    if (txExists.length > 0)
                        throw new Error('DUPLICATE_REFERENCE');
                }
                const userResult = await tx.select().from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
                let user = userResult[0];
                if (!user) {
                    newBalance = amountKobo;
                    await tx.insert(database_1.users).values({ phone, vaultBalanceKobo: amountKobo });
                }
                else {
                    const currentBalance = user.vaultBalanceKobo || 0;
                    newBalance = currentBalance + amountKobo;
                    await tx.update(database_1.users).set({ vaultBalanceKobo: newBalance }).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
                }
                if (reference && reference.toLowerCase() !== 'unknown') {
                    await tx.insert(database_1.transactions).values({
                        id: (0, crypto_1.randomUUID)(),
                        userId: phone,
                        type: `vault_${type}`,
                        amount: (amountKobo / 100).toString(), // Store as Naira string in decimal column
                        currency: 'NGN',
                        status: 'success',
                        reference: reference
                    });
                }
            });
            logger_js_1.logger.info({ phone, addedKobo: amountKobo, newBalanceKobo: newBalance, reference }, '🏦 Vault Deposit Successful');
            return newBalance;
        }
        catch (e) {
            if (e.message === 'DUPLICATE_REFERENCE')
                throw e;
            logger_js_1.logger.warn({ phone, error: e.message }, 'Vault deposit failed');
            return null;
        }
    }
    async deductVaultBalance(phone, amountKobo) {
        try {
            const sqlDb = (0, database_1.getDb)();
            let newBalance = null;
            await sqlDb.transaction(async (tx) => {
                const userResult = await tx.select().from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
                const user = userResult[0];
                if (!user)
                    throw new Error('User profile not found in Database');
                const currentBalance = user.vaultBalanceKobo || 0;
                if (currentBalance < amountKobo) {
                    throw new Error('Insufficient funds in Vault: ' + currentBalance + ' < ' + amountKobo + ' Kobo');
                }
                newBalance = currentBalance - amountKobo;
                await tx.update(database_1.users).set({ vaultBalanceKobo: newBalance }).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
            });
            return newBalance;
        }
        catch (e) {
            logger_js_1.logger.warn({ phone, error: e.message }, 'Vault deduction failed');
            return null;
        }
    }
    async checkExists(phone) {
        try {
            const sqlDb = (0, database_1.getDb)();
            const userResult = await sqlDb.select({ phone: database_1.users.phone }).from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`).limit(1);
            return userResult.length > 0;
        }
        catch (error) {
            return false;
        }
    }
    // --- NoSQL HYBRID REMAINDERS ---
    async updateContext(phone, updates) {
        try {
            // Semantic updates still go to Firebase NoSQL for now
            const db = (0, firebase_1.getDb)();
            await db.collection(this.collection).doc(phone).set({
                ...updates,
                lastInteraction: new Date()
            }, { merge: true });
            // Also update the JSON context in SQL for hybrid sync
            const sqlDb = (0, database_1.getDb)();
            const userResult = await sqlDb.select({ context: database_1.users.context }).from(database_1.users).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`).limit(1);
            if (userResult[0]) {
                const currentContext = userResult[0].context || {};
                const sqlUpdates = {
                    context: { ...currentContext, ...updates },
                    updatedAt: new Date()
                };
                if (updates.sessionStatus !== undefined)
                    sqlUpdates.sessionStatus = updates.sessionStatus;
                if (updates.sessionExpiry !== undefined)
                    sqlUpdates.sessionExpiry = updates.sessionExpiry;
                await sqlDb.update(database_1.users).set(sqlUpdates).where((0, drizzle_orm_1.sql) `${database_1.users.phone} = ${phone}`);
            }
            logger_js_1.logger.info({ phone, updates }, '💾 Updated Life Memory (Hybrid Sync)');
        }
        catch (error) {
            logger_js_1.logger.error({ phone, error: error.message }, 'Failed to update Life Context');
        }
    }
    async saveEpisodicEvent(phone, title, details, emotionalValence = 'neutral') {
        try {
            // Episodic events remain purely NoSQL
            const db = (0, firebase_1.getDb)();
            const event = { title, details, emotionalValence, timestamp: new Date() };
            await db.collection(this.collection).doc(phone).collection('episodic_events').add(event);
            logger_js_1.logger.info({ phone, title, emotionalValence }, '📖 Saved Episodic Event to Firebase Vault History');
        }
        catch (error) {
            logger_js_1.logger.error({ phone, error: error.message }, 'Failed to save Episodic Event');
        }
    }
    async getRecentEpisodicEvents(phone, limit = 5) {
        try {
            const db = (0, firebase_1.getDb)();
            const snapshot = await db.collection(this.collection).doc(phone).collection('episodic_events')
                .orderBy('timestamp', 'desc').limit(limit).get();
            return snapshot.docs.map(doc => doc.data()).reverse();
        }
        catch (error) {
            logger_js_1.logger.error({ phone, error: error.message }, 'Failed to fetch Episodic Events');
            return [];
        }
    }
    // --- SEMANTIC MEMORY (PHASE 9.4: LONG-TERM RETRIEVAL) ---
    async saveSemanticMemory(userId, orgId, category, content, embedding, importance = 1) {
        try {
            const sqlDb = (0, database_1.getDb)();
            const { memories } = await import('@naija-agent/database');
            await sqlDb.insert(memories).values({
                id: (0, crypto_1.randomUUID)(),
                userId,
                orgId,
                category,
                content,
                embedding: (0, drizzle_orm_1.sql) `${'[' + embedding.join(',') + ']'}::vector`,
                importance
            });
            logger_js_1.logger.info({ userId, category }, '🧠 Saved Semantic Memory to PostgreSQL (pgvector)');
        }
        catch (error) {
            logger_js_1.logger.error({ userId, error: error.message }, 'Failed to save Semantic Memory');
        }
    }
    async searchSemanticMemory(userId, embedding, limit = 5) {
        try {
            const sqlDb = (0, database_1.getDb)();
            const { memories } = await import('@naija-agent/database');
            // Vector Similarity Search using cosine distance (<=>)
            const results = await sqlDb.select()
                .from(memories)
                .where((0, drizzle_orm_1.sql) `${memories.userId} = ${userId}`)
                .orderBy((0, drizzle_orm_1.sql) `${memories.embedding} <=> ${'[' + embedding.join(',') + ']'}`)
                .limit(limit);
            return results;
        }
        catch (error) {
            logger_js_1.logger.error({ userId, error: error.message }, 'Failed to search Semantic Memory');
            return [];
        }
    }
}
exports.LifeMemoryService = LifeMemoryService;
exports.lifeMemory = new LifeMemoryService();
//# sourceMappingURL=lifeMemory.js.map