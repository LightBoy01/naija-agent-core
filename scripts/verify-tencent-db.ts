import postgres from 'postgres';
import dotenv from 'dotenv';
import { logger } from '../apps/worker/src/utils/logger.js';

dotenv.config();

async function verifyTencentDB() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL not found in environment.');
        return;
    }

    console.log('🛡️ --- TENCENT CLOUD POSTGRESQL DEEP AUDIT --- 🛡️');
    
    // 1. Connectivity & SSL Check
    const sql = postgres(dbUrl, { ssl: 'require', prepare: false });
    
    try {
        const [version] = await sql`SELECT version()`;
        console.log(`✅ Connection Successful!`);
        console.log(`📊 DB Version: ${version.version}`);

        // 2. pgvector Extension Check
        const [ext] = await sql`SELECT * FROM pg_extension WHERE extname = 'vector'`;
        if (ext) {
            console.log('✅ pgvector extension is ENABLED.');
        } else {
            console.warn('⚠️ pgvector extension is MISSING. Attempting to enable...');
            try {
                await sql`CREATE EXTENSION IF NOT EXISTS vector`;
                console.log('✅ pgvector enabled successfully.');
            } catch (e: any) {
                console.error(`❌ Failed to enable pgvector: ${e.message}`);
            }
        }

        // 3. Schema Alignment Audit: Memories Table
        const columns = await sql`
            SELECT column_name, data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_name = 'memories' AND column_name = 'embedding'
        `;

        if (columns.length > 0) {
            const col = columns[0];
            console.log(`📍 memories.embedding Type: ${col.data_type} (${col.udt_name})`);
            if (col.udt_name === 'vector') {
                console.log('✅ Type alignment is CORRECT (vector).');
            } else {
                console.error(`❌ CRITICAL: Column 'embedding' is ${col.udt_name}, but should be 'vector'.`);
                console.log('💡 Suggestion: Run "ALTER TABLE memories ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);"');
            }
        } else {
            console.error('❌ Table "memories" or column "embedding" not found.');
        }

        // 4. Index Audit: HNSW
        const indexes = await sql`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'memories'
        `;
        
        const hasHNSW = indexes.some(idx => idx.indexdef.toLowerCase().includes('hnsw'));
        if (hasHNSW) {
            console.log('✅ HNSW Vector Index detected.');
        } else {
            console.warn('⚠️ HNSW Vector Index MISSING. Vector search will be slow at scale.');
        }

        // 5. Connection Pooling Check
        const [conns] = await sql`SELECT count(*) FROM pg_stat_activity`;
        console.log(`🔌 Current active connections: ${conns.count}`);

    } catch (err: any) {
        console.error(`❌ DB Audit Failed: ${err.message}`);
    } finally {
        await sql.end();
    }
}

verifyTencentDB();
