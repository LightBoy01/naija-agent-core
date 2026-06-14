import { logger } from '../utils/logger.js';
import FormData from 'form-data';
import axios from 'axios';

export class AudioService {
    private groqApiKey: string;

    constructor() {
        this.groqApiKey = process.env.GROQ_API_KEY || '';
    }

    async transcribe(buffer: Buffer, mimeType: string, filename: string = 'audio.ogg'): Promise<string | null> {
        if (!this.groqApiKey) {
            logger.warn('⚠️ GROQ_API_KEY is not set. Skipping transcription.');
            return null;
        }

        try {
            const formData = new FormData();
            formData.append('file', buffer, { filename, contentType: mimeType });
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('response_format', 'text');

            const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${this.groqApiKey}`
                }
            });

            // The response format is text, so the data is directly the transcribed string
            const transcription = typeof response.data === 'string' ? response.data : (response.data as any).text;
            
            logger.info({ length: transcription?.length }, '✅ Successfully transcribed audio via Groq Whisper');
            return transcription;
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message }, '❌ Failed to transcribe audio with Groq');
            return null;
        }
    }
}

export const audioService = new AudioService();
