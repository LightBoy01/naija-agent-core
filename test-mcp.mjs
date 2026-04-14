import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['apps/worker-life/src/utils/mcp-fetch.mjs']
});

const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

async function run() {
  await client.connect(transport);
  const response = await client.request({ method: "tools/list" }, {});
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
}
run().catch(console.error);
