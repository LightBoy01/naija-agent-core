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
      const response = await this.client.callTool({ name, arguments: args });
      
      return response;
    } catch (error: any) {
      logger.error({ error: error.message, tool: name }, 'Failed to execute MCP tool');
      return { error: error.message };
    }
  }

  /**
   * IronClaw Identity Vault:
   * Executes a stateful tool ephemerally with securely injected user credentials.
   */
  async executeStatefulTool(command: string, args: string[], env: Record<string, string>, toolName: string, toolArgs: any): Promise<any> {
    const tempClient = new Client({ name: "aelixxr-ephemeral", version: "1.0.0" }, { capabilities: {} });
    
    // Sanitize process.env to satisfy Record<string, string>
    const safeProcessEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
            safeProcessEnv[key] = value;
        }
    }

    const tempTransport = new StdioClientTransport({
        command,
        args,
        env: { ...safeProcessEnv, ...env }
    });

    try {
        await tempClient.connect(tempTransport);
        logger.info({ tool: toolName }, '🔐 Ephemeral MCP connection established');
        
        const response = await tempClient.callTool({ name: toolName, arguments: toolArgs });

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