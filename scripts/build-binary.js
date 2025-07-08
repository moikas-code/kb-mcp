#!/usr/bin/env node

/**
 * Build script for creating platform-specific binaries
 * Uses pkg to compile Node.js app into executable
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const platform = args.find(arg => arg.startsWith('--platform='))?.split('=')[1] || process.platform;
const arch = args.find(arg => arg.startsWith('--arch='))?.split('=')[1] || process.arch;

// Validate platform and architecture
const validPlatforms = ['linux', 'darwin', 'win32'];
const validArchs = ['x64', 'arm64'];

if (!validPlatforms.includes(platform)) {
  console.error(`Invalid platform: ${platform}. Valid options: ${validPlatforms.join(', ')}`);
  process.exit(1);
}

if (!validArchs.includes(arch)) {
  console.error(`Invalid architecture: ${arch}. Valid options: ${validArchs.join(', ')}`);
  process.exit(1);
}

// Map platform names for pkg
const pkgPlatform = {
  'linux': 'linux',
  'darwin': 'macos',
  'win32': 'win'
}[platform];

// Set up binary name
const binaryName = platform === 'win32' ? 'kb-mcp.exe' : 'kb-mcp';
const outputDir = join(ROOT_DIR, 'binaries');
const outputPath = join(outputDir, `kb-mcp-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`);

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

console.log(`Building binary for ${platform}-${arch}...`);

// Read package.json
const packageJson = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'));

// Create pkg configuration
const pkgConfig = {
  pkg: {
    scripts: [
      'dist/**/*.js'
    ],
    assets: [
      'package.json',
      'node_modules/**/*'
    ],
    targets: [`node20-${pkgPlatform}-${arch}`],
    outputPath: outputDir
  }
};

// Write temporary pkg config
const pkgConfigPath = join(ROOT_DIR, '.pkg.json');
writeFileSync(pkgConfigPath, JSON.stringify(pkgConfig, null, 2));

try {
  // Install pkg if not already installed
  try {
    execSync('pkg --version', { stdio: 'ignore' });
  } catch {
    console.log('Installing pkg...');
    execSync('npm install -g pkg', { stdio: 'inherit' });
  }

  // Build the binary
  console.log('Compiling binary...');
  execSync(`pkg dist/cli/index.js --target node20-${pkgPlatform}-${arch} --output ${outputPath} --compress GZip`, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });

  // Create wrapper script for non-Windows platforms
  if (platform !== 'win32') {
    const wrapperPath = join(outputDir, `kb-mcp-${platform}-${arch}.sh`);
    const wrapperContent = `#!/bin/bash
# KB-MCP Launcher
# Version: ${packageJson.version}

SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
exec "$SCRIPT_DIR/kb-mcp-${platform}-${arch}" "$@"
`;
    writeFileSync(wrapperPath, wrapperContent);
    execSync(`chmod +x ${wrapperPath}`);
    execSync(`chmod +x ${outputPath}`);
  }

  // Create version info file
  const versionInfo = {
    version: packageJson.version,
    platform,
    arch,
    buildDate: new Date().toISOString(),
    node: process.version
  };
  writeFileSync(
    join(outputDir, `kb-mcp-${platform}-${arch}.json`),
    JSON.stringify(versionInfo, null, 2)
  );

  console.log(`✅ Binary built successfully: ${outputPath}`);
  console.log(`   Size: ${(execSync(`du -sh ${outputPath}`).toString().split('\t')[0])}`);

  // Generate SHA256 checksum
  const checksum = execSync(`sha256sum ${outputPath} | cut -d' ' -f1`).toString().trim();
  writeFileSync(`${outputPath}.sha256`, `${checksum}  kb-mcp-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}\n`);
  console.log(`   SHA256: ${checksum}`);

} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
} finally {
  // Clean up temporary files
  try {
    execSync(`rm -f ${pkgConfigPath}`);
  } catch {}
}

console.log('\n🎉 Build complete!');
console.log(`\nTo test the binary:`);
console.log(`  ${outputPath} --version`);
console.log(`  ${outputPath} --help`);