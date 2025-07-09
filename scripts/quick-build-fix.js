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

// Create a minimal index.js placeholder
const indexContent = `#!/usr/bin/env node

// KB-MCP CLI v2.0.8 - Unified CLI Implementation
// Temporary notice while we fix the build process

console.log('KB-MCP CLI v2.0.8');
console.log('');
console.log('The CLI is being rebuilt to fix compilation issues.');
console.log('');
console.log('In the meantime, you can:');
console.log('1. Clone the repository and run from source:');
console.log('   git clone https://github.com/moikas-code/kb-mcp.git');
console.log('   cd kb-mcp');
console.log('   bun install');
console.log('   bun run dev:cli <command>');
console.log('');
console.log('2. Or install the previous stable version:');
console.log('   npm install -g @moikas/kb-mcp@1.2.0');
console.log('');
console.log('We apologize for the inconvenience. A fix is coming soon!');
process.exit(0);
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