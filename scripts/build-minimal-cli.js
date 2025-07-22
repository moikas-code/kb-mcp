#!/usr/bin/env node

// Build a minimal working CLI by bundling with esbuild
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const cliDir = path.join(distDir, 'cli');

// Ensure directories exist
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(cliDir, { recursive: true });

console.log('Building minimal CLI...');

try {
  // Build the CLI with esbuild
  await build({
    entryPoints: [path.join(projectRoot, 'src/cli/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(cliDir, 'index.cjs'),
    external: [
      // Keep these as external to avoid bundling native modules
      'bcrypt',
      'dockerode', 
      'falkordb',
      'faiss-node',
      '@xenova/transformers',
      'prom-client',
      'simple-git',
      'compression',
      '../cli/auth.js',
      '@core/secure-kb-manager.js',
      '@core/audit.js',
      '@monitoring/health.js',
      '@monitoring/metrics.js'
    ],
    // Ignore type errors and just bundle what works
    logLevel: 'warning',
    sourcemap: false,
    minify: false,
    treeShaking: true,
  });

  // Make the file executable
  fs.chmodSync(path.join(cliDir, 'index.cjs'), 0o755);
  
  // Create a wrapper index.js that imports the CJS file
  const wrapperContent = `#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('./index.cjs');
`;
  
  fs.writeFileSync(path.join(cliDir, 'index.js'), wrapperContent);
  fs.chmodSync(path.join(cliDir, 'index.js'), 0o755);
  
  console.log('✓ CLI built successfully to dist/cli/index.js');
} catch (error) {
  console.error('Build error:', error);
  process.exit(1);
}