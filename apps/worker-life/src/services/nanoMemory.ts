import { lifeMemory } from './lifeMemory.js';
import { logger } from '../utils/logger.js';
// @ts-ignore
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

export class NanoMemoryService {
    async generateEmbedding(text: string): Promise<number[]> {
        const apiKey = process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY_EMBEDDING || process.env.GEMINI_API_KEY;
        const modelName = 'text-embedding-004'; // or gemini-embedding-2, but text-embedding-004 is recommended for text
        
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;
            
            const body = {
              content: {
                parts: [
                  { text: text }
                ]
              }
            };
        
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
        
            const result = await response.json() as any;
            return result.embedding?.values || [];
        } catch (error: any) {
            logger.error({ error: error.message }, '❌ Failed to generate text embedding');
            return [];
        }
    }

    /**
     * Chunks text into overlapping segments (roughly 100 words each, 20 word overlap).
     */
    private chunkText(text: string): string[] {
        const words = text.split(/\s+/);
        const chunks: string[] = [];
        let i = 0;
        const wordsPerChunk = 100;
        const overlapWords = 20;

        while (i < words.length) {
            const chunkWords = words.slice(i, i + wordsPerChunk);
            chunks.push(chunkWords.join(' '));
            i += (wordsPerChunk - overlapWords);
        }
        return chunks;
    }

    /**
     * Extracts text from a PDF buffer, chunks it, embeds it, and stores in PostgreSQL pgvector.
     */
    async ingestDocumentFile(userId: string, orgId: string, buffer: Buffer, mimeType: string, filename: string): Promise<number> {
        let text = '';
        if (mimeType === 'application/pdf') {
            try {
                const data = await (pdfParse as any)(buffer);
                text = data.text;
                logger.info({ userId, filename, pages: data.numpages }, '📄 PDF Parsed Successfully');
            } catch (error: any) {
                logger.error({ error: error.message }, '❌ pdf-parse failed');
                throw new Error('Failed to parse PDF.');
            }
        } else if (mimeType.startsWith('text/')) {
            text = buffer.toString('utf-8');
        } else {
            logger.warn({ mimeType }, '⚠️ Unsupported mimeType for NanoMemory');
            return 0;
        }

        if (!text.trim()) return 0;

        const chunks = this.chunkText(text);
        let count = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (chunk.trim().length < 20) continue; // skip tiny chunks
            
            const embedding = await this.generateEmbedding(chunk);
            if (embedding.length > 0) {
                await lifeMemory.saveSemanticMemory(
                    userId,
                    orgId,
                    'study_material',
                    `[Source: ${filename} | Chunk: ${i+1}/${chunks.length}]\n${chunk}`,
                    embedding,
                    2 // Medium importance
                );
                count++;
            }
        }
        logger.info({ userId, chunksEmbedded: count }, '✅ NanoMemory vector injection complete');
        return count;
    }

    /**
     * Performs a semantic search against the Vault using pgvector cosine similarity.
     */
    async grepVault(userId: string, query: string, limit: number = 3): Promise<string[]> {
        const queryEmbedding = await this.generateEmbedding(query);
        if (!queryEmbedding || queryEmbedding.length === 0) return [];

        const results = await lifeMemory.searchSemanticMemory(userId, queryEmbedding, limit);
        return results.map(r => r.content);
    }
}

export const nanoMemory = new NanoMemoryService();
