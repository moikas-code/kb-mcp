#!/usr/bin/env node

/**
 * KB-MCP Command Line Interface
 * Unified CLI for code intelligence and knowledge management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createAnalyzeCommand } from './commands/analyze.js';
import { createBenchmarkCommand } from './commands/benchmark.js';
import { createOptimizeCommand } from './commands/optimize.js';
import { promises as fs } from 'fs';
import path from 'path';

// ASCII Art Banner
const banner = `
${chalk.blue('╔═══════════════════════════════════════════════════════╗')}
${chalk.blue('║')}  ${chalk.cyan.bold('KB-MCP')} ${chalk.gray('v2.2.0')} - ${chalk.yellow('Code Intelligence Platform')}     ${chalk.blue('║')}
${chalk.blue('║')}  ${chalk.gray('Enterprise-grade knowledge management for code')}    ${chalk.blue('║')}
${chalk.blue('╚═══════════════════════════════════════════════════════╝')}
`;

async function main() {
  const program = new Command();

  // Display banner
  console.log(banner);

  program
    .name('kb')
    .description('KB-MCP Code Intelligence CLI - Analyze, optimize, and understand your codebase')
    .version('2.2.0')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--no-color', 'Disable colored output')
    .option('-c, --config <file>', 'Use custom configuration file');

  // Add analyze command
  program.addCommand(createAnalyzeCommand());

  // Add benchmark command
  program.addCommand(createBenchmarkCommand());

  // Add optimize command
  program.addCommand(createOptimizeCommand());

  // Init command - Initialize KB-MCP in a project
  program
    .command('init')
    .description('Initialize KB-MCP in your project')
    .option('-t, --template <type>', 'Configuration template (basic|enterprise)', 'basic')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async (options) => {
      try {
        await initializeProject(options);
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Status command - Show KB-MCP status
  program
    .command('status')
    .description('Show KB-MCP configuration and status')
    .action(async () => {
      try {
        await showStatus();
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // MCP command - Start MCP server
  program
    .command('mcp')
    .description('Start KB-MCP as Model Context Protocol server')
    .option('-t, --transport <type>', 'Transport type (stdio|websocket|http)', 'stdio')
    .option('-p, --port <port>', 'Port for websocket/http transport', '3000')
    .action(async (options) => {
      try {
        await startMCPServer(options);
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // MOIDVK integration command
  program
    .command('moidvk <action>')
    .description('MOIDVK integration commands')
    .option('--tool <name>', 'Specific MOIDVK tool to use')
    .option('--hybrid', 'Use hybrid KB-MCP + MOIDVK analysis')
    .action(async (action, options) => {
      try {
        await handleMoidvkIntegration(action, options);
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Parse command line arguments
  program.parse(process.argv);

  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

/**
 * Initialize KB-MCP in a project
 */
async function initializeProject(options: any): Promise<void> {
  console.log(chalk.blue('🚀 Initializing KB-MCP...\n'));

  const configPath = path.join(process.cwd(), '.kbconfig.yaml');
  
  // Check if config already exists
  try {
    await fs.access(configPath);
    if (!options.force) {
      console.log(chalk.yellow('⚠️  Configuration already exists. Use --force to overwrite.'));
      return;
    }
  } catch {
    // Config doesn't exist, proceed
  }

  // Load template
  const template = await loadConfigTemplate(options.template);
  
  // Write configuration
  await fs.writeFile(configPath, template, 'utf-8');
  console.log(chalk.green('✅ Created .kbconfig.yaml'));

  // Create necessary directories
  const dirs = ['kb', 'kb/active', 'kb/archive', '.cache/kb-mcp'];
  for (const dir of dirs) {
    await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
    console.log(chalk.green(`✅ Created ${dir}/`));
  }

  // Create initial KB files
  await createInitialKBFiles();

  console.log(chalk.green('\n✨ KB-MCP initialized successfully!'));
  console.log(chalk.gray('\nNext steps:'));
  console.log(chalk.gray('  1. Run "kb analyze project" to analyze your codebase'));
  console.log(chalk.gray('  2. Run "kb mcp" to start the MCP server'));
  console.log(chalk.gray('  3. Configure your MCP client to connect to KB-MCP'));
}

/**
 * Show KB-MCP status
 */
async function showStatus(): Promise<void> {
  console.log(chalk.blue('📊 KB-MCP Status\n'));

  // Check configuration
  try {
    const configPath = path.join(process.cwd(), '.kbconfig.yaml');
    await fs.access(configPath);
    console.log(chalk.green('✅ Configuration found'));
    
    // Load and display config
    const config = await fs.readFile(configPath, 'utf-8');
    console.log(chalk.gray('\nConfiguration:'));
    console.log(chalk.gray(config.split('\n').map(line => '  ' + line).join('\n')));
  } catch {
    console.log(chalk.red('❌ No configuration found (run "kb init" first)'));
    return;
  }

  // Check KB directory
  try {
    const kbPath = path.join(process.cwd(), 'kb');
    const files = await fs.readdir(kbPath, { recursive: true });
    const mdFiles = files.filter(f => f.toString().endsWith('.md'));
    console.log(chalk.green(`\n✅ Knowledge base: ${mdFiles.length} documents`));
  } catch {
    console.log(chalk.yellow('⚠️  Knowledge base directory not found'));
  }

  // Check cache
  try {
    const cachePath = path.join(process.cwd(), '.cache/kb-mcp');
    const stats = await fs.stat(cachePath);
    console.log(chalk.green('✅ Cache directory exists'));
  } catch {
    console.log(chalk.gray('ℹ️  Cache directory not found (will be created on first use)'));
  }

  // Check for MOIDVK
  const moidvkPath = await findMoidvkInstallation();
  if (moidvkPath) {
    console.log(chalk.green(`✅ MOIDVK integration available at ${moidvkPath}`));
  } else {
    console.log(chalk.gray('ℹ️  MOIDVK not found (optional integration)'));
  }
}

/**
 * Start MCP server
 */
async function startMCPServer(options: any): Promise<void> {
  console.log(chalk.blue(`🚀 Starting KB-MCP server (${options.transport})...\n`));

  try {
    // Dynamic import of MCP server
    const { startServer } = await import('../mcp/server.js');
    
    await startServer({
      transport: options.transport,
      port: parseInt(options.port)
    });

  } catch (error: any) {
    console.error(chalk.red(`Failed to start MCP server: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Handle MOIDVK integration
 */
async function handleMoidvkIntegration(action: string, options: any): Promise<void> {
  const moidvkPath = await findMoidvkInstallation();
  
  if (!moidvkPath) {
    console.log(chalk.red('❌ MOIDVK not found. Please ensure MOIDVK is installed.'));
    console.log(chalk.gray('   Expected location: ../moidvk or node_modules/moidvk'));
    return;
  }

  console.log(chalk.blue(`🔗 MOIDVK Integration: ${action}\n`));

  switch (action) {
    case 'status':
      console.log(chalk.green(`✅ MOIDVK found at: ${moidvkPath}`));
      console.log(chalk.gray('   Integration ready for hybrid analysis'));
      break;

    case 'test':
      console.log(chalk.yellow('Testing MOIDVK integration...'));
      // Test basic tool execution
      const { MoidvkAdapter } = await import('../integrations/moidvk-adapter.js');
      const { UnifiedMemory } = await import('../graph/unified-memory.js');
      
      const memory = new UnifiedMemory();
      await memory.initialize();
      
      const adapter = new MoidvkAdapter(
        { serverPath: path.join(moidvkPath, 'server.js') },
        memory
      );

      const result = await adapter.executeTool({
        tool: options.tool || 'check_code_practices',
        params: { code: 'const x = 1;' }
      });

      if (result.success) {
        console.log(chalk.green('✅ MOIDVK integration test successful'));
        console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
      } else {
        console.log(chalk.red(`❌ Test failed: ${result.error}`));
      }
      
      await memory.close();
      break;

    case 'recommend':
      console.log(chalk.yellow('Getting tool recommendations...'));
      // Implement recommendation logic
      console.log(chalk.gray('Recommendations based on your project:'));
      console.log(chalk.gray('  • Use "kb analyze project --moidvk" for hybrid analysis'));
      console.log(chalk.gray('  • Use "check_code_practices" for JavaScript/TypeScript'));
      console.log(chalk.gray('  • Use "rust_safety_checker" for Rust code'));
      console.log(chalk.gray('  • Use "python_security_scanner" for Python projects'));
      break;

    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('Available actions: status, test, recommend'));
  }
}

/**
 * Helper Functions
 */

async function loadConfigTemplate(template: string): Promise<string> {
  const templates: Record<string, string> = {
    basic: `# KB-MCP Configuration
version: '1.0'

backend:
  type: filesystem
  filesystem:
    root_path: ./kb
    enable_versioning: true
    enable_compression: true

analysis:
  depth: standard
  languages:
    - typescript
    - javascript
    - python
    - rust
  patterns:
    detect_anti_patterns: true
    detect_design_patterns: true
  
cache:
  enabled: true
  ttl: 3600
  max_size: 100MB

logging:
  level: info
  file: .cache/kb-mcp/kb-mcp.log
`,

    enterprise: `# KB-MCP Enterprise Configuration
version: '1.0'

backend:
  type: graph
  graph:
    connection:
      host: localhost
      port: 6380
    vector_dimensions: 1536
    enable_semantic_search: true
    enable_temporal_queries: true

security:
  authentication:
    enabled: true
    type: jwt
  encryption:
    at_rest: true
    algorithm: AES-256-GCM
  audit_logging:
    enabled: true
    retention_days: 90

analysis:
  depth: comprehensive
  languages:
    - typescript
    - javascript
    - python
    - rust
    - go
    - java
  patterns:
    detect_anti_patterns: true
    detect_design_patterns: true
    custom_patterns:
      - name: security_vulnerabilities
        enabled: true
  parallel_workers: 8
  
cache:
  enabled: true
  ttl: 7200
  max_size: 500MB
  disk_cache: true

integrations:
  moidvk:
    enabled: true
    hybrid_mode: true
  
monitoring:
  metrics:
    enabled: true
    export_interval: 60
  alerts:
    enabled: true
    channels:
      - email
      - slack

logging:
  level: debug
  file: .cache/kb-mcp/kb-mcp.log
  rotation:
    enabled: true
    max_files: 10
    max_size: 100MB
`
  };

  return templates[template] || templates.basic;
}

async function createInitialKBFiles(): Promise<void> {
  const readmePath = path.join(process.cwd(), 'kb/README.md');
  const readmeContent = `# Knowledge Base

This directory contains the KB-MCP knowledge base for your project.

## Structure

- \`active/\` - Current documentation and analysis
- \`archive/\` - Historical documentation

## Usage

Use the KB-MCP CLI to manage documentation:

\`\`\`bash
# Analyze project and update KB
kb analyze project

# Query the knowledge base
kb analyze query "What are the main components?"

# View technical debt
kb analyze debt .
\`\`\`

## MCP Integration

Start the MCP server to use with AI assistants:

\`\`\`bash
kb mcp
\`\`\`
`;

  await fs.writeFile(readmePath, readmeContent, 'utf-8');
  console.log(chalk.green('✅ Created kb/README.md'));
}

async function findMoidvkInstallation(): Promise<string | null> {
  const possiblePaths = [
    path.join(process.cwd(), '../moidvk'),
    path.join(process.cwd(), 'node_modules/moidvk'),
    '/home/moika/Documents/code/moidvk',
    path.join(process.env.HOME || '', 'moidvk')
  ];

  for (const moidvkPath of possiblePaths) {
    try {
      const serverPath = path.join(moidvkPath, 'server.js');
      await fs.access(serverPath);
      return moidvkPath;
    } catch {
      continue;
    }
  }

  return null;
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n💥 Unexpected error:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('\n💥 Unhandled promise rejection:'), reason);
  process.exit(1);
});

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});