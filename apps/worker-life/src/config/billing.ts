/**
 * Billing & Energy Configuration
 * Standardized costs for tool execution across the LOS ecosystem.
 * Costs are in Kobo (1000 Kobo = 1 Energy Credit).
 */

export const TOOL_COSTS: Record<string, number> = {
    // Sector-Specific Worker Tools
    'generate_quiz': 0,        // Education (Loss Leader)
    'search_vault': 0,         // Document Retrieval (User Retention)
    'save_note': 0,            // Vault Storage
    'delete_from_vault': 0,    // Vault Management
    'fetch_webpage': 1000,     // Single Page Fetch (1 Credit)
    'web_search': 3000,        // Live Google Search (3 Credits)
    'brave_web_search': 3000,  // Brave Search MCP (3 Credits)
    
    // Orchestrator Specific Tools
    'delegate_task': 5000,      // Agentic Handoff (5 Credits)
    'delegate_to_hermes': 10000,// High-Power Body Delegation (10 Credits)
    'create_reminder': 0,      // Scheduling
    'generate_invite': 0,      // Viral Growth
    'get_recharge_details': 0, // Revenue Path
    'log_feedback': 0          // System Improvement
};

/**
 * Default cost for unknown or third-party MCP tools 
 * to prevent API quota drain.
 */
export const DEFAULT_TOOL_COST = 3000; // 3 Credits
