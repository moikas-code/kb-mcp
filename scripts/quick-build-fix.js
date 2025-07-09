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

// Create a minimal index.js that works with bun
const indexContent = `#!/usr/bin/env node

// KB-MCP CLI v2.0.5 - Unified CLI Implementation
// Temporary wrapper while TypeScript issues are resolved

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the actual TypeScript CLI
const cliPath = join(__dirname, '../../src/cli/index.ts');

// Use bun if available, otherwise tsx
const runtime = process.env.KB_RUNTIME || 'bun';

// Spawn the actual CLI with all arguments
const child = spawn(runtime, [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error(\`Failed to start KB CLI: \${err.message}\`);
  console.error('Please install bun: curl -fsSL https://bun.sh/install | bash');
  console.error('Or use: KB_RUNTIME=tsx kb <command>');
  process.exit(1);
});
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