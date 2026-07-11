import { RECHARGE_TOOL_DEFINITIONS, executeRechargeTool } from './recharge.js';
import { VAULT_TOOL_DEFINITIONS, executeVaultTool } from './vault.js';
import { PAYOUT_TOOL_DEFINITIONS, executePayoutTool } from './payout.js';
import { COMMISSIONS_TOOL_DEFINITIONS, executeCommissionsTool } from './commissions.js';

export const FINANCE_TOOL_DEFINITIONS = [
    ...RECHARGE_TOOL_DEFINITIONS,
    ...VAULT_TOOL_DEFINITIONS,
    ...PAYOUT_TOOL_DEFINITIONS,
    ...COMMISSIONS_TOOL_DEFINITIONS
];

export async function executeFinanceTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    if (RECHARGE_TOOL_DEFINITIONS.find(t => t.name === name)) {
        return executeRechargeTool(name, args, jobId);
    }
    if (VAULT_TOOL_DEFINITIONS.find(t => t.name === name)) {
        return executeVaultTool(name, args, jobId);
    }
    if (PAYOUT_TOOL_DEFINITIONS.find(t => t.name === name)) {
        return executePayoutTool(name, args, jobId);
    }
    if (COMMISSIONS_TOOL_DEFINITIONS.find(t => t.name === name)) {
        return executeCommissionsTool(name, args, jobId);
    }
    throw new Error(`Unknown Finance tool: ${name}`);
}
