import { Type } from '@google/genai';
import { AIProvider } from '@naija-agent/ai';
import { logger } from '../utils/logger.js';
import { SystemConfig } from '@naija-agent/types';

export interface PriceGuardResult {
  isSafe: boolean;
  mismatchReason?: string;
  suggestedCorrection?: string;
}

/**
 * Deterministic Price Guard (PHASE 9.3)
 * Intercepts AI responses to prevent price hallucinations.
 */
export class PriceGuard {
  constructor(private ai: AIProvider) {}

  /**
   * Scans text for mentioned prices and validates them against the business knowledge.
   */
  async validateResponse(
    text: string, 
    businessKnowledge: Record<string, string>,
    currency: { code: string, symbol: string }
  ): Promise<PriceGuardResult> {
    
    // 1. Check if the text likely contains a price
    const priceRegex = new RegExp(`(\\d+([.,]\\d+)?\\s*(${currency.code}|${currency.symbol}))|((${currency.code}|${currency.symbol})\\s*\\d+([.,]\\d+)?)`, 'gi');
    if (!priceRegex.test(text) && !/\d+k/i.test(text)) {
      return { isSafe: true };
    }

    logger.info('🛡️ [PRICE GUARD] Price detected in response. Starting deep validation...');

    // 2. Use a lightweight model to extract all mentioned items and prices
    const extractionSchema = {
      type: Type.OBJECT,
      properties: {
        findings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              price: { type: Type.NUMBER },
              raw_mention: { type: Type.STRING }
            },
            required: ["item", "price", "raw_mention"]
          }
        }
      },
      required: ["findings"]
    };

    const prompt = `Extract all items and their mentioned prices from this text. 
    Currency context: ${currency.code} (${currency.symbol}). 
    Example: "Cake is 5k" -> {item: "Cake", price: 5000}.
    
    Text to analyze:
    "${text}"`;

    try {
      const result = await this.ai.generateContent(prompt, {
        model: SystemConfig.MODELS.ZYNUX_WORKER || 'gemini-flash-lite-latest',
        responseMimeType: 'application/json',
        responseSchema: extractionSchema as any
      });

      const data = JSON.parse(result.text);
      if (!data.findings || data.findings.length === 0) {
        return { isSafe: true };
      }

      // 3. Cross-reference with business knowledge
      for (const finding of data.findings) {
        const itemName = finding.item.toLowerCase();
        const mentionedPrice = finding.price;

        // Find the closest match in knowledge keys
        const knowledgeKey = Object.keys(businessKnowledge).find(k => 
          k.toLowerCase().includes(itemName) || itemName.includes(k.toLowerCase())
        );

        if (knowledgeKey) {
          const actualValueRaw = businessKnowledge[knowledgeKey];
          // Try to parse the price from knowledge (e.g. "5000", "5k", "NGN 5,000")
          const actualPrice = this.parseNumericPrice(actualValueRaw);

          if (actualPrice !== null) {
            const diff = Math.abs(mentionedPrice - actualPrice);
            const percentDiff = (diff / actualPrice) * 100;

            if (percentDiff > 5) { // 5% tolerance
              logger.warn({ item: finding.item, mentionedPrice, actualPrice }, '🛑 [PRICE GUARD] Mismatch detected!');
              return {
                isSafe: false,
                mismatchReason: `HALLUCINATION: Item '${finding.item}' mentioned as ${mentionedPrice} ${currency.code} but actual price is ${actualPrice} ${currency.code}.`,
                suggestedCorrection: `The actual price for ${knowledgeKey} is ${actualValueRaw}.`
              };
            }
          }
        }
      }

      return { isSafe: true };

    } catch (err: any) {
      logger.error({ error: err.message }, '⚠️ [PRICE GUARD] Validation failed. Falling back to safe mode.');
      return { isSafe: true }; // Fallback to safe to avoid blocking legitimate messages if guard fails
    }
  }

  private parseNumericPrice(val: string): number | null {
    const cleaned = val.replace(/,/g, '').toLowerCase();
    
    // Handle "5k" or "5.5k"
    if (cleaned.includes('k')) {
       return parseFloat(cleaned.replace('k', '')) * 1000;
    }
    
    // Handle "1m"
    if (cleaned.includes('m')) {
        return parseFloat(cleaned.replace('m', '')) * 1000000;
    }

    const match = cleaned.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }
}
