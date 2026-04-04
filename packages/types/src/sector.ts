import { Tool } from '@google/generative-ai';
import { z } from 'zod';

// --- SECTOR AGNOSTIC DEFINITIONS (PHASE 8.3) ---

/**
 * Defines the schema for a generic "Entity" (Product, Patient, Property).
 * Used by the UI to render forms and by the AI to ask questions.
 */
export interface EntityDefinition {
  name: string; // "Product", "Patient", "Case"
  plural: string; // "Products", "Patients", "Cases"
  fields: {
    key: string; // "price", "diagnosis", "rent"
    label: string; // "Price (NGN)", "Medical Diagnosis", "Annual Rent"
    type: 'string' | 'number' | 'boolean' | 'date' | 'image' | 'enum';
    options?: string[]; // For enum types
    required: boolean;
    description?: string; // Hint for the AI
  }[];
}

/**
 * Defines the valid states and transitions for a transaction.
 * e.g. Commerce: Pending -> Paid -> Delivered
 * e.g. Health: Triage -> Confirmed -> Completed
 */
export interface WorkflowDefinition {
  name: string; // "Order Fulfillment", "Appointment Booking"
  states: string[]; // ["pending", "paid", "shipped", "delivered"]
  transitions: {
    from: string;
    to: string;
    action: string; // "mark_paid", "ship_item"
    requiredFields?: string[]; // Fields required to move to next state (e.g. "tracking_number")
  }[];
}

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
  execute?: (toolName: string, args: any, deps: any) => Promise<any>;
}
