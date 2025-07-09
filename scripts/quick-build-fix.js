#!/usr/bin/env node

// Quick build fix script to get v2.0.5 working
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create minimal dist structure
const distDir = path.join(process.cwd(), 'dist');
const cliDir = path.join(distDir, 'cli');

// Create directories
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(cliDir, { recursive: true });

// Create a minimal index.js that redirects to the TypeScript version
const indexContent = `#!/usr/bin/env node

// KB-MCP CLI v2.0.5 - Unified CLI Implementation
// This is a temporary build placeholder while we fix TypeScript issues

console.error('KB-MCP CLI is being rebuilt. Please use npx tsx src/cli/index.ts for now.');
console.error('Or install the previous version: npm install -g @moikas/kb-mcp@1.2.0');
process.exit(1);
`;

fs.writeFileSync(path.join(cliDir, 'index.js'), indexContent);
fs.chmodSync(path.join(cliDir, 'index.js'), 0o755);

// Create basic package files
const filesToCopy = ['package.json', 'README.md', 'LICENSE'];
filesToCopy.forEach(file => {
  const src = path.join(process.cwd(), file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
});

console.log('Quick build fix completed. dist/cli/index.js created.');