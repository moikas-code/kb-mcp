#!/usr/bin/env node
/**
 * Unified KB CLI implementation
 * Combines basic functionality with backend management capabilities
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { BackendManager } from '../core/backend-manager.js';
import { MultiTransportServer } from '../mcp/multi-transport-server.js';
import { 
  dbCommand,
  updateCommand,
} from './commands/index.js';
import inquirer from 'inquirer';

const VERSION = '1.2.1';

interface FileInfo {
  path: string;
  size: number;
  modified: string;
  content?: string;
}

/**
 * Unified KB CLI with backend management
 */
class UnifiedKBCLI {
  private program: Command;
  private kbPath: string;
  private backendManager: BackendManager;

  constructor() {
    this.program = new Command();
    this.kbPath = path.join(process.cwd(), 'kb');
    this.backendManager = new BackendManager(process.cwd());
    this.setupProgram();
    this.setupCommands();
  }

  private setupProgram(): void {
    this.program
      .name('kb')
      .description('Knowledge Base Management CLI with Backend Support')
      .version(VERSION)
      .option('-d, --debug', 'Enable debug logging')
      .option('-c, --config <path>', 'Path to config file');
  }

  private setupCommands(): void {
    // Initialize command
    this.program
      .command('init')
      .description('Initialize a new knowledge base')
      .option('-t, --type <type>', 'Backend type (filesystem or graph)', 'filesystem')
      .action(async (options) => {
        await this.initCommand(options);
      });

    // Read command
    this.program
      .command('read <path>')
      .alias('cat')
      .description('Read a file from the knowledge base')
      .action(async (filePath) => {
        await this.readCommand(filePath);
      });

    // Write command
    this.program
      .command('write <path> [content]')
      .alias('create')
      .description('Write content to a file in the knowledge base')
      .option('-e, --editor', 'Open system editor for content input')
      .action(async (filePath, content, cmdObj) => {
        await this.writeCommand(filePath, content, cmdObj.editor);
      });

    // List command
    this.program
      .command('list [directory]')
      .alias('ls')
      .description('List files in the knowledge base')
      .action(async (directory) => {
        await this.listCommand(directory || '');
      });

    // Search command
    this.program
      .command('search <query>')
      .alias('find')
      .description('Search for content in the knowledge base')
      .option('-l, --limit <number>', 'Maximum results', '10')
      .option('-s, --semantic', 'Use semantic search (graph backend only)')
      .action(async (query, options) => {
        await this.searchCommand(query, options);
      });

    // Delete command
    this.program
      .command('delete <path>')
      .alias('rm')
      .description('Delete a file from the knowledge base')
      .action(async (filePath) => {
        await this.deleteCommand(filePath);
      });

    // Status command
    this.program
      .command('status')
      .description('Show knowledge base status and backend info')
      .action(async () => {
        await this.statusCommand();
      });

    // Backend command
    this.program
      .command('backend')
      .description('Manage storage backend')
      .addCommand(
        new Command('switch')
          .argument('<type>', 'Backend type (filesystem or graph)')
          .description('Switch between storage backends')
          .action(async (type) => {
            await this.switchBackend(type);
          })
      )
      .addCommand(
        new Command('info')
          .description('Show current backend information')
          .action(async () => {
            await this.backendInfo();
          })
      );

    // Serve command (MCP server)
    this.program
      .command('serve')
      .description('Start MCP server')
      .option('--local', 'Local stdio mode only')
      .option('--ws-port <port>', 'WebSocket port', '8080')
      .option('--sse-port <port>', 'SSE port', '8081')
      .action(async (options) => {
        await this.serveCommand(options);
      });

    // Database command
    dbCommand(this.program);

    // Update command
    updateCommand(this.program);

    // Version command
    this.program
      .command('version')
      .description('Show version information')
      .action(() => {
        console.log(`KB-MCP CLI version ${VERSION}`);
        console.log(`Node.js ${process.version}`);
        console.log(`Platform: ${process.platform} ${process.arch}`);
      });
  }

  private async ensureBackendInitialized(): Promise<void> {
    const result = await this.backendManager.initialize();
    if (!result.success) {
      console.error(chalk.red('Failed to initialize backend:'), result.error);
      process.exit(1);
    }
  }

