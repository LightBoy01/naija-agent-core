import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export class PromptService {
    private cache: Record<string, string> = {};
    private promptsDir: string;

    constructor() {
        // Resolve absolute path to the prompts directory
        this.promptsDir = path.join(__dirname, '..', 'prompts');
        this.loadAll();
    }

    /**
     * Loads all .md files from the prompts directory into RAM.
     */
    public loadAll() {
        try {
            const files = fs.readdirSync(this.promptsDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));

            for (const file of mdFiles) {
                const content = fs.readFileSync(path.join(this.promptsDir, file), 'utf-8');
                this.cache[file] = content;
            }

            logger.info({ count: mdFiles.length }, '🧠 Prompt cache synchronized');
        } catch (error: any) {
            logger.error({ error: error.message }, '❌ Failed to load prompts');
        }
    }

    /**
     * Retrieves a specific prompt from the cache.
     * Falls back to disk if not in cache (safety).
     */
    public getPrompt(filename: string): string {
        if (this.cache[filename]) {
            return this.cache[filename];
        }

        try {
            logger.warn({ filename }, '⚠️ Prompt cache miss, reading from disk');
            const content = fs.readFileSync(path.join(this.promptsDir, filename), 'utf-8');
            this.cache[filename] = content; // Update cache
            return content;
        } catch (e) {
            logger.error({ filename }, '❌ Prompt not found on disk');
            return '';
        }
    }

    /**
     * Force-reloads all prompts from disk.
     */
    public refresh() {
        logger.info('🔄 Hot-Reloading prompts...');
        this.loadAll();
        return true;
    }
}

export const promptService = new PromptService();
