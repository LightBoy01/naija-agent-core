import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../utils/logger.js';
import { Type } from '@google/genai';

/**
 * Service to manage connections to Model Context Protocol (MCP) servers.
 */
class MCPClientService {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  constructor() {
    this.client = new Client(
      {
        name: "aelixxr-life-os",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  /**
   * Connects to a local MCP server via stdio.
   */
  async connectLocalServer(command: string, args: string[]) {
    try {
      this.transport = new StdioClientTransport({
        command,
        args,
      });
      await this.client.connect(this.transport);
      this.isConnected = true;
      logger.info({ command }, '✅ Connected to Local MCP Server');
    } catch (error: any) {
      logger.error({ error: error.message, command }, '❌ Failed to connect to MCP Server');
    }
  }

  /**
   * Fetches and maps tools from the connected MCP server to Gemini Schema.
   */
  async getGeminiTools(): Promise<any[]> {
    if (!this.isConnected) return [];

    try {
      const response = await this.client.listTools();
      const mcpTools = response.tools || [];
      
      const geminiTools = mcpTools.map((tool: any) => {
        return {
          name: tool.name,
          description: tool.description,
          parameters: this.mapJsonSchemaToGemini(tool.inputSchema),
        };
      });
      
      return geminiTools;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch MCP tools');
      return [];
    }
  }

  /**
   * Helper to map JSON Schema from MCP to Gemini Type
   */
  private mapJsonSchemaToGemini(jsonSchema: any): any {
    if (!jsonSchema || jsonSchema.type !== 'object') {
      return { type: Type.OBJECT, properties: {} };
    }

    const properties: Record<string, any> = {};
    for (const [key, value] of Object.entries(jsonSchema.properties || {})) {
      const prop = value as any;
      properties[key] = {
        type: this.getGeminiType(prop.type),
        description: prop.description || '',
      };
      
      if (prop.items) {
          properties[key].items = {
              type: this.getGeminiType(prop.items.type)
          };
      }
    }

    return {
      type: Type.OBJECT,
      properties,
      required: jsonSchema.required || []
    };
  }

  private getGeminiType(jsonType: string): any {
    switch (jsonType) {
      case 'string': return Type.STRING;
      case 'number': return Type.NUMBER;
      case 'integer': return Type.INTEGER;
      case 'boolean': return Type.BOOLEAN;
      case 'array': return Type.ARRAY;
      case 'object': return Type.OBJECT;
      default: return Type.STRING;
    }
  }

  /**
   * Executes a specific tool on the globally connected MCP server.
   */
  async executeTool(name: string, args: any): Promise<any> {
    if (!this.isConnected) throw new Error('MCP Client is not connected');

    try {
      logger.info({ tool: name }, 'Executing MCP Tool');
      
      // 2-Minute Timeout Guard
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`MCP tool execution timed out after 120s`)), 120000)
      );

      const response = await Promise.race([
          this.client.callTool({ name, arguments: args }),
          timeoutPromise
      ]);
      
      return response;
    } catch (error: any) {
      logger.error({ error: error.message, tool: name }, 'Failed to execute MCP tool');
      return { error: error.message };
    }
  }

  /**
   * IronClaw Identity Vault:
   * Executes a stateful tool ephemerally with securely injected user credentials.
   * Now enhanced for "Fusion v2" with persistent per-user profiles.
   */
  async executeStatefulTool(command: string, args: string[], env: Record<string, string>, toolName: string, toolArgs: any): Promise<any> {
    const tempClient = new Client({ name: "aelixxr-sovereign", version: "2.0.0" }, { capabilities: {} });
    
    // 1. Identify User Profile
    const userPhone = env.userPhone || 'default';
    
    // 2. Provision Infrastructure Environment (Whitelisted)
    const safeProcessEnv: Record<string, string> = {
        'AELIXXR_USER_PHONE': userPhone,
        'AELIXXR_ORG_ID': env.orgId || '',
        'AELIXXR_PROXY_URL': env.proxyUrl || '',
    };

    const allowedKeys = [
        'PATH', 'NODE_ENV', 'GEMINI_API_KEY', 'GEMINI_API_KEY_LOS', 
        'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'DATABASE_URL',
        'REDIS_URL', 'AI_PROVIDER_PRIMARY', 'AI_PROVIDER_FALLBACK',
        'LANG', 'HOME', 'USER',
        'BROWSERBASE_API_KEY', 'FAL_KEY', 'OPENROUTER_API_KEY',
        'MONNIFY_API_KEY', 'MONNIFY_SECRET_KEY', 'MONNIFY_CONTRACT_CODE',
        'PAYSTACK_SECRET_KEY', 'CLOUDINARY_URL', 'ALIBABA_OSS_ACCESS_KEY',
        'ALIBABA_OSS_SECRET_KEY', 'ALIBABA_OSS_BUCKET', 'FIREBASE_PROJECT_ID'
    ];

    for (const key of allowedKeys) {
        if (process.env[key] !== undefined) {
            safeProcessEnv[key] = process.env[key] as string;
        }
    }

    // 3. Inject Profile Flag into Hermes Arguments (Sovereign Body Logic)
    let profileArgs: string[] = [];
    if (command === 'python3' || command === 'node') {
        // If wrapper is used, first arg is the script path
        const [script, ...rest] = args;
        profileArgs = [script, "-p", userPhone, ...rest];
    } else {
        // Direct binary call
        profileArgs = ["-p", userPhone, ...args];
    }

    const tempTransport = new StdioClientTransport({
        command,
        args: profileArgs,
        env: { ...safeProcessEnv, ...env }
    });

    try {
        await tempClient.connect(tempTransport);
        logger.info({ tool: toolName }, '🔐 Ephemeral MCP connection established (Secure Env)');
        
        // 2-Minute Timeout Guard
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Ephemeral MCP tool execution timed out after 120s`)), 120000)
        );

        const response = await Promise.race([
            tempClient.callTool({ name: toolName, arguments: toolArgs }),
            timeoutPromise
        ]);

        return response;
    } catch (error: any) {
        logger.error({ error: error.message, tool: toolName }, '❌ Ephemeral MCP execution failed');
        return { error: error.message };
    } finally {
        // Ensure the subprocess is killed to prevent memory/credential leaks
        try {
            await tempTransport.close();
            logger.info('🔒 Ephemeral MCP connection closed');
        } catch (closeErr) {
             // Ignore close errors
        }
    }
  }
}

export const mcpClient = new MCPClientService();