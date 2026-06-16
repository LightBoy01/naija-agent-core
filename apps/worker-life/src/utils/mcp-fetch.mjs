#!/usr/bin/env node
/**
 * Minimal Local Fetch MCP Server for stateless web requests.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

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
      },
      {
        name: 'web_search',
        description: 'Performs a web search using a local privacy-first search aggregator (or falls back to Brave Search API) to fetch live information, news, and facts.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' }
          },
          required: ['query']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'fetch_webpage') {
    try {
      const url = request.params.arguments.url;
      const response = await axios.get(url, { 
        timeout: 10000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      const $ = cheerio.load(response.data);
      
      // Remove scripts and styles for safety and context window size
      $('script, style').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      return { content: [{ type: 'text', text: text.substring(0, 10000) }] }; // truncate for safety
    } catch (e) {
      return { content: [{ type: 'text', text: `Error fetching: ${e.message}` }], isError: true };
    }
  }

  if (request.params.name === 'web_search') {
    const query = request.params.arguments.query;
    try {
      // Primary: Try Local SearXNG Instance
      const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
      const searxngResponse = await axios.get(`${searxngUrl}/search`, {
        params: { q: query, format: 'json' },
        timeout: 5000 // Quick timeout to fail fast
      });
      
      const results = searxngResponse.data.results || [];
      if (results.length > 0) {
        const formattedResults = results.slice(0, 5).map(r => `Title: ${r.title}\nDescription: ${r.content || r.snippet}\nURL: ${r.url}`).join('\n\n');
        return { content: [{ type: 'text', text: `[Source: SearXNG]\n\n${formattedResults}` }] };
      }
    } catch (searxngErr) {
      // Fallback to Brave
      try {
        const apiKey = process.env.BRAVE_API_KEY;
        if (!apiKey) {
           return { content: [{ type: 'text', text: `SearXNG is offline and BRAVE_API_KEY is not set. Search failed.` }], isError: true };
        }
        
        const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
          params: { q: query, count: 5 },
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
          timeout: 10000
        });
        
        const results = response.data.web?.results || [];
        if (results.length === 0) {
           return { content: [{ type: 'text', text: 'No results found.' }] };
        }
        
        const formattedResults = results.map(r => `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`).join('\n\n');
        return { content: [{ type: 'text', text: `[Source: Brave]\n\n${formattedResults}` }] };
      } catch (braveErr) {
        return { content: [{ type: 'text', text: `Search Error: ${braveErr.message}` }], isError: true };
      }
    }
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
