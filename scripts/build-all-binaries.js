#!/usr/bin/env node

/**
 * Build all platform binaries for release
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const platforms = [
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' }
];

console.log('🏗️  Building binaries for all platforms...\n');

for (const { platform, arch } of platforms) {
  console.log(`\n📦 Building ${platform}-${arch}...`);
  try {
    execSync(`node scripts/build-binary.js --platform=${platform} --arch=${arch}`, {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
  } catch (error) {
    console.error(`❌ Failed to build ${platform}-${arch}`);
    process.exit(1);
  }
}

console.log('\n✅ All binaries built successfully!');
console.log('\n📁 Binaries are located in: binaries/');