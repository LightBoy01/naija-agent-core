#!/usr/bin/env node
/**
 * Minimal Local Fetch MCP Server for stateless web requests.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const server = new Server(
  { name: 'local-fetch-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'fetch_webpage',
        description: 'Fetches the raw text content of a given URL.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to fetch' }
          },
          required: ['url']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'fetch_webpage') {
    try {
      const url = request.params.arguments.url;
      const response = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      
      // Remove scripts and styles for safety and context window size
      $('script, style').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      return { content: [{ type: 'text', text: text.substring(0, 10000) }] }; // truncate for safety
    } catch (e) {
      return { content: [{ type: 'text', text: `Error fetching: ${e.message}` }], isError: true };
    }
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
