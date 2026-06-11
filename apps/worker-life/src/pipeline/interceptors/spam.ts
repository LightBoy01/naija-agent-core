import { LifePipelineContext, LifeInterceptor } from '../types.js';
import crypto from 'crypto';
import { redisClient } from '../../index.js';

export const SpamInterceptor: LifeInterceptor = {
  name: 'Spam',
  execute: async (ctx: LifePipelineContext) => {
    // Only apply spam check to text messages
    if (ctx.type !== 'text' || !ctx.message) {
      return ctx;
    }

    const textPayload = ctx.message.trim();
    if (!textPayload) return ctx;

    // Create a short hash of the text
    const textHash = crypto.createHash('md5').update(textPayload).digest('hex');
    
    // Redis key structure: spam_history:<userPhone>:<textHash>
    const spamKey = `spam_history:${ctx.userPhone}:${textHash}`;
    
    // Increment the counter for this specific exact text payload
    const count = await redisClient.incr(spamKey);
    
    if (count === 1) {
      // If it's the first time we see this text, set expiration window (e.g. 10 minutes = 600s)
      await redisClient.expire(spamKey, 600);
    }

    // If the same exact text has been sent 3 or more times within the window
    if (count >= 3) {
      ctx.shortCircuit = true;
      ctx.shortCircuitReason = 'SPAM_REPETITION';
      // Silently drop to prevent bot-to-bot loops. No warning sent!
      return ctx;
    }

    return ctx;
  }
};