  private async initCommand(options: any): Promise<void> {
    const spinner = ora('Initializing knowledge base').start();
    
    try {
      // Create config file
      const config = {
        backend: {
          type: options.type,
          filesystem: {
            root_path: './kb',
            enable_versioning: true,
            enable_compression: false,
            max_file_size: '10MB',
            allowed_extensions: ['.md', '.markdown', '.txt'],
          },
          graph: {
            connection: {
              host: 'localhost',
              port: 6380,
            },
            vector_dimensions: 1536,
            enable_semantic_search: true,
            enable_temporal_queries: true,
          }
        },
        security: {
          enable_audit: true,
          enable_encryption: false,
        }
      };

      await fs.writeFile('.kbconfig.yaml', require('js-yaml').dump(config));
      
      // Initialize backend
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend();
      
      if (!backend) {
        throw new Error('Backend not initialized');
      }

      // Initialize the storage
      const initResult = await backend.initialize();
      if (!initResult.success) {
        throw new Error(initResult.error?.message || String(initResult.error));
      }
      
      // Create basic structure
      const dirs = ['docs', 'notes', 'references', 'guides', 'archive', 'active'];
      for (const dir of dirs) {
        await backend.writeFile(`${dir}/.gitkeep`, '');
      }
      
      // Create README
      const readme = `# Knowledge Base

Welcome to your knowledge base!

## Configuration
Backend Type: ${options.type}
${options.type === 'graph' ? 'Graph database enabled with semantic search capabilities.' : 'Filesystem storage with versioning support.'}

## Structure
- \`docs/\` - Documentation files
- \`notes/\` - Meeting notes and quick thoughts  
- \`references/\` - Reference materials and specs
- \`guides/\` - How-to guides and tutorials
- \`archive/\` - Archived content
- \`active/\` - Active issues and tasks

## Usage
\`\`\`bash
# Read a file
kb read docs/example.md

# Create a file
kb write docs/new-doc.md "# New Document\\n\\nContent here"

# List files
kb list

# Search content
kb search "keyword"
${options.type === 'graph' ? '# Semantic search\nkb search "similar concepts" --semantic' : ''}

# Delete a file
kb delete docs/old-file.md

# Switch backend
kb backend switch ${options.type === 'filesystem' ? 'graph' : 'filesystem'}

# Start MCP server
kb serve
\`\`\`

## CLI Commands
- \`kb init\` - Initialize a new knowledge base
- \`kb read <path>\` - Read a file
- \`kb write <path> <content>\` - Write content to a file
- \`kb list [directory]\` - List files
- \`kb search <query>\` - Search for content
- \`kb delete <path>\` - Delete a file
- \`kb status\` - Show status information
- \`kb backend\` - Manage storage backend
- \`kb serve\` - Start MCP server
- \`kb version\` - Show version

---

Generated by KB-MCP CLI v${VERSION}
`;
      
      await backend.writeFile('README.md', readme);
      
      // Create example files
      await backend.writeFile(
        'docs/getting-started.md',
        `# Getting Started

This is your first document in the knowledge base.

## Quick Start

1. Create new files with \`kb write\`
2. Read existing files with \`kb read\`
3. Search content with \`kb search\`
4. List all files with \`kb list\`
5. Switch backends with \`kb backend switch\`

Happy documenting!
`
      );

      await backend.writeFile(
        'active/SETUP_COMPLETE.md',
        `# Setup Complete

- **Date**: ${new Date().toISOString()}
- **Backend**: ${options.type}
- **Status**: ✅ Ready

## Next Steps
1. Start adding your content
2. Configure MCP server if needed
3. Set up graph database for advanced features
`
      );
      
      spinner.succeed(`Knowledge base initialized successfully with ${options.type} backend`);
      console.log(chalk.blue(`\nKB created with backend:`), chalk.cyan(options.type));
      console.log(chalk.gray('Configuration saved to:'), chalk.cyan('.kbconfig.yaml'));
      console.log(chalk.gray('Structure:'), 'docs/, notes/, references/, guides/, archive/, active/');
      
    } catch (error) {
      spinner.fail(`Initialization failed: ${error}`);
    }
  }

