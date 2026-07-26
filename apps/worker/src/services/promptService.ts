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

    private resolvePromptsDir() {
        const pathsToTry = [
            path.resolve(__dirname, 'prompts'),
            path.resolve(__dirname, '..', '..', 'src', 'prompts'),
            path.resolve(__dirname, '..', 'prompts'),
            path.resolve(process.cwd(), 'apps', 'worker', 'src', 'prompts')
        ];

        for (const p of pathsToTry) {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                this.promptsDir = p;
                logger.info({ resolvedPath: p }, '📂 Zynux Prompts directory resolved');
                return;
            }
        }

        logger.error({ pathsTried: pathsToTry }, '❌ Could not resolve Zynux prompts directory');
        this.promptsDir = path.resolve(__dirname, '..', 'prompts'); 
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

            logger.info({ count: mdFiles.length }, '🧠 Zynux Prompt cache synchronized');
        } catch (error: any) {
            logger.error({ error: error.message }, '❌ Failed to load Zynux prompts');
        }
    }

    public getPrompt(filename: string): string {
        if (this.cache[filename]) {
            return this.cache[filename];
        }
        try {
            const fullPath = path.join(this.promptsDir, filename);
            if (fs.existsSync(fullPath)) {
                logger.warn({ filename }, '⚠️ Zynux Prompt cache miss, reading from disk');
                const content = fs.readFileSync(fullPath, 'utf-8');
                this.cache[filename] = content;
                return content;
            }
        } catch (e) {
            logger.warn({ filename, err: e }, '⚠️ Zynux Prompt disk read failed');
        }

        logger.error({ filename, dir: this.promptsDir }, '❌ Zynux Prompt not found on disk');
        return '';
    }

    public refresh() {
        logger.info('🔄 Hot-Reloading Zynux prompts...');
        this.resolvePromptsDir();
        this.loadAll();
        return true;
    }
}

export const promptService = new PromptService();
