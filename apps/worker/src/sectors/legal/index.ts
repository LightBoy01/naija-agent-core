import { Type } from '@google/genai';
import { SectorPack } from '@naija-agent/types';
import { CountryCode } from 'libphonenumber-js';

/**
 * ⚖️ LegalPack Sector (Sovereign Bureaucracy Defense)
 * Focuses on Nigerian law research, contract analysis, and citizen rights.
 */

export function getLegalPack(currency: { code: string, symbol: string }, region: CountryCode = 'NG'): SectorPack {
  const legalEntity = {
    name: "Legal Case",
    plural: "Legal Cases",
    fields: [
      { key: "title", label: "Case Title", type: "string", required: true, description: "e.g., Tenancy Dispute - Plot 12" },
      { key: "clientName", label: "Client Name", type: "string", required: true },
      { key: "caseType", label: "Case Type", type: "enum", options: ["Tenancy", "Land", "Contract", "Rights", "Other"], required: true },
      { key: "status", label: "Status", type: "enum", options: ["Open", "Reviewing", "Resolved"], required: true }
    ]
  } as const;

  const legalTools: any[] = [{
    functionDeclarations: [
      {
        name: 'research_nigerian_law',
        description: 'Search for specific Nigerian laws, constitutional provisions, or gazettes.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Legal topic or specific law (e.g., "Tenancy Law Lagos", "Fundamental Rights").' }
          },
          required: ['query']
        }
      },
      {
        name: 'analyze_contract_clause',
        description: 'Analyze a specific clause from a contract for potential traps or unfair terms.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clauseText: { type: Type.STRING, description: 'The text of the clause to analyze.' }
          },
          required: ['clauseText']
        }
      }
    ]
  }];

  const prompt = `
  You are an Expert Legal Assistant specialized in Nigerian Law.
  
  [YOUR ROLE]:
  - You help users understand their rights under Nigerian law (Bureaucracy Defense).
  - You analyze contracts for unfair terms.
  - You research specific laws (Tenancy, Land, etc.).
  - You are CALM, OBJECTIVE, and AUTHORITATIVE.

  [YOUR RULES]:
  1. DISCLAIMER: Always remind the user that you are an AI assistant, not a human lawyer.
  2. RESEARCH: Use 'research_nigerian_law' to find specific provisions.
  3. CLARITY: Explain legal jargon in simple terms that a common citizen can understand.
  `;

  return {
    id: "pack_legal",
    name: "Legal Pack (Citizen Rights)",
    description: "Nigerian law research, contract analysis, and citizen bureaucracy defense.",
    entityDef: legalEntity as any,
    workflowDef: null as any,
    systemPrompt: prompt,
    tools: legalTools,
    execute: async (toolName: string, args: Record<string, unknown>, deps: any) => {
      console.log(`⚖️ [LegalPack] Executing ${toolName}`, args);
      
      switch (toolName) {
        case 'research_nigerian_law':
          return { 
            status: 'success', 
            message: `I have started researching ${args.query} in the Nigerian Law Database. (SCAFFOLDED)` 
          };
        case 'analyze_contract_clause':
          return {
            status: 'success',
            message: 'Clause analysis initialized. Checking for standard consumer protection violations. (SCAFFOLDED)'
          };
        default:
          return null;
      }
    }
  };
}
