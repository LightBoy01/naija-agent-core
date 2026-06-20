const fs = require('fs');

const files = {
  inventory: 'apps/worker/src/tools/inventory.ts',
  commerce: 'apps/worker/src/tools/commerce.ts',
  admin: 'apps/worker/src/tools/admin.ts',
  content: 'apps/worker/src/tools/content.ts',
  system: 'apps/worker/src/tools/system.ts'
};

const exportedTools = new Set();
const missingTools = [];

for (const [category, path] of Object.entries(files)) {
  const content = fs.readFileSync(path, 'utf8');
  // Match `name: "tool_name"`
  const regex = /name:\s*["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    exportedTools.add(match[1]);
  }
}

console.log(`Found ${exportedTools.size} exported tools.`);

const handlerContent = fs.readFileSync('apps/worker/src/tool-handlers.ts', 'utf8');

for (const tool of exportedTools) {
  if (!handlerContent.includes(`'${tool}'`)) {
    missingTools.push(tool);
  }
}

if (missingTools.length > 0) {
  console.log("Missing from tool-handlers.ts:", missingTools);
} else {
  console.log("All exported tools are correctly routed in tool-handlers.ts!");
}
