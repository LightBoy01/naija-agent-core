import { Storage } from '@google-cloud/storage';
import { v2 as cloudinary } from 'cloudinary';
import { getDb } from '@naija-agent/firebase';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import pino from 'pino';
import { safeParseJSON } from '../utils/json.js';

const logger = pino({ name: 'vault-service' });

// --- Termux/Android Environment Fix: Ignore TLS issues if CA certificates are missing ---
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined && process.platform === 'android') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    logger.info('🛡️ [TERMUX FIX]: TLS Verification disabled in Storage Vault.');
}

// --- GCS Configuration with Sanitization ---
function getStorageClient() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'naija-agent-core';
  let credentials;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const cleanBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.replace(/[^A-Za-z0-9+/=]/g, '');
      const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');
      const sanitized = decoded.replace(/[\n\r]/g, '');
      credentials = JSON.parse(sanitized);
    } catch (e) {}
  }

  return new Storage({
    projectId,
    ...(credentials ? { credentials } : {})
  });
}

const storage = getStorageClient();
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'naija-agent-core.firebasestorage.app';

// --- The Vault Document Schema ---
export const VaultDocumentSchema = z.object({
  id: z.string(),
  userId: z.string(), // WhatsApp Phone ID
  orgId: z.string().optional(),
  type: z.string(), 
  title: z.string().optional(),
  summary: z.string(),
  content: z.string().optional(),
  extractedData: z.object({
    amount: z.number().optional(),
    currency: z.string().optional(),
    date: z.string().optional(),
    issuer: z.string().optional(),
    receiver: z.string().optional(),
    reference: z.string().optional(),
    duration: z.number().optional(),
    forensicAnalysis: z.string().optional(),
  }),
  storageUrl: z.string().optional(), // Public/Signed URL (Cloudinary or GCS)
  gcsUri: z.string().optional(), // gs:// path if on GCS
  provider: z.enum(['cloudinary', 'gcs']).optional(),
  originalMediaId: z.string().optional(),
  mimeType: z.string(),
  caption: z.string().optional(),
  createdAt: z.string(),
  tags: z.array(z.string()),
  embedding: z.array(z.number()).optional(),
});

export type VaultDocument = z.infer<typeof VaultDocumentSchema>;

// --- Helper Functions ---

async function uploadToGCS(userId: string, buffer: Buffer, mimeType: string): Promise<{ url: string; gcsUri: string; provider: 'gcs' }> {
    const bucket = storage.bucket(BUCKET_NAME);
    const fileId = uuidv4();
    const extension = mimeType.split('/')[1] || 'bin';
    const filePath = `vault/${userId}/${fileId}.${extension}`;
    const file = bucket.file(filePath);
  
    await file.save(buffer, {
      contentType: mimeType,
      public: true,
      metadata: { userId, type: 'vault_doc' }
    });
  
    return {
      url: `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`,
      gcsUri: `gs://${BUCKET_NAME}/${filePath}`,
      provider: 'gcs'
    };
}

async function uploadToVault(userId: string, buffer: Buffer, mimeType: string): Promise<{ url: string; gcsUri?: string; provider: 'cloudinary' | 'gcs' }> {
  // 1. Primary: Cloudinary (Free & Scalable "Bridge")
  const cloudUrl = process.env.CLOUDINARY_URL;
  logger.info({ hasUrl: !!cloudUrl }, '🔍 Checking Cloudinary URL...');
  
  if (cloudUrl) {
    cloudinary.config({
      cloudinary_url: cloudUrl,
      secure: true
    });
    
    logger.info({ userId }, '☁️ Uploading to Cloudinary Bridge...');
    try {
        const result: any = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: `aelixxr/vault/${userId}`,
                resource_type: 'auto',
                tags: [userId, 'aelixxr-vault'],
                timeout: 60000 // 60 seconds
              },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            );
            uploadStream.end(buffer);
          });
          return {
            url: result.secure_url,
            provider: 'cloudinary'
          };
    } catch (error: any) {
        logger.warn({ error: error.message }, '⚠️ Cloudinary upload failed, falling back to GCS...');
        return uploadToGCS(userId, buffer, mimeType);
    }
  }

  // 2. Fallback: GCS (Native / Blaze Plan)
  return uploadToGCS(userId, buffer, mimeType);
}

