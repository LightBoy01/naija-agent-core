import { Tool } from '@google/genai';
import { logger } from '../utils/logger.js';
import { mcpClient } from '../services/mcpClient.js';

import { FINANCE_TOOLS, executeFinanceTool } from './financeTools.js';
import { VAULT_TOOLS, executeVaultTool } from './vaultTools.js';
import { UTILITY_TOOLS, executeUtilityTool } from './utilityTools.js';
import { SYSTEM_TOOLS, executeSystemTool } from './systemTools.js';
import { EDUCATION_TOOLS, executeEducationTool } from './educationTools.js';

export const STATIC_LIFE_TOOLS: Tool = {
  functionDeclarations: [
    ...FINANCE_TOOLS,
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
    'save_note', 
    'create_reminder',
    'log_feedback', 
    'get_recharge_details', 
    'generate_invite'
  ];

  const filtered = decls.filter(d => d.name && allowedNames.includes(d.name));
  return [{ functionDeclarations: filtered }];
}

export async function executeLifeTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
  logger.info({ tool: name, args, jobId }, '🛠️ Executing Life Tool');

  try {
    if (FINANCE_TOOLS.some(t => t.name === name)) return await executeFinanceTool(name, args, jobId);
    if (VAULT_TOOLS.some(t => t.name === name)) return await executeVaultTool(name, args, jobId);
    if (UTILITY_TOOLS.some(t => t.name === name)) return await executeUtilityTool(name, args, jobId);
    if (SYSTEM_TOOLS.some(t => t.name === name)) return await executeSystemTool(name, args, jobId);
    if (EDUCATION_TOOLS.some(t => t.name === name)) return await executeEducationTool(name, args, jobId);

    return await mcpClient.executeTool(name, args);

  } catch (error: any) {
    logger.error({ tool: name, error: error.message }, '❌ Tool Execution Failed');
    return { error: error.message };
  }
}
