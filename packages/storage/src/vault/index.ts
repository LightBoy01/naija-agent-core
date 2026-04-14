import { getStorage } from 'firebase-admin/storage';
import { getDb } from '@naija-agent/firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import pino from 'pino';
import { safeParseJSON } from '../utils/json.js';

const logger = pino({ name: 'vault-service' });

// --- The Vault Document Schema ---
export const VaultDocumentSchema = z.object({
  id: z.string(),
  userId: z.string(), // WhatsApp Phone ID
  orgId: z.string().optional(), // Added orgId context
  type: z.string(), // Extracted category
  title: z.string().optional(),
  summary: z.string(), // "GTBank Transfer of 50k to Tunde"
  content: z.string().optional(), // Full text content for notes
  extractedData: z.object({
    amount: z.number().optional(),
    currency: z.string().optional(),
    date: z.string().optional(), // ISO String
    issuer: z.string().optional(), // Renamed from sender for broader context
    receiver: z.string().optional(),
    reference: z.string().optional(),
  }),
  storageUrl: z.string().optional(), // Permanent URL (Optional for notes)
  originalMediaId: z.string().optional(),
  mimeType: z.string(), // 'text/plain' for notes
  caption: z.string().optional(),
  createdAt: z.string(), // ISO String
  tags: z.array(z.string()), // ["school_fees", "gtbank", "2026"]
});

export type VaultDocument = z.infer<typeof VaultDocumentSchema>;

// --- Helper Functions ---

async function uploadToVault(userId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const bucket = getStorage().bucket();
  const fileId = uuidv4();
  const extension = mimeType.split('/')[1] || 'bin';
  const filePath = `vault/${userId}/${fileId}.${extension}`;
  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: mimeType,
    public: true, 
    metadata: { userId, type: 'vault_doc' }
  });

  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

async function extractMetadata(buffer: Buffer, mimeType: string, caption: string | undefined, apiKey: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
  You are an expert Document Classification and Extraction AI for a "Life OS" Vault.
  Analyze this document or image thoroughly. Extract the following JSON structure:
  {
    "title": "A concise, descriptive title for this document (e.g., 'GTBank Transfer Receipt - 15,000 NGN', 'IKEDC Electricity Bill - March 2026')",
    "summary": "A brief 1-2 sentence summary of the document's contents and purpose.",
    "category": "Must be one of: [Receipt, Invoice, Utility_Bill, Contract, Identity_Doc, Medical_Record, Official_Letter, Ticket, Other]",
    "amount": Number or null (extract any total amount, payment, or balance. Do not include currency symbols),
    "currency": "String or null (e.g., NGN, USD, GBP)",
    "date": "YYYY-MM-DD or null (the date on the document, or the transaction date)",
    "issuer": "Name of the issuing authority, company, or sender (e.g., 'MTN Nigeria', 'Lagos State Government') or null",
    "receiver": "Name of the recipient or beneficiary or null",
    "reference": "Any transaction ID, invoice number, account number, or reference code found or null",
    "tags": ["List", "of", "5-10", "search", "keywords", "related", "to", "the", "content", "for", "indexing"]
  }
  RETURN JSON ONLY, no markdown formatting blocks.
  Caption Context provided by the user: "${caption || ''}"
  `;

  try {
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: buffer.toString('base64'), mimeType } }
    ]);
    const text = result.response.text();
    return safeParseJSON(text) || { summary: 'Processed Document', category: 'Other', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message }, 'Metadata extraction failed');
    return { summary: 'Unprocessed Document', category: 'Other', tags: [] };
  }
}

async function extractNoteMetadata(text: string, apiKey: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
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
  logger.info({ userId, mimeType }, '📥 Ingesting document into Vault...');

  // 1. Upload to Cloud (The "Hard Copy")
  const storageUrl = await uploadToVault(userId, buffer, mimeType);
  logger.info({ userId, storageUrl }, '☁️ Uploaded to Storage');

  // 2. Extract Data (The "Intelligence")
  const analysis = await extractMetadata(buffer, mimeType, options?.caption, apiKey);
  logger.info({ userId, summary: analysis.summary }, '🧠 extracted metadata');

  // 3. Save to Database (The "Index")
  const docId = uuidv4();
  const doc: VaultDocument = {
    id: docId,
    userId,
    orgId: options?.orgId,
    type: analysis.category || 'Other',
    title: analysis.title || 'Untitled Document',
    summary: analysis.summary || 'Uploaded Document',
    extractedData: {
      amount: analysis.amount,
      currency: analysis.currency,
      date: analysis.date,
      issuer: analysis.issuer,
      receiver: analysis.receiver,
      reference: analysis.reference
    },
    storageUrl,
    originalMediaId: options?.originalMediaId,
    mimeType,
    caption: options?.caption,
    createdAt: new Date().toISOString(),
    tags: analysis.tags || []
  };

  await getDb().collection('vault').doc(userId).collection('docs').doc(docId).set(doc);
  logger.info({ userId, docId }, '✅ Saved to Firestore Index');

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
    orgId: options?.orgId,
    type: analysis.category || 'Note',
    title: analysis.title || 'Note',
    summary: analysis.summary || 'Saved Note',
    content: content,
    extractedData: {
      amount: analysis.amount,
      currency: analysis.currency,
      date: analysis.date,
    },
    mimeType: 'text/plain',
    createdAt: new Date().toISOString(),
    tags: analysis.tags || []
  };

  await getDb().collection('vault').doc(userId).collection('docs').doc(docId).set(doc);
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
