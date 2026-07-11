import { Storage } from '@google-cloud/storage';
import { v2 as cloudinary } from 'cloudinary';
import { getDb } from '@naija-agent/database';
import { vaultDocuments } from '@naija-agent/database';
import { eq, sql, desc, like, or } from 'drizzle-orm';
import { SystemConfig } from '@naija-agent/types';
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
  const finalApiKey = process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY || apiKey;
  const modelName = SystemConfig.MODELS.VAULT_EXTRACTION;

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
  const modelName = SystemConfig.MODELS.EMBEDDING;
  
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
    const fullVector = result.embedding?.values || [];
    return fullVector.slice(0, 768);
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

  // 4. Save to Database (PostgreSQL via Drizzle)
  const docId = crypto.randomUUID();
  const now = new Date();
  
  const db = getDb();
  await db.insert(vaultDocuments).values({
    id: docId,
    userId,
    orgId: options?.orgId || null,
    type: analysis.category || 'Other',
    title: analysis.title || 'Untitled File',
    summary: analysis.summary || 'Uploaded File',
    content: analysis.content || null,
    extractedData: {
      amount: analysis.amount ?? null,
      currency: analysis.currency ?? null,
      date: analysis.date ?? null,
      issuer: analysis.issuer ?? null,
      receiver: analysis.receiver ?? null,
      reference: analysis.reference ?? null,
      duration: analysis.duration ?? null,
      forensicAnalysis: analysis.forensicAnalysis ?? null,
    },
    storageUrl: url,
    gcsUri: gcsUri || null,
    provider: provider || 'local',
    originalMediaId: options?.originalMediaId || null,
    mimeType,
    caption: options?.caption || null,
    tags: analysis.tags || [],
    embedding: embedding.length > 0 ? embedding : null,
    createdAt: now,
    updatedAt: now,
  });
  logger.info({ userId, docId }, '✅ Saved to PostgreSQL Vault (vault_documents)');

  return {
    id: docId,
    userId,
    orgId: options?.orgId,
    type: analysis.category || 'Other',
    title: analysis.title || 'Untitled File',
    summary: analysis.summary || 'Uploaded File',
    content: analysis.content || undefined,
    extractedData: {
      amount: analysis.amount ?? null,
      currency: analysis.currency ?? null,
      date: analysis.date ?? null,
      issuer: analysis.issuer ?? null,
      receiver: analysis.receiver ?? null,
      reference: analysis.reference ?? null,
      duration: analysis.duration ?? null,
      forensicAnalysis: analysis.forensicAnalysis ?? null,
    },
    storageUrl: url,
    gcsUri: gcsUri || undefined,
    provider: provider || 'local',
    originalMediaId: options?.originalMediaId || undefined,
    mimeType,
    caption: options?.caption || undefined,
    createdAt: now.toISOString(),
    tags: analysis.tags || [],
    embedding: embedding.length > 0 ? embedding : undefined,
  } as VaultDocument;
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
  const finalApiKey = process.env.GEMINI_API_KEY_STUDIO || apiKey;
  const modelName = SystemConfig.MODELS.VAULT_EXTRACTION;

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

  // 2. Save to Database (PostgreSQL)
  const docId = crypto.randomUUID();
  const now = new Date();
  
  const db = getDb();
  await db.insert(vaultDocuments).values({
    id: docId,
    userId,
    orgId: options?.orgId || null,
    type: 'Note',
    title: analysis.title,
    summary: analysis.summary,
    content,
    mimeType: 'text/plain',
    extractedData: {},
    tags: analysis.tags || [],
    provider: 'local',
    createdAt: now,
    updatedAt: now,
  });
  logger.info({ userId, docId }, '✅ Note Saved to PostgreSQL Vault');

  return {
    id: docId,
    userId,
    orgId: options?.orgId,
    type: 'Note',
    title: analysis.title,
    summary: analysis.summary,
    content,
    mimeType: 'text/plain',
    extractedData: {},
    createdAt: now.toISOString(),
    tags: analysis.tags || [],
    provider: 'local',
  } as VaultDocument;
}