  private async readCommand(filePath: string): Promise<void> {
    const spinner = ora(`Reading ${filePath}`).start();
    
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend()!;
      
      const result = await backend.readFile(filePath);
      if (!result.success) {
        throw new Error(result.error?.message || String(result.error));
      }
      
      spinner.stop();
      console.log(chalk.blue(`\n📄 ${filePath}`));
      console.log(chalk.gray(`Backend: ${backend.getBackendType()}`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(result.data);
    } catch (error: any) {
      spinner.fail(`Failed to read ${filePath}: ${error?.message || String(error)}`);
    }
  }

  private async writeCommand(filePath: string, content: string, useEditor = false): Promise<void> {
    let finalContent = content;
    if (!finalContent) {
      if (useEditor) {
        // Use system editor for multi-line input
        const { inputContent } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'inputContent',
            message: `Enter content for ${filePath}:`,
            default: '# New KB Entry\n\n',
          },
        ]);
        finalContent = inputContent;
      } else {
        // Multi-line inline input (end with a single "." on a line)
        console.log(chalk.yellow('Enter content below. Finish with a single "." on a line:'));
        const lines: string[] = [];
        while (true) {
          const { line } = await inquirer.prompt([
            {
              type: 'input',
              name: 'line',
              message: '',
            },
          ]);
          if (line.trim() === '.') break;
          lines.push(line);
        }
        finalContent = lines.join('\n');
      }
    }
    const spinner = ora(`Writing ${filePath}`).start();
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend()!;
      // Process content (decode \\n to actual newlines)
      const processedContent = finalContent.replace(/\\n/g, '\n');
      const result = await backend.writeFile(filePath, processedContent);
      if (!result.success) {
        throw new Error(result.error?.message || String(result.error));
      }
      spinner.succeed(`File ${filePath} written successfully`);
      console.log(chalk.gray(`Backend: ${backend.getBackendType()}`));
    } catch (error: any) {
      spinner.fail(`Failed to write ${filePath}: ${error?.message || String(error)}`);
    }
  }

  private async listCommand(directory: string): Promise<void> {
    const spinner = ora(`Listing ${directory || 'root'}`).start();
    
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend()!;
      
      const result = await backend.listFiles(directory);
      if (!result.success) {
        throw new Error(result.error?.message || String(result.error));
      }
      const files = result.data!.files || [];
      
      spinner.stop();
      console.log(chalk.blue(`\n📁 Contents of ${directory || 'knowledge base'}:`));
      console.log(chalk.gray(`Backend: ${backend.getBackendType()}`));
      console.log(chalk.gray('─'.repeat(60)));
      
      if (files.length === 0) {
        console.log(chalk.gray('No files found'));
        return;
      }
      
      // Sort and display files
      files.sort((a, b) => a.path.localeCompare(b.path));
      files.forEach((file) => {
        // KBFile does not have a 'type' property, so just show the path
        console.log(chalk.cyan(file.path));
      });
      
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.gray(`Total: ${files.length} items`));
    } catch (error) {
      spinner.fail(`Failed to list directory: ${error}`);
    }
  }

  private async searchCommand(query: string, options: any): Promise<void> {
    const spinner = ora(`Searching for "${query}"`).start();
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend()!;
      const limit = parseInt(options.limit) || 10;
      const searchResult = await backend.searchContent(query, { limit });
      if (!searchResult.success) {
        throw new Error(searchResult.error?.message || String(searchResult.error));
      }
      const results = searchResult.data || [];
      const limitedResults = results.slice(0, limit);
      spinner.stop();
      console.log(chalk.blue(`\n🔍 Search results for "${query}":`));
      console.log(chalk.gray(`Backend: ${backend.getBackendType()}`));
      console.log(chalk.gray('─'.repeat(60)));
      if (limitedResults.length === 0) {
        console.log(chalk.gray('No matches found'));
        return;
      }
      limitedResults.forEach((result, index) => {
        console.log(`\n${index + 1}. ${chalk.yellow(result.file.path)}`);
        if (result.score !== undefined) {
          console.log(chalk.gray(`   Score: ${result.score.toFixed(3)}`));
        }
        result.matches.forEach((match) => {
          const preview = match.content || '';
          console.log(chalk.gray(`   Line ${match.line}:`), preview.trim());
        });
      });
      console.log(chalk.gray(`\nShowing ${limitedResults.length} of ${results.length} results`));
    } catch (error: any) {
      spinner.fail(`Search failed: ${error?.message || String(error)}`);
    }
  }

  private async deleteCommand(filePath: string): Promise<void> {
    const spinner = ora(`Deleting ${filePath}`).start();
    
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend()!;
      
      const result = await backend.deleteFile(filePath);
      if (!result.success) {
        throw new Error(result.error?.message || String(result.error));
      }
      
      spinner.succeed(`File ${filePath} deleted successfully`);
      console.log(chalk.gray(`Backend: ${this.backendManager.getBackend()!.getBackendType()}`));
    } catch (error) {
      spinner.fail(`Failed to delete ${filePath}: ${error}`);
    }
  }

  private async statusCommand(): Promise<void> {
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend()!;
      
      const result = await backend.getStatus();
      if (!result.success) {
        throw new Error(result.error?.message || String(result.error));
      }
      
      const status = result.data!;
      
      console.log(chalk.bold('\n📊 Knowledge Base Status'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('Backend Type:', chalk.cyan(backend.getBackendType()));
      console.log('Overall Completion:', chalk.cyan(`${status.overall_completion}%`));
      console.log('Critical Issues:', chalk.red(status.critical_issues.toString()));
      
      if (status.last_updated) {
        console.log('Last updated:', chalk.gray(new Date(status.last_updated).toLocaleString()));
      }
      
      if (status.phases && status.phases.length > 0) {
        console.log('\nPhases:');
        status.phases.forEach(phase => {
          const statusColor = phase.status === 'completed' ? chalk.green :
                            phase.status === 'in_progress' ? chalk.yellow :
                            phase.status === 'blocked' ? chalk.red : chalk.gray;
          console.log(`  ${phase.name}: ${statusColor(phase.status)} (${phase.completion}%)`);
          if (phase.notes) {
            console.log(`    ${chalk.gray(phase.notes)}`);
          }
        });
      }
      
      if (status.phases) {
        console.log('\nPhases:');
        status.phases.forEach((phase: any) => {
          console.log(`  ${phase.name}:`, chalk.cyan(phase.status), `(${phase.completion}%)`);
        });
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error);
    }
  }

  private async switchBackend(type: string): Promise<void> {
    const spinner = ora(`Switching to ${type} backend`).start();
    
    try {
      const result = await this.backendManager.switchBackend(type as 'filesystem' | 'graph');
      if (!result.success) {
        throw new Error(result.error?.message || String(result.error));
      }
      
      spinner.succeed(`Switched to ${type} backend successfully`);
      
      // Show new backend info
      await this.backendInfo();
    } catch (error) {
      spinner.fail(`Failed to switch backend: ${error}`);
    }
  }

  private async backendInfo(): Promise<void> {
    try {
      await this.ensureBackendInitialized();
      const backend = this.backendManager.getBackend();
      if (!backend) {
        console.log(chalk.red('No backend initialized'));
        return;
      }
      
      const healthResult = await this.backendManager.getBackendHealth();
      const config = this.backendManager.getCurrentConfig();
      
      console.log(chalk.bold('\n🔧 Backend Information'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('Type:', chalk.cyan(backend.getBackendType()));
      console.log('Status:', healthResult.success ? chalk.green('Healthy') : chalk.red('Unhealthy'));
      
      if (config) {
        console.log('\nConfiguration:');
        console.log('  type:', chalk.gray(config.type));
        if (config.filesystem) {
          console.log('  root_path:', chalk.gray(config.filesystem.root_path));
          console.log('  enable_versioning:', chalk.gray(config.filesystem.enable_versioning));
        }
        if (config.graph) {
          console.log('  connection:', chalk.gray(JSON.stringify(config.graph.connection)));
          console.log('  vector_dimensions:', chalk.gray(config.graph.vector_dimensions));
        }
      }
      
      if (healthResult.success && healthResult.data?.details) {
        console.log('\nHealth Details:');
        Object.entries(healthResult.data.details).forEach(([key, value]) => {
          console.log(`  ${key}:`, chalk.gray(JSON.stringify(value)));
        });
      }
    } catch (error) {
      console.error(chalk.red('Failed to get backend info:'), error);
    }
  }

  private async serveCommand(options: any): Promise<void> {
    console.log(chalk.blue('Starting MCP server...'));
    
    try {
      const serverOptions = {
        stdio: true,
        websocket: !options.local ? {
          port: parseInt(options.wsPort) || 8080,
          host: '0.0.0.0',
          path: '/mcp',
        } : undefined,
        sse: !options.local ? {
          port: parseInt(options.ssePort) || 8081,
          host: '0.0.0.0',
          path: '/mcp',
        } : undefined,
      };
      
      const server = new MultiTransportServer(serverOptions, process.cwd());
      
      // Initialize server
      const initResult = await server.initialize();
      if (!initResult.success) {
        throw new Error(initResult.error.message);
      }
      
      // Start server
      const startResult = await server.start();
      if (!startResult.success) {
        throw new Error(startResult.error.message);
      }
      
      console.log(chalk.green('✓ MCP server started successfully'));
      
      if (!options.local) {
        console.log(chalk.gray(`WebSocket: ws://localhost:${options.wsPort || 8080}/mcp`));
        console.log(chalk.gray(`SSE: http://localhost:${options.ssePort || 8081}/mcp/events`));
      }
      
      // Keep server running
      process.on('SIGINT', async () => {
        console.log('\nShutting down server...');
        await server.stop();
        process.exit(0);
      });
      
    } catch (error) {
      console.error(chalk.red('Failed to start server:'), error);
      process.exit(1);
    }
  }

  async run(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
}

// Removed unused formatBytes function

// Handle uncaught errors
process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled Rejection:'), reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

// Run the CLI
const cli = new UnifiedKBCLI();
cli.run().catch((error) => {
  console.error(chalk.red('CLI Error:'), error);
  process.exit(1);
});