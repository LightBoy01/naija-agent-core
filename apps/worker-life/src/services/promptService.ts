import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export class PromptService {
    private cache: Record<string, string> = {};
    private promptsDir: string = '';

    constructor() {
        this.resolvePromptsDir();
        this.loadAll();
    }

    /**
     * Attempts to find the prompts directory in multiple locations
     * to support both ts-node (dev) and node (dist/prod).
     */
    private resolvePromptsDir() {
        const pathsToTry = [
            path.join(__dirname, '..', 'prompts'),          // Relative to src/services or dist/services
            path.join(process.cwd(), 'src', 'prompts'),     // Local dev from apps/worker-life root
            path.join(process.cwd(), 'dist', 'prompts'),    // Production from apps/worker-life root
            path.join(__dirname, '..', '..', 'src', 'prompts') // Deep nested check
        ];

        for (const p of pathsToTry) {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                this.promptsDir = p;
                logger.info({ resolvedPath: p }, '📂 Prompts directory resolved');
                return;
            }
        }

        logger.error('❌ Could not resolve prompts directory in any known location');
        // Fallback to current __dirname parent just in case
        this.promptsDir = path.join(__dirname, '..', 'prompts');
    }

    public loadAll() {
        if (!this.promptsDir || !fs.existsSync(this.promptsDir)) return;

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

    public getPrompt(filename: string): string {
        if (this.cache[filename]) {
            return this.cache[filename];
        }

        try {
            const fullPath = path.join(this.promptsDir, filename);
            if (fs.existsSync(fullPath)) {
                logger.warn({ filename }, '⚠️ Prompt cache miss, reading from disk');
                const content = fs.readFileSync(fullPath, 'utf-8');
                this.cache[filename] = content;
                return content;
            }
        } catch (e) {}

        logger.error({ filename, dir: this.promptsDir }, '❌ Prompt not found on disk');
        return '';
    }

    public refresh() {
        logger.info('🔄 Hot-Reloading prompts...');
        this.resolvePromptsDir();
        this.loadAll();
        return true;
    }
}

export const promptService = new PromptService();
