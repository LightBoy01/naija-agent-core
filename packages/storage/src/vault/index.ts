import { Storage } from '@google-cloud/storage';
import { getDb } from '@naija-agent/firebase';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import pino from 'pino';
import { safeParseJSON } from '../utils/json.js';

const logger = pino({ name: 'vault-service' });

// --- GCS Configuration with Sanitization ---
function getStorageClient() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'naija-agent-core';
  let credentials;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const cleanBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.replace(/[^A-Za-z0-9+/=]/g, '');
      const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');
      credentials = JSON.parse(decoded);
    } catch (e) {}
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const startIndex = raw.indexOf('{');
      const jsonStr = startIndex === -1 ? raw.replace(/[^\x00-\x7F]/g, "") : raw.substring(startIndex).replace(/[^\x00-\x7F]/g, "");
      credentials = JSON.parse(jsonStr);
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
  orgId: z.string().optional(), // Added orgId context
  type: z.string(), // Extracted category: [Receipt, Invoice, ..., Voice_Note, Video_Clip]
  title: z.string().optional(),
  summary: z.string(), // "GTBank Transfer of 50k to Tunde"
  content: z.string().optional(), // Full text content or transcription
  extractedData: z.object({
    amount: z.number().optional(),
    currency: z.string().optional(),
    date: z.string().optional(), // ISO String
    issuer: z.string().optional(), // Renamed from sender for broader context
    receiver: z.string().optional(),
    reference: z.string().optional(),
    duration: z.number().optional(), // For Audio/Video (seconds)
  }),
  storageUrl: z.string().optional(), // Public/Signed URL
  gcsUri: z.string().optional(), // gs://bucket/path for Gemini processing
  originalMediaId: z.string().optional(),
  mimeType: z.string(), // 'text/plain', 'image/png', 'audio/ogg', 'video/mp4'
  caption: z.string().optional(),
  createdAt: z.string(), // ISO String
  tags: z.array(z.string()), // ["school_fees", "gtbank", "2026"]
  embedding: z.array(z.number()).optional(), // Multimodal vector
});

export type VaultDocument = z.infer<typeof VaultDocumentSchema>;

// --- Helper Functions ---

async function getMultimodalEmbedding(gcsUri: string, mimeType: string, textContext: string, apiKey: string): Promise<number[]> {
  const genAI = new GoogleGenAI({
    apiKey,
    httpOptions: {
      baseUrl: 'https://aiplatform.googleapis.com',
      apiVersion: 'v1/publishers/google'
    }
  });

  try {
    // Note: 'gemini-embedding-2-preview' supports multimodal inputs
    // We use MRL to request 768 dimensions for efficiency
    const result = await genAI.models.embedContent({
      model: 'models/gemini-embedding-2-preview',
      contents: [{
        parts: [
          { text: textContext },
          { fileData: { fileUri: gcsUri, mimeType } }
        ]
      }]
    });
    
    return result.embeddings?.[0]?.values || [];
  } catch (e: any) {
    logger.error({ error: e.message }, 'Failed to generate multimodal embedding');
    return [];
  }
}

async function uploadToVault(userId: string, buffer: Buffer, mimeType: string): Promise<{ url: string; gcsUri: string }> {
  const bucket = storage.bucket(BUCKET_NAME);
  const fileId = uuidv4();
  const extension = mimeType.split('/')[1] || 'bin';
  const filePath = `vault/${userId}/${fileId}.${extension}`;
  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: mimeType,
    public: true, // For now, keep it public for easy retrieval
    metadata: { userId, type: 'vault_doc' }
  });

  return {
    url: `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`,
    gcsUri: `gs://${BUCKET_NAME}/${filePath}`
  };
}

async function extractMultimodalMetadata(gcsUri: string, mimeType: string, caption: string | undefined, apiKey: string): Promise<any> {
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
    "title": "A concise, descriptive title for this file (e.g., 'Lagos Market Voice Note', 'GTBank Receipt Photo')",
    "summary": "A brief 1-2 sentence summary of the file's contents and purpose.",
    "category": "Must be one of: [Receipt, Invoice, Utility_Bill, Contract, Identity_Doc, Medical_Record, Official_Letter, Ticket, Voice_Note, Video_Clip, Other]",
    "content": "A detailed transcription (if audio) or text OCR/description (if image/video/pdf).",
    "amount": Number or null (extract any total amount found),
    "currency": "String or null (e.g., NGN, USD, GBP)",
    "date": "YYYY-MM-DD or null (the date on the file, or the transaction date)",
    "issuer": "Name of the issuing authority or sender or null",
    "receiver": "Name of the recipient or null",
    "reference": "Any transaction ID, invoice number, or reference code found or null",
    "duration": Number or null (seconds, if audio/video),
    "tags": ["List", "of", "5-10", "search", "keywords"]
  }
  RETURN JSON ONLY, no markdown formatting blocks.
  Caption Context provided by the user: "${caption || ''}"
  `;

  try {
    const result = await genAI.models.generateContent({
      model: SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-2.0-flash',
      contents: [
        { text: prompt },
        { fileData: { fileUri: gcsUri, mimeType: mimeType } }
      ]
    });
    
    const text = result.text || "";
    return safeParseJSON(text) || { summary: 'Processed File', category: 'Other', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message, gcsUri }, 'Multimodal metadata extraction failed');
    return { summary: 'Unprocessed File', category: 'Other', tags: [] };
  }
}

async function extractNoteMetadata(text: string, apiKey: string): Promise<any> {
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
  Analyze this text note. Extract structured data for "The Vault".
  
  {
    "title": "A concise, descriptive title for this note",
    "summary": "A brief 1-2 sentence summary.",
    "category": "Must be 'Note'",
    "amount": Number or null (if financial data is present),
    "currency": "String or null",
    "date": "YYYY-MM-DD or null (if a specific date is mentioned)",
    "tags": ["List", "of", "3-5", "search", "keywords"]
  }
  
  Text: "${text}"
  RETURN JSON ONLY, no markdown formatting blocks.
  `;

  try {
    const result = await genAI.models.generateContent({
      model: SystemConfig.MODELS.AELIXXR_WORKER,
      contents: prompt
    });
    const responseText = result.text || "";
    return safeParseJSON(responseText) || { summary: 'Saved Note', category: 'Note', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message }, 'Note metadata extraction failed');
    return { summary: 'Saved Note', category: 'Note', tags: [] };
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
  logger.info({ userId, mimeType }, '📥 Ingesting multimodal file into Vault...');

  // 1. Upload to Cloud (GCS Directly)
  const { url, gcsUri } = await uploadToVault(userId, buffer, mimeType);
  logger.info({ userId, gcsUri }, '☁️ Uploaded to GCS');

  // 2. Extract Data (Using Multimodal fileUri)
  const analysis = await extractMultimodalMetadata(gcsUri, mimeType, options?.caption, apiKey);
  logger.info({ userId, category: analysis.category }, '🧠 Extracted Multimodal Intelligence');

  // 3. Generate Embedding (The "Memory Vector")
  const embedding = await getMultimodalEmbedding(gcsUri, mimeType, analysis.summary, apiKey);

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
      duration: analysis.duration
    },
    storageUrl: url,
    gcsUri,
    originalMediaId: options?.originalMediaId,
    mimeType,
    caption: options?.caption,
    createdAt: new Date().toISOString(),
    tags: analysis.tags || [],
    embedding
  };

  // Strip undefined properties to prevent Firestore crash
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
  const analysis = await extractNoteMetadata(content, apiKey);
  logger.info({ userId, summary: analysis.summary }, '🧠 extracted note metadata');

  // 2. Save to Database (The "Index")
  const docId = uuidv4();
  const doc: VaultDocument = {
    id: docId,
    userId,
    type: analysis.category || 'Note',
    title: analysis.title || 'Note',
    summary: analysis.summary || 'Saved Note',
    content: content,
    mimeType: 'text/plain',
    extractedData: {
      amount: analysis.amount || null,
      currency: analysis.currency || null,
      date: analysis.date || null,
    },
    createdAt: new Date().toISOString(),
    tags: analysis.tags || []
  };

  if (options?.orgId) {
    doc.orgId = options.orgId;
  }

  // Strip undefined properties to prevent Firestore crash
  const cleanDoc = JSON.parse(JSON.stringify(doc));

  await getDb().collection('vault').doc(userId).collection('docs').doc(docId).set(cleanDoc);
  logger.info({ userId, docId }, '✅ Note Saved to Firestore Index');

  return doc;
}

// --- Main: Search Vault ---
export async function searchVault(userId: string, query: string): Promise<VaultDocument[]> {
    const snapshot = await getDb().collection('vault').doc(userId).collection('docs')
        .orderBy('createdAt', 'desc')
        .limit(100) // Increased limit for LLM processing
        .get();

    const results = snapshot.docs.map(d => d.data() as VaultDocument);
    
    // Basic fallback matching. LLM in worker will refine this further.
    const lowerQuery = query.toLowerCase();
    return results.filter((d: VaultDocument) => 
        (d.title && d.title.toLowerCase().includes(lowerQuery)) ||
        d.summary.toLowerCase().includes(lowerQuery) || 
        (d.content && d.content.toLowerCase().includes(lowerQuery)) || 
        (d.type && d.type.toLowerCase().includes(lowerQuery)) ||
        (d.extractedData?.issuer && d.extractedData.issuer.toLowerCase().includes(lowerQuery)) ||
        d.tags.some((t: string) => t.toLowerCase().includes(lowerQuery))
    );
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
