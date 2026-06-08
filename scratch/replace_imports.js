import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      results.push(filePath);
    }
  }
  return results;
}

const appsDir = path.resolve('./apps');
const files = walk(appsDir);
let changedCount = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  if (content.includes('@naija-agent/firebase')) {
    const newContent = content.replace(/@naija-agent\/firebase/g, '@naija-agent/database');
    fs.writeFileSync(file, newContent, 'utf-8');
    console.log(`Replaced in: ${file}`);
    changedCount++;
  }
}

console.log(`Total files updated: ${changedCount}`);
