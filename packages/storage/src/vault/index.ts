import { Storage } from '@google-cloud/storage';
import { v2 as cloudinary } from 'cloudinary';
import { getDb } from '@naija-agent/firebase';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import { z } from 'zod';
import pino from 'pino';
import { safeParseJSON } from '../utils/json.js';
import { uploadMedia } from '../upload.js';

const logger = pino({ name: 'vault-service' });

// --- Termux/Android Environment Fix: Ignore TLS issues if CA certificates are missing ---
// ONLY enabled in development mode to prevent security leakage in production.
if (process.env.NODE_ENV !== 'production' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined && process.platform === 'android') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    logger.info('🛡️ [TERMUX FIX]: TLS Verification disabled in Storage Vault (Development Mode ONLY).');
}

// --- GCS Configuration with Sanitization ---
const getStorage = () => {
  return new Storage({
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
};

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'naija-agent-core.firebasestorage.app';

export interface VaultDocument {
  id: string;
  userId: string;
  orgId?: string;
  type: 'Receipt' | 'Invoice' | 'Utility_Bill' | 'Contract' | 'Identity_Doc' | 'Medical_Record' | 'Official_Letter' | 'Ticket' | 'Voice_Note' | 'Video_Clip' | 'Note' | 'Other';
  title: string;
  summary: string;
  content?: string;
  extractedData: {
    amount?: number | null;
    currency?: string | null;
    date?: string | null;
    issuer?: string | null;
    receiver?: string | null;
    reference?: string | null;
    duration?: number | null;
    forensicAnalysis?: string;
  };
  storageUrl?: string;
  gcsUri?: string;
  provider: 'gcs' | 'cloudinary' | 'cloudflare-r2' | 'alibaba' | 'local';
  originalMediaId?: string;
  mimeType: string;
  caption?: string;
  createdAt: string;
  tags: string[];
  embedding?: number[];
}

// --- Internal: Cloud Upload Logic ---
async function uploadToVault(userId: string, buffer: Buffer, mimeType: string, orgId?: string): Promise<{ url: string; gcsUri?: string; provider: VaultDocument['provider'] }> {
  const fileName = `${crypto.randomUUID()}.${mimeType.split('/')[1] || 'bin'}`;
  const effectiveOrgId = orgId || 'vault';
  
  const url = await uploadMedia(effectiveOrgId, fileName, buffer, mimeType);

  let provider: VaultDocument['provider'] = 'local';
  if (url.includes('cloudinary')) provider = 'cloudinary';
  else if (url.includes('r2.dev')) provider = 'cloudflare-r2';
  else if (url.includes('googleapis.com')) provider = 'gcs';

  return {
    url,
    gcsUri: provider === 'gcs' ? `gs://${BUCKET_NAME}/orgs/${effectiveOrgId}/media/${fileName}` : undefined,
    provider
  };
}

// --- Internal: Multi-Modal Extraction ---
async function extractMultimodalMetadata(
    buffer: Buffer, 
    mimeType: string, 
    gcsUri: string | undefined, 
    caption: string | undefined, 
    apiKey: string
): Promise<any> {
  const { SystemConfig } = await import('@naija-agent/types');
  const finalApiKey = process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY || apiKey;
  const modelName = (SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-3.5-flash').replace(/^models\//, '');

  const prompt = `
  You are an elite Forensic Analyst and Document Classification AI for the "Aelixxr Sovereign Vault".
  Analyze this file thoroughly. It is a ${mimeType}.
  
  [FORENSIC MANDATE]:
  If this image appears to be a financial receipt or invoice, you MUST perform a rigorous forensic examination:
  1. Inspect for Photoshop artifacts around text blocks (especially the amount, date, and reference ID).
  2. Check for font inconsistencies (different sizes, kerning issues, blurry text against sharp backgrounds).
  3. Validate that the date makes logical sense.
  4. Ensure the Transaction Reference/ID matches standard patterns for the issuer (e.g., OPay, Monnify, Zenith).
  If you detect any signs of tampering, flag it strictly in the 'forensicAnalysis' field.

  Extract the following JSON structure:
  {
    "title": "A concise, descriptive title for this file",
    "summary": "A brief 1-2 sentence summary.",
    "category": "Must be one of: [Receipt, Invoice, Utility_Bill, Contract, Identity_Doc, Medical_Record, Official_Letter, Ticket, Voice_Note, Video_Clip, Other]",
    "content": "A detailed transcription (if audio) or text OCR/description (if image/video/pdf).",
    "amount": Number or null,
    "currency": "String or null",
    "date": "YYYY-MM-DD or null",
    "issuer": "Name of the issuer or null",
    "receiver": "Name of the recipient or null",
    "reference": "The unique Transaction Reference/ID. LOOK CLOSELY for strings like 'Ref:', 'Txn ID:', 'Session ID:', or a long 10-20 digit sequence. Return null if absolutely not found.",
    "duration": Number or null,
    "forensicAnalysis": "Strict forensic evaluation (Tampering detection, font consistency, alignment check). State 'PASS' or 'FAIL' as the first word, followed by detailed reasons (e.g., 'FAIL: The amount text has a different font weight and noticeable jpeg compression artifacts around the numbers compared to the rest of the document.').",
    "tags": ["List", "of", "5-10", "search", "keywords"]
  }
  RETURN JSON ONLY, no markdown formatting blocks.
  Caption Context provided by the user: "${caption || ''}"
  `;

  try {
    const supportedMimes = [
        'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
        'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac',
        'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
        'application/pdf'
    ];

    if (!supportedMimes.includes(mimeType)) {
        logger.warn({ mimeType }, '⚠️ MimeType not supported for multimodal extraction. Returning generic summary.');
        return { 
            title: caption || 'Uploaded Document', 
            summary: `Saved ${mimeType} file to Vault. Automated content analysis is limited for this format.`, 
            category: 'Other', 
            tags: ['document', 'vault'] 
        };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${finalApiKey}`;
    logger.info({ role: 'Multimodal', model: modelName }, '🖼️ Extracting file metadata via REST');
    
    const body = {
      contents: [{
        parts: [
          { text: prompt },
          gcsUri ? { fileData: { fileUri: gcsUri, mimeType } } : { inlineData: { data: buffer.toString('base64'), mimeType } }
        ]
      }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const result = await response.json() as any;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return safeParseJSON(text) || { summary: 'Processed File', category: 'Other', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message }, 'Multimodal metadata extraction failed via REST');
    return { summary: 'Unprocessed File', category: 'Other', tags: [], content: `Extraction failed: ${e.message}` };
  }
}

async function getMultimodalEmbedding(
    buffer: Buffer, 
    mimeType: string, 
    gcsUri: string | undefined, 
    textContext: string, 
    apiKey: string
): Promise<number[]> {
  const embeddingKey = process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY_EMBEDDING || apiKey;
  const modelName = 'gemini-embedding-2';
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${embeddingKey}`;
    
    const body = {
      content: {
        parts: [
          { text: textContext },
          gcsUri ? { fileData: { fileUri: gcsUri, mimeType } } : { inlineData: { data: buffer.toString('base64'), mimeType } }
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
  } catch (e: any) {
    logger.error({ error: e.message }, 'Failed to generate multimodal embedding via REST');
    return [];
  }
}

// --- Main: Ingest Document ---
export async function ingestDocument(
  userId: string, 
  buffer: Buffer, 
  mimeType: string,
  apiKey: string,
  options?: { orgId?: string; caption?: string; originalMediaId?: string }
): Promise<VaultDocument> {
  logger.info({ userId, mimeType }, '📥 Ingesting file into Multi-Modal Vault...');

  // 1. Upload to Cloud (Bridge Strategy)
  const { url, gcsUri, provider } = await uploadToVault(userId, buffer, mimeType, options?.orgId);
  logger.info({ userId, provider, url, orgId: options?.orgId }, '☁️ Uploaded to Cloud Provider');

  // 2. Extract Data (Using GCS URI or Raw Buffer)
  const analysis = await extractMultimodalMetadata(buffer, mimeType, gcsUri, options?.caption, apiKey);
  logger.info({ userId, category: analysis.category }, '🧠 extracted metadata');

  // 3. Generate Embedding
  const embedding = await getMultimodalEmbedding(buffer, mimeType, gcsUri, analysis.summary, apiKey);

  // 4. Save to Database (The "Index")
  const docId = crypto.randomUUID();
  const doc: VaultDocument = {
    id: docId,
    userId,
    orgId: options?.orgId,
    type: analysis.category || 'Other',
    title: analysis.title || 'Untitled File',
    summary: analysis.summary || 'Uploaded File',
    content: analysis.content,
    extractedData: {
      amount: analysis.amount,
      currency: analysis.currency,
      date: analysis.date,
      issuer: analysis.issuer,
      receiver: analysis.receiver,
      reference: analysis.reference,
      duration: analysis.duration,
      forensicAnalysis: analysis.forensicAnalysis
    },
    storageUrl: url,
    gcsUri,
    provider,
    originalMediaId: options?.originalMediaId,
    mimeType,
    caption: options?.caption,
    createdAt: new Date().toISOString(),
    tags: analysis.tags || [],
    embedding
  };

  const cleanDoc = JSON.parse(JSON.stringify(doc));
  await getDb().collection('vault').doc(userId).collection('docs').doc(docId).set(cleanDoc);
  logger.info({ userId, docId }, '✅ Saved to Multi-Tenant Vault Index');

  return doc;
}

// --- Main: Ingest Note (Text) ---
export async function ingestNote(
  userId: string,
  content: string,
  apiKey: string,
  options?: { orgId?: string }
): Promise<VaultDocument> {
  logger.info({ userId }, '📝 Ingesting note into Vault...');

  // 1. Extract Metadata (The "Intelligence")
  const { SystemConfig } = await import('@naija-agent/types');
  const finalApiKey = process.env.GEMINI_API_KEY_STUDIO || apiKey;
  const modelName = (SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-3.5-flash').replace(/^models\//, '');

  const prompt = `
  Analyze this text note for a Life OS Vault.
  RETURN JSON ONLY: { "title": "...", "summary": "...", "category": "Note", "tags": [] }
  Text: "${content}"
  `;

  let analysis = { title: 'Note', summary: 'Saved Note', category: 'Note', tags: [] };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${finalApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const result = await response.json() as any;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    analysis = safeParseJSON(text) || analysis;
  } catch (e) {}

  // 2. Save to Database
  const docId = crypto.randomUUID();
  const doc: VaultDocument = {
    id: docId,
    userId,
    type: 'Note',
    title: analysis.title,
    summary: analysis.summary,
    content: content,
    mimeType: 'text/plain',
    extractedData: {},
    createdAt: new Date().toISOString(),
    tags: analysis.tags || [],
    provider: 'local'
  };

  if (options?.orgId) doc.orgId = options.orgId;

  const cleanDoc = JSON.parse(JSON.stringify(doc));
  await getDb().collection('vault').doc(userId).collection('docs').doc(docId).set(cleanDoc);
  logger.info({ userId, docId }, '✅ Note Saved to Index');

  return doc;
}

// --- Main: Search Vault ---
export async function searchVault(userId: string, query: string): Promise<VaultDocument[]> {
    logger.info({ userId, query }, '🔍 Searching Vault...');

    // --- ID SEARCH OPTIMIZATION (Security Patch: UUID Detection) ---
    // If the query looks like a UUID, try to fetch it directly first
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(query.trim())) {
        const doc = await getDb().collection('vault').doc(userId).collection('docs').doc(query.trim()).get();
        if (doc.exists) {
            logger.info({ userId, docId: query }, '✅ Found specific document via ID search');
            return [doc.data() as VaultDocument];
        }
    }

    const snapshot = await getDb().collection('vault').doc(userId).collection('docs')
        .orderBy('createdAt', 'desc')
        .limit(100) // Fetch up to 100 for filtering
        .get();

    const results = snapshot.docs.map(d => d.data() as VaultDocument);
    const lowerQuery = query.toLowerCase();
    
    // Filter results
    const filtered = results.filter((d: VaultDocument) => 
        (d.title && d.title.toLowerCase().includes(lowerQuery)) ||
        d.summary.toLowerCase().includes(lowerQuery) || 
        (d.content && d.content.toLowerCase().includes(lowerQuery)) || 
        (d.type && d.type.toLowerCase().includes(lowerQuery)) ||
        (d.extractedData?.issuer && d.extractedData.issuer.toLowerCase().includes(lowerQuery)) ||
        d.tags.some((t: string) => t.toLowerCase().includes(lowerQuery))
    );

    // --- CONTEXT SAFETY: Limit final return to 5 most relevant items ---
    const finalResults = filtered.slice(0, 5);
    logger.info({ userId, query, count: finalResults.length }, '✅ Search completed');
    return finalResults;
}

/**
 * Retrieves a specific file's content and metadata from the Vault using its unique ID.
 */
export async function getVaultFile(userId: string, docId: string): Promise<any> {
    try {
        const doc = await getDb().collection('vault').doc(userId).collection('docs').doc(docId).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    } catch (e) {
        return null;
    }
}

// --- Main: Delete from Vault ---
export async function deleteFromVault(userId: string, docId: string): Promise<boolean> {
  try {
    await getDb().collection('vault').doc(userId).collection('docs').doc(docId).delete();
    logger.info({ userId, docId }, '🗑️ Deleted from Vault');
    return true;
  } catch (error: any) {
    logger.error({ userId, docId, error: error.message }, '❌ Failed to delete from Vault');
    return false;
  }
}