async function extractMultimodalMetadata(
    buffer: Buffer, 
    mimeType: string, 
    gcsUri: string | undefined, 
    caption: string | undefined, 
    apiKey: string
): Promise<any> {
  const { SystemConfig } = await import('@naija-agent/types');
  const genAI = new GoogleGenAI({
    apiKey,
    httpOptions: {
      baseUrl: 'https://aiplatform.googleapis.com',
      apiVersion: 'v1/publishers/google'
    }
  });

  const prompt = `
  You are an expert Document Classification and Extraction AI for a "Life OS" Vault.
  Analyze this file thoroughly. It is a ${mimeType}.
  
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
    "forensicAnalysis": "Strict forensic evaluation (Tampering detection, font consistency, alignment check). If it's a receipt, state 'PASS' or 'FAIL' and provide reasons.",
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

    const modelName = SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-3.1-flash-lite-preview';
    logger.info({ role: 'Multimodal', model: modelName }, '🖼️ Extracting file metadata');
    
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          // Strategy: Use fileUri if on GCS (Efficient), otherwise send raw bytes (Bridge)
          gcsUri ? { fileData: { fileUri: gcsUri, mimeType } } : { inlineData: { data: buffer.toString('base64'), mimeType } }
        ]
      }]
    });
    const text = result.text || "";
    return safeParseJSON(text) || { summary: 'Processed File', category: 'Other', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message }, 'Multimodal metadata extraction failed');
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
  const embeddingKey = process.env.GEMINI_EMBEDDING_API_KEY || apiKey;
  const useBypass = !process.env.GEMINI_EMBEDDING_API_KEY;

  const genAI = new GoogleGenAI({
    apiKey: embeddingKey,
    ...(useBypass ? {
      httpOptions: {
        baseUrl: 'https://aiplatform.googleapis.com',
        apiVersion: 'v1/publishers/google'
      }
    } : {})
  });

  try {
    const supportedMimes = [
        'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
        'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac',
        'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
        'application/pdf'
    ];

    if (!supportedMimes.includes(mimeType)) {
        logger.warn({ mimeType }, '⚠️ MimeType not supported for multimodal embedding. Skipping vector generation.');
        return [];
    }

    const modelName = 'gemini-embedding-2';
    logger.info({ role: 'Embedding', model: modelName }, '🧬 Generating vector embedding');

    const result = await genAI.models.embedContent({
      model: modelName,
      contents: [{
        role: 'user',
        parts: [
          { text: textContext },
          gcsUri ? { fileData: { fileUri: gcsUri, mimeType } } : { inlineData: { data: buffer.toString('base64'), mimeType } }
        ]
      }],
      config: {
        outputDimensionality: 768
      }
    });
      
      return result.embeddings?.[0]?.values || [];
    } catch (e: any) {
      logger.error({ error: e.message }, 'Failed to generate multimodal embedding');
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
  const { url, gcsUri, provider } = await uploadToVault(userId, buffer, mimeType);
  logger.info({ userId, provider, url }, '☁️ Uploaded to Cloud Provider');

  // 2. Extract Data (Using GCS URI or Raw Buffer)
  const analysis = await extractMultimodalMetadata(buffer, mimeType, gcsUri, options?.caption, apiKey);
  logger.info({ userId, category: analysis.category }, '🧠 extracted metadata');

  // 3. Generate Embedding
  const embedding = await getMultimodalEmbedding(buffer, mimeType, gcsUri, analysis.summary, apiKey);

  // 4. Save to Database (The "Index")
  const docId = uuidv4();
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
  const genAI = new GoogleGenAI({
    apiKey,
    httpOptions: {
      baseUrl: 'https://aiplatform.googleapis.com',
      apiVersion: 'v1/publishers/google'
    }
  });

  const prompt = `
  Analyze this text note for a Life OS Vault.
  RETURN JSON ONLY: { "title": "...", "summary": "...", "category": "Note", "tags": [] }
  Text: "${content}"
  `;

  let analysis = { title: 'Note', summary: 'Saved Note', category: 'Note', tags: [] };
  try {
    const result = await genAI.models.generateContent({
        model: SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    analysis = safeParseJSON(result.text || "") || analysis;
  } catch (e) {}

  // 2. Save to Database
  const docId = uuidv4();
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
    tags: analysis.tags || []
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
