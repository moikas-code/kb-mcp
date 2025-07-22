#!/usr/bin/env node

/**
 * KB-MCP CLI Wrapper
 * This script runs the TypeScript CLI directly without bundling issues
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the project root by looking for package.json
let projectRoot = join(__dirname, '..');
let attempts = 0;
while (!existsSync(join(projectRoot, 'package.json')) && attempts < 5) {
  projectRoot = join(projectRoot, '..');
  attempts++;
}

// Check if we're in development (source available) or production (only dist)
const srcPath = join(projectRoot, 'src/cli/index.ts');
const distPath = join(projectRoot, 'dist/cli/index.js');

let command, args;

if (existsSync(srcPath)) {
  // Development mode - use tsx to run TypeScript directly
  // Try to use local tsx first, then global
  const localTsx = join(projectRoot, 'node_modules/.bin/tsx');
  if (existsSync(localTsx)) {
    command = localTsx;
  } else {
    command = 'tsx';
  }
  args = [srcPath, ...process.argv.slice(2)];
} else if (existsSync(distPath)) {
  // Production mode - use built JavaScript
  command = 'node';
  args = [distPath, ...process.argv.slice(2)];
} else {
  console.error('Error: Could not find KB-MCP CLI files');
  console.error('Expected either:', srcPath, 'or', distPath);
  process.exit(1);
}

// Spawn the CLI process
const child = spawn(command, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production'
  }
});

child.on('error', (err) => {
  console.error(`Failed to start KB-MCP: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});