import { Tool } from '@google/genai';
import { z } from 'zod';

// --- SECTOR AGNOSTIC DEFINITIONS (PHASE 8.3) ---

export const EntityDefinitionSchema = z.object({
  name: z.string(),
  plural: z.string(),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'date', 'image', 'enum', 'reference', 'array']),
    options: z.array(z.string()).optional(),
    required: z.boolean(),
    description: z.string().optional(),
    refEntity: z.string().optional(), // If type === 'reference', which entity does it point to?
    arrayType: z.enum(['string', 'number', 'reference']).optional(), // If type === 'array', what does it hold?
  }))
});

/**
 * Defines the schema for a generic "Entity" (Product, Patient, Property).
 * Used by the UI to render forms and by the AI to ask questions.
 */
export type EntityDefinition = z.infer<typeof EntityDefinitionSchema>;

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  states: z.array(z.string()),
  transitions: z.array(z.object({
    from: z.string(),
    to: z.string(),
    action: z.string(),
    requiredFields: z.array(z.string()).optional()
  }))
});

/**
 * Defines the valid states and transitions for a transaction.
 * e.g. Commerce: Pending -> Paid -> Delivered
 * e.g. Health: Triage -> Confirmed -> Completed
 */
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * A Sector Pack bundles the Tools, Prompts, and Definitions for a specific industry.
 */
export interface SectorPack {
  id: string; // "commerce", "health", "legal"
  name: string; // "Commerce Pack", "Clinical Pack"
  description: string;
  
  // Data Definitions
  entityDef: EntityDefinition;
  workflowDef: WorkflowDefinition;

  // AI Configuration
  systemPrompt: string; // The base personality "You are a Sales Assistant..."
  tools: Tool[]; // The specific tools (add_to_cart vs book_appointment)

  // Execution Logic (The "Brain")
  execute?: (toolName: string, args: Record<string, unknown>, deps: unknown) => Promise<unknown>;
}
