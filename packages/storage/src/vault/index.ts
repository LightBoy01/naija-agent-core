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
  type: z.enum(['receipt', 'invoice', 'contract', 'id_card', 'bank_alert', 'note', 'other']),
  summary: z.string(), // "GTBank Transfer of 50k to Tunde"
  content: z.string().optional(), // Full text content for notes
  extractedData: z.object({
    amount: z.number().optional(),
    date: z.string().optional(), // ISO String
    sender: z.string().optional(),
    receiver: z.string().optional(),
    reference: z.string().optional(),
  }),
  storageUrl: z.string().optional(), // Permanent URL (Optional for notes)
  mimeType: z.string(), // 'text/plain' for notes
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

async function extractMetadata(buffer: Buffer, mimeType: string, apiKey: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
  You are the Chief Archivist. Analyze this document/image.
  Goal: Extract structured data for "The Vault".
  [EXTRACTION RULES]:
  1. TYPE: Classify as 'receipt', 'invoice', 'contract', 'id_card', 'bank_alert', or 'other'.
  2. SUMMARY: Write a 1-sentence summary.
  3. DATA: Extract: amount, date, sender, receiver, reference.
  4. TAGS: Generate 3-5 tags.
  Return JSON ONLY.
  `;

  try {
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: buffer.toString('base64'), mimeType } }
    ]);
    const text = result.response.text();
    return safeParseJSON(text) || { summary: 'Processed Document', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message }, 'Metadata extraction failed');
    return { summary: 'Unprocessed Document', tags: [] };
  }
}

async function extractNoteMetadata(text: string, apiKey: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
  You are the Chief Archivist. Analyze this text note.
  Goal: Extract structured data for "The Vault".
  [EXTRACTION RULES]:
  1. SUMMARY: Write a 1-sentence summary.
  2. DATA: Extract any financial data or dates if present.
  3. TAGS: Generate 3-5 tags for search.

  Text: "${text}"

  Return JSON ONLY: { "summary": string, "amount": number?, "date": string?, "tags": string[] }
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return safeParseJSON(responseText) || { summary: 'Saved Note', tags: [] };
  } catch (e: any) {
    logger.error({ error: e.message }, 'Note metadata extraction failed');
    return { summary: 'Saved Note', tags: [] };
  }
}

// --- Main: Ingest Document ---
export async function ingestDocument(
  userId: string, 
  buffer: Buffer, 
  mimeType: string,
  apiKey: string
): Promise<VaultDocument> {
  logger.info({ userId, mimeType }, '📥 Ingesting document into Vault...');

  // 1. Upload to Cloud (The "Hard Copy")
  const storageUrl = await uploadToVault(userId, buffer, mimeType);
  logger.info({ userId, storageUrl }, '☁️ Uploaded to Storage');

  // 2. Extract Data (The "Intelligence")
  const analysis = await extractMetadata(buffer, mimeType, apiKey);
  logger.info({ userId, summary: analysis.summary }, '🧠 extracted metadata');

  // 3. Save to Database (The "Index")
  const docId = uuidv4();
  const doc: VaultDocument = {
    id: docId,
    userId,
    type: analysis.type || 'other',
    summary: analysis.summary || 'Uploaded Document',
    extractedData: {
      amount: analysis.amount,
      date: analysis.date,
      sender: analysis.sender,
      receiver: analysis.receiver,
      reference: analysis.reference
    },
    storageUrl,
    mimeType,
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
  apiKey: string
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
    type: 'note',
    summary: analysis.summary || 'Saved Note',
    content: content,
    extractedData: {
      amount: analysis.amount,
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
        .limit(50) // Increased limit for MVP scalability
        .get();

    const results = snapshot.docs.map(d => d.data() as VaultDocument);
    
    const lowerQuery = query.toLowerCase();
    return results.filter((d: VaultDocument) => 
        d.summary.toLowerCase().includes(lowerQuery) || 
        (d.content && d.content.toLowerCase().includes(lowerQuery)) || 
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