// --- Main: Search Vault ---
export async function searchVault(userId: string, query: string): Promise<VaultDocument[]> {
    logger.info({ userId, query }, '🔍 Searching PostgreSQL Vault...');

    const db = getDb();
    const lowerQuery = query.toLowerCase();
    const tokens = lowerQuery.split(/\s+/).filter(t => t.length > 1);

    // --- ID SEARCH OPTIMIZATION: UUID Detection ---
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(query.trim())) {
        const docs = await db.select().from(vaultDocuments)
            .where(sql`${vaultDocuments.userId} = ${userId} AND ${vaultDocuments.id} = ${query.trim()}`)
            .limit(1);
        if (docs.length > 0) {
            logger.info({ userId, docId: query }, '✅ Found specific document via ID search');
            return docs.map(rowToVaultDoc);
        }
    }

    // Full-text search: fetch all user docs and filter in-memory (tokens across fields)
    const allDocs = await db.select().from(vaultDocuments)
        .where(sql`${vaultDocuments.userId} = ${userId}`)
        .orderBy(desc(vaultDocuments.createdAt))
        .limit(200);

    const results = allDocs.map(rowToVaultDoc);
    
    const filtered = results.filter((d: VaultDocument) => {
        const fieldText = [
            d.title || '',
            d.summary || '',
            d.content || '',
            d.type || '',
            d.extractedData?.issuer || '',
            ...(d.tags || [])
        ].map(f => f.toLowerCase()).join(' ');
        
        return tokens.every(token => fieldText.includes(token));
    });

    const finalResults = filtered.slice(0, 5);
    logger.info({ userId, query, count: finalResults.length }, '✅ PostgreSQL vault search completed');
    return finalResults;
}

function rowToVaultDoc(row: typeof vaultDocuments.$inferSelect): VaultDocument {
  return {
    id: row.id,
    userId: row.userId,
    orgId: row.orgId ?? undefined,
    type: row.type as VaultDocument['type'],
    title: row.title ?? 'Untitled',
    summary: row.summary,
    content: row.content ?? undefined,
    extractedData: (row.extractedData as any) ?? {},
    storageUrl: row.storageUrl ?? undefined,
    gcsUri: row.gcsUri ?? undefined,
    provider: (row.provider as VaultDocument['provider']) ?? 'local',
    originalMediaId: row.originalMediaId ?? undefined,
    mimeType: row.mimeType,
    caption: row.caption ?? undefined,
    createdAt: row.createdAt.toISOString(),
    tags: (row.tags as string[]) ?? [],
    embedding: (row.embedding as any)?.data,
  };
}

/**
 * Retrieves a specific file's content and metadata from the Vault using its unique ID.
 */
export async function getVaultFile(userId: string, docId: string): Promise<any> {
    try {
        const db = getDb();
        const docs = await db.select().from(vaultDocuments)
            .where(sql`${vaultDocuments.userId} = ${userId} AND ${vaultDocuments.id} = ${docId}`)
            .limit(1);
        if (!docs.length) return null;
        return rowToVaultDoc(docs[0]);
    } catch (e) {
        return null;
    }
}

// --- Main: Delete from Vault ---
export async function deleteFromVault(userId: string, docId: string): Promise<boolean> {
  try {
    const db = getDb();
    await db.delete(vaultDocuments).where(
      sql`${vaultDocuments.userId} = ${userId} AND ${vaultDocuments.id} = ${docId}`
    );
    logger.info({ userId, docId }, '🗑️ Deleted from PostgreSQL Vault');
    return true;
  } catch (error: any) {
    logger.error({ userId, docId, error: error.message }, '❌ Failed to delete from PostgreSQL Vault');
    return false;
  }
}
