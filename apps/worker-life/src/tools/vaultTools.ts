import { Type } from '@google/genai';
import { logger } from '../utils/logger.js';
import { searchVault, ingestNote, deleteFromVault, getVaultFile } from '@naija-agent/storage';

export const VAULT_TOOLS = [
    {
      name: 'search_vault',
      description: 'Search the user\'s personal document vault for receipts, bank alerts, contracts, or saved notes.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The search term (e.g. "GTBank", "School Fees", "Rent").' }
        },
        required: ['query']
      }
    },
    {
      name: 'save_note',
      description: 'Save a text-based memory or note to the Vault. Use this when the user says "Remember this", "Save this note", or tells you a fact they want to recall later.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          note: { type: Type.STRING, description: 'The text content to save (e.g. "Gate code is 1234", "Auntie Tope\'s birthday is Oct 5").' }
        },
        required: ['note']
      }
    },
    {
      name: 'get_vault_file',
      description: 'Retrieve a specific document or file from the Vault using its unique ID. Use this when you have a DocID and need to read the full content, forensic analysis, or extracted metadata of that specific file.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          docId: { type: Type.STRING, description: 'The unique ID of the document/file to retrieve.' }
        },
        required: ['docId']
      }
    },
    {
      name: 'delete_from_vault',
      description: 'Delete a document or note from the Vault using its ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          docId: { type: Type.STRING, description: 'The unique ID of the document/note to delete.' }
        },
        required: ['docId']
      }
    }
];

export async function executeVaultTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    if (name === 'delete_from_vault' && (!args.docId || args.docId === 'undefined' || args.docId === 'null' || args.docId.length < 5 || args.docId.includes('document_id'))) {
        logger.warn({ tool: name, docId: args.docId }, '🚨 Hallucination Guard: Blocked suspicious document ID');
        return { error: 'Oga, I need the exact Document ID to delete it. Please use the search tool first to find the right ID.' };
    }

    switch (name) {
      case 'search_vault':
        return await searchVault(args.userId, args.query);

      case 'save_note':
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock-key';
        return await ingestNote(args.userId, args.note, apiKey);

      case 'get_vault_file':
        return await getVaultFile(args.userId, args.docId);

      case 'delete_from_vault':
        return await deleteFromVault(args.userId, args.docId);

      default:
        throw new Error(`Unknown Vault tool: ${name}`);
    }
}
