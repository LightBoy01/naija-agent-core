import { Tool } from '@google/genai';
import { logger } from '../utils/logger.js';
import { mcpClient } from '../services/mcpClient.js';

import { FINANCE_TOOL_DEFINITIONS, executeFinanceTool } from './finance/index.js';
import { VAULT_TOOLS, executeVaultTool } from './vaultTools.js';
import { UTILITY_TOOLS, executeUtilityTool } from './utilityTools.js';
import { SYSTEM_TOOLS, executeSystemTool } from './systemTools.js';
import { EDUCATION_TOOLS, executeEducationTool } from './educationTools.js';

export const STATIC_LIFE_TOOLS: Tool = {
  functionDeclarations: [
    ...FINANCE_TOOL_DEFINITIONS,
    ...VAULT_TOOLS,
    ...UTILITY_TOOLS,
    ...SYSTEM_TOOLS,
    ...EDUCATION_TOOLS
  ] as any // Force bypass strict GenAI type mismatch for now
};

export const LIFE_TOOLS: Tool[] = [STATIC_LIFE_TOOLS];

export async function getLifeTools(): Promise<Tool[]> {
  const allFunctions = [...(STATIC_LIFE_TOOLS.functionDeclarations || [])];
  
  try {
    const mcpTools = await mcpClient.getGeminiTools();
    if (mcpTools && mcpTools.length > 0) {
      allFunctions.push(...mcpTools);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to append MCP tools');
  }

  return [{ functionDeclarations: allFunctions }];
}

export async function getOrchestratorTools(): Promise<Tool[]> {
  const allTools = await getLifeTools();
  const decls = allTools[0]?.functionDeclarations || [];
  
  const allowedNames = [
    'delegate_task', 
    'delegate_to_hermes',
    'web_search',
    'save_note', 
    'create_reminder',
    'log_feedback', 
    'get_recharge_details', 
    'generate_invite'
  ];

  const filtered = decls.filter(d => d.name && allowedNames.includes(d.name));
  return [{ functionDeclarations: filtered }];
}

const TOOL_HANDLERS: Record<string, (name: string, args: any, jobId?: string) => Promise<any>> = {};

// Register static handlers
[
  { tools: FINANCE_TOOL_DEFINITIONS, handler: executeFinanceTool },
  { tools: VAULT_TOOLS, handler: executeVaultTool },
  { tools: UTILITY_TOOLS, handler: executeUtilityTool },
  { tools: SYSTEM_TOOLS, handler: executeSystemTool },
  { tools: EDUCATION_TOOLS, handler: executeEducationTool }
].forEach(({ tools, handler }) => {
  tools.forEach(t => {
    TOOL_HANDLERS[t.name] = handler;
  });
});

export async function executeLifeTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
  logger.info({ tool: name, args, jobId }, '🛠️ Executing Life Tool');

  try {
    const handler = TOOL_HANDLERS[name];
    if (handler) {
      return await handler(name, args, jobId);
    }

    // Fallback to MCP tools
    return await mcpClient.executeTool(name, args);

  } catch (error: any) {
    logger.error({ tool: name, error: error.message }, '❌ Tool Execution Failed');
    return { error: error.message };
  }
}
