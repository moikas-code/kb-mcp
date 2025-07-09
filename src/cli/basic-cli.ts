#!/usr/bin/env node
/**
 * Basic KB CLI implementation
 * A minimal working CLI for knowledge base management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { MultiTransportServer } from '../mcp/multi-transport-server.js';
import { execSync } from 'child_process';
import crypto from 'crypto';

const VERSION = '2.1.0';

interface FileInfo {
  path: string;
  size: number;
  modified: string;
  content?: string;
}

/**
 * Basic KB CLI - minimal implementation
 */
class BasicKBCLI {
  private program: Command;
  private kbPath: string;

  constructor() {
    this.program = new Command();
    this.kbPath = path.join(process.cwd(), 'kb');
    this.setupProgram();
    this.setupCommands();
  }

  private setupProgram(): void {
    this.program
      .name('kb')
      .description('Knowledge Base Management CLI')
      .version(VERSION)
      .option('-d, --debug', 'Enable debug logging');
  }

  private setupCommands(): void {
    // Initialize command
    this.program
      .command('init')
      .description('Initialize a new knowledge base')
      .action(async () => {
        await this.initCommand();
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
      .command('write <path> <content>')
      .alias('create')
      .description('Write content to a file in the knowledge base')
      .action(async (filePath, content) => {
        await this.writeCommand(filePath, content);
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
      .description('Show knowledge base status')
      .action(async () => {
        await this.statusCommand();
      });

    // Version command
    this.program
      .command('version')
      .description('Show version information')
      .action(() => {
        console.log(`KB-MCP CLI version ${VERSION}`);
        console.log(`Node.js ${process.version}`);
        console.log(`Platform: ${process.platform} ${process.arch}`);
      });

    // Serve command (MCP server)
    this.program
      .command('serve')
      .description('Start MCP server')
      .option('--stdio', 'Use stdio transport only (default)')
      .option('--port <port>', 'HTTP/WebSocket port (default: 3000)')
      .option('--websocket', 'Enable WebSocket transport')
      .option('--http', 'Enable HTTP transport')
      .action(async (options) => {
        await this.serveCommand(options);
      });

    // Database command
    const db = this.program
      .command('db')
      .description('Manage local graph database');
    
    db.command('start')
      .description('Start local FalkorDB instance')
      .action(async () => {
        await this.dbCommand('start');
      });
    
    db.command('stop')
      .description('Stop local FalkorDB instance')
      .action(async () => {
        await this.dbCommand('stop');
      });
    
    db.command('status')
      .description('Check database status')
      .action(async () => {
        await this.dbCommand('status');
      });
  }

  private async initCommand(): Promise<void> {
    const spinner = ora('Initializing knowledge base').start();
    
    try {
      // Create kb directory
      await fs.mkdir(this.kbPath, { recursive: true });
      
      // Create basic structure
      const dirs = ['docs', 'notes', 'references', 'guides', 'archive'];
      for (const dir of dirs) {
        await fs.mkdir(path.join(this.kbPath, dir), { recursive: true });
      }
      
      // Create README
      const readme = `# Knowledge Base

Welcome to your knowledge base!

## Structure
- \`docs/\` - Documentation files
- \`notes/\` - Meeting notes and quick thoughts  
- \`references/\` - Reference materials and specs
- \`guides/\` - How-to guides and tutorials
- \`archive/\` - Archived content

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

# Delete a file
kb delete docs/old-file.md

# Start MCP server
kb serve

# Manage database (for graph backend)
kb db start    # Start local database
kb db stop     # Stop database
kb db status   # Check database status
\`\`\`

## CLI Commands
- \`kb init\` - Initialize a new knowledge base
- \`kb read <path>\` - Read a file
- \`kb write <path> <content>\` - Write content to a file
- \`kb list [directory]\` - List files
- \`kb search <query>\` - Search for content
- \`kb delete <path>\` - Delete a file
- \`kb status\` - Show status information
- \`kb serve\` - Start MCP server
- \`kb db\` - Manage local graph database
- \`kb version\` - Show version

---

Generated by KB-MCP CLI v${VERSION}
`;
      
      await fs.writeFile(path.join(this.kbPath, 'README.md'), readme);
      
      // Create example files
      await fs.writeFile(
        path.join(this.kbPath, 'docs', 'getting-started.md'),
        `# Getting Started

This is your first document in the knowledge base.

## Quick Start

1. Create new files with \`kb write\`
2. Read existing files with \`kb read\`
3. Search content with \`kb search\`
4. List all files with \`kb list\`

Happy documenting!
`
      );

      await fs.writeFile(
        path.join(this.kbPath, 'notes', 'example-note.md'),
        `# Example Note

Created: ${new Date().toISOString()}

This is an example note to demonstrate the structure.

## Meeting Notes
- Topic: Knowledge base setup
- Date: ${new Date().toDateString()}
- Attendees: You

## Action Items
- [ ] Add more content
- [ ] Organize files
- [ ] Share with team
`
      );
      
      spinner.succeed('Knowledge base initialized successfully');
      console.log(chalk.blue(`\nKB created at: ${chalk.cyan(this.kbPath)}`));
      console.log(chalk.gray('Total files created:'), chalk.cyan('3'));
      console.log(chalk.gray('Structure:'), 'docs/, notes/, references/, guides/, archive/');
      
    } catch (error) {
      spinner.fail(`Initialization failed: ${error}`);
    }
  }

  private async readCommand(filePath: string): Promise<void> {
    const spinner = ora(`Reading ${filePath}`).start();
    
    try {
      const fullPath = path.join(this.kbPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      
      spinner.stop();
      console.log(chalk.blue(`\n📄 ${filePath}`));
      console.log(chalk.gray(`Size: ${stats.size} bytes | Modified: ${stats.mtime.toISOString()}`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(content);
    } catch (error) {
      spinner.fail(`Failed to read ${filePath}: File not found`);
    }
  }

  private async writeCommand(filePath: string, content: string): Promise<void> {
    const spinner = ora(`Writing ${filePath}`).start();
    
    try {
      const fullPath = path.join(this.kbPath, filePath);
      
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Process content (decode \\n to actual newlines)
      const processedContent = content.replace(/\\n/g, '\n');
      
      await fs.writeFile(fullPath, processedContent);
      const stats = await fs.stat(fullPath);
      
      spinner.succeed(`File ${filePath} written successfully`);
      console.log(chalk.gray(`Size: ${stats.size} bytes`));
    } catch (error) {
      spinner.fail(`Failed to write ${filePath}: ${error}`);
    }
  }

  private async listCommand(directory: string): Promise<void> {
    const spinner = ora(`Listing ${directory || 'root'}`).start();
    
    try {
      const searchPath = path.join(this.kbPath, directory);
      const pattern = path.join(searchPath, '**', '*').replace(/\\/g, '/');
      const files = await glob(pattern, { nodir: true });
      
      const fileInfos: FileInfo[] = [];
      let totalSize = 0;
      
      for (const file of files) {
        const stats = await fs.stat(file);
        const relativePath = path.relative(this.kbPath, file);
        fileInfos.push({
          path: relativePath,
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
        totalSize += stats.size;
      }
      
      // Sort by path
      fileInfos.sort((a, b) => a.path.localeCompare(b.path));
      
      spinner.stop();
      console.log(chalk.blue(`\n📁 Contents of ${directory || 'knowledge base'}:`));
      console.log(chalk.gray('─'.repeat(60)));
      
      if (fileInfos.length === 0) {
        console.log(chalk.gray('No files found'));
        return;
      }
      
      fileInfos.forEach((file) => {
        const sizeStr = formatBytes(file.size);
        const modifiedStr = new Date(file.modified).toLocaleDateString();
        console.log(`${chalk.cyan(file.path.padEnd(30))} ${sizeStr.padStart(8)} ${chalk.gray(modifiedStr)}`);
      });
      
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.gray(`Total: ${fileInfos.length} files, ${formatBytes(totalSize)}`));
    } catch (error) {
      spinner.fail(`Failed to list directory: ${error}`);
    }
  }

  private async searchCommand(query: string, options: any): Promise<void> {
    const spinner = ora(`Searching for "${query}"`).start();
    
    try {
      const pattern = path.join(this.kbPath, '**', '*.md').replace(/\\/g, '/');
      const files = await glob(pattern);
      
      const results: Array<{
        path: string;
        matches: Array<{ line: number; content: string; }>;
        score: number;
      }> = [];
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');
          const matches: Array<{ line: number; content: string; }> = [];
          
          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                line: index + 1,
                content: line.trim()
              });
            }
          });
          
          if (matches.length > 0) {
            const relativePath = path.relative(this.kbPath, file);
            results.push({
              path: relativePath,
              matches,
              score: matches.length
            });
          }
        } catch {
          // Skip files that can't be read
        }
      }
      
      // Sort by score (number of matches)
      results.sort((a, b) => b.score - a.score);
      
      // Limit results
      const limit = parseInt(options.limit) || 10;
      const limitedResults = results.slice(0, limit);
      
      spinner.stop();
      console.log(chalk.blue(`\n🔍 Search results for "${query}":`));
      console.log(chalk.gray('─'.repeat(60)));
      
      if (limitedResults.length === 0) {
        console.log(chalk.gray('No matches found'));
        return;
      }
      
      limitedResults.forEach((result, index) => {
        console.log(`\n${index + 1}. ${chalk.yellow(result.path)} (${result.score} matches)`);
        result.matches.forEach((match) => {
          const highlightedContent = match.content.replace(
            new RegExp(query, 'gi'),
            chalk.bgYellow.black(query)
          );
          console.log(chalk.gray(`   Line ${match.line}:`), highlightedContent);
        });
      });
      
      console.log(chalk.gray(`\nShowing ${limitedResults.length} of ${results.length} results`));
    } catch (error) {
      spinner.fail(`Search failed: ${error}`);
    }
  }

  private async deleteCommand(filePath: string): Promise<void> {
    const spinner = ora(`Deleting ${filePath}`).start();
    
    try {
      const fullPath = path.join(this.kbPath, filePath);
      await fs.unlink(fullPath);
      spinner.succeed(`File ${filePath} deleted successfully`);
    } catch (error) {
      spinner.fail(`Failed to delete ${filePath}: File not found`);
    }
  }

  private async statusCommand(): Promise<void> {
    try {
      const pattern = path.join(this.kbPath, '**', '*').replace(/\\/g, '/');
      const allFiles = await glob(pattern, { nodir: true });
      const markdownFiles = await glob(path.join(this.kbPath, '**', '*.md').replace(/\\/g, '/'));
      
      let totalSize = 0;
      let oldestFile = '';
      let newestFile = '';
      let oldestTime = Date.now();
      let newestTime = 0;
      
      for (const file of allFiles) {
        const stats = await fs.stat(file);
        totalSize += stats.size;
        
        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
          oldestFile = path.relative(this.kbPath, file);
        }
        
        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
          newestFile = path.relative(this.kbPath, file);
        }
      }
      
      console.log(chalk.bold('\n📊 Knowledge Base Status'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('Location:', chalk.cyan(this.kbPath));
      console.log('Total files:', chalk.cyan(allFiles.length.toString()));
      console.log('Markdown files:', chalk.cyan(markdownFiles.length.toString()));
      console.log('Total size:', chalk.cyan(formatBytes(totalSize)));
      
      if (oldestFile) {
        console.log('Oldest file:', chalk.gray(oldestFile), chalk.gray(`(${new Date(oldestTime).toLocaleDateString()})`));
      }
      
      if (newestFile) {
        console.log('Newest file:', chalk.yellow(newestFile), chalk.gray(`(${new Date(newestTime).toLocaleDateString()})`));
      }
      
      // Show directory breakdown
      const dirStats: Record<string, number> = {};
      allFiles.forEach(file => {
        const relativePath = path.relative(this.kbPath, file);
        const dir = path.dirname(relativePath);
        const topDir = dir === '.' ? 'root' : dir.split(path.sep)[0];
        dirStats[topDir] = (dirStats[topDir] || 0) + 1;
      });
      
      console.log('\nFiles by directory:');
      Object.entries(dirStats)
        .sort(([,a], [,b]) => b - a)
        .forEach(([dir, count]) => {
          console.log(`  ${dir}:`, chalk.cyan(count.toString()));
        });
      
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error);
    }
  }

  private async dbCommand(action: string): Promise<void> {
    switch (action) {
      case 'start':
        await this.startDatabase();
        break;
      case 'stop':
        await this.stopDatabase();
        break;
      case 'status':
        await this.showDatabaseStatus();
        break;
      default:
        console.error(chalk.red(`Unknown database action: ${action}`));
    }
  }

  private async startDatabase(): Promise<void> {
    const spinner = ora('Starting local database...').start();
    
    try {
      // Check if Docker is available
      try {
        execSync('docker --version', { stdio: 'ignore' });
      } catch {
        spinner.fail('Docker is not installed or not running');
        console.log(chalk.yellow('\nPlease install Docker: https://docs.docker.com/get-docker/'));
        return;
      }

      // Generate project ID based on current directory
      const projectId = crypto.createHash('sha256').update(process.cwd()).digest('hex').substring(0, 8);
      const projectName = `kb_${projectId}`;
      
      // Create docker network if it doesn't exist
      try {
        execSync(`docker network create ${projectName}_network`, { stdio: 'ignore' });
      } catch {
        // Network might already exist
      }
      
      // Start FalkorDB container
      const falkorPort = 6380 + (parseInt(projectId.substring(0, 4), 16) % 1000);
      try {
        execSync(`docker run -d --name ${projectName}_falkordb \
          --network ${projectName}_network \
          -p ${falkorPort}:6379 \
          -e FALKORDB_PASSWORD=dev_${projectId} \
          falkordb/falkordb:latest`, { stdio: 'ignore' });
      } catch (error) {
        // Container might already exist, try to start it
        try {
          execSync(`docker start ${projectName}_falkordb`, { stdio: 'ignore' });
        } catch {
          throw new Error('Failed to start FalkorDB container');
        }
      }
      
      // Start Redis container
      const redisPort = 7379 + (parseInt(projectId.substring(0, 4), 16) % 1000);
      try {
        execSync(`docker run -d --name ${projectName}_redis \
          --network ${projectName}_network \
          -p ${redisPort}:6379 \
          -e REDIS_PASSWORD=dev_${projectId} \
          redis:7-alpine redis-server --requirepass dev_${projectId}`, { stdio: 'ignore' });
      } catch (error) {
        // Container might already exist, try to start it
        try {
          execSync(`docker start ${projectName}_redis`, { stdio: 'ignore' });
        } catch {
          throw new Error('Failed to start Redis container');
        }
      }
      
      // Wait for containers to be ready
      spinner.text = 'Waiting for databases to be ready...';
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      spinner.succeed('Database started successfully');
      
      // Display connection info
      console.log('\n' + chalk.bold('Connection Information:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('FalkorDB:');
      console.log('  Host:', chalk.cyan('localhost'));
      console.log('  Port:', chalk.cyan(falkorPort.toString()));
      console.log('  Password:', chalk.cyan(`dev_${projectId}`));
      console.log('\nRedis:');
      console.log('  Host:', chalk.cyan('localhost'));
      console.log('  Port:', chalk.cyan(redisPort.toString()));
      console.log('  Password:', chalk.cyan(`dev_${projectId}`));
      
      // Update config file if it exists
      try {
        const configPath = '.kbconfig.yaml';
        if (await fs.stat(configPath).catch(() => null)) {
          let configContent = await fs.readFile(configPath, 'utf-8');
          
          // Update graph backend configuration
          configContent = configContent.replace(/graph:\s*\n\s*connection:\s*\n\s*host:.*\n\s*port:.*/, 
            `graph:\n    connection:\n      host: localhost\n      port: ${falkorPort}`);
          
          await fs.writeFile(configPath, configContent);
          console.log('\n' + chalk.gray('Configuration updated in .kbconfig.yaml'));
        }
      } catch {
        // Ignore config update errors
      }
      
    } catch (error) {
      spinner.fail(`Failed to start database: ${error}`);
      process.exit(1);
    }
  }

  private async stopDatabase(): Promise<void> {
    const spinner = ora('Stopping database...').start();
    
    try {
      const projectId = crypto.createHash('sha256').update(process.cwd()).digest('hex').substring(0, 8);
      const projectName = `kb_${projectId}`;
      
      // Stop containers
      try {
        execSync(`docker stop ${projectName}_falkordb ${projectName}_redis`, { stdio: 'ignore' });
        spinner.succeed('Database stopped');
      } catch {
        spinner.fail('No running database found for this project');
      }
    } catch (error) {
      spinner.fail(`Failed to stop database: ${error}`);
    }
  }

  private async showDatabaseStatus(): Promise<void> {
    try {
      const projectId = crypto.createHash('sha256').update(process.cwd()).digest('hex').substring(0, 8);
      const projectName = `kb_${projectId}`;
      
      console.log(chalk.bold('\nDatabase Status'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('Project:', chalk.cyan(path.basename(process.cwd())));
      console.log('Project ID:', chalk.cyan(projectId));
      
      // Check container status
      let falkordbRunning = false;
      let redisRunning = false;
      
      try {
        const falkorStatus = execSync(`docker inspect -f '{{.State.Running}}' ${projectName}_falkordb`, { encoding: 'utf-8' }).trim();
        falkordbRunning = falkorStatus === 'true';
      } catch {
        // Container doesn't exist
      }
      
      try {
        const redisStatus = execSync(`docker inspect -f '{{.State.Running}}' ${projectName}_redis`, { encoding: 'utf-8' }).trim();
        redisRunning = redisStatus === 'true';
      } catch {
        // Container doesn't exist
      }
      
      const status = falkordbRunning && redisRunning ? 'Running' : 
                    falkordbRunning || redisRunning ? 'Partial' : 'Stopped';
      
      console.log('Status:', status === 'Running' ? chalk.green(status) : 
                          status === 'Partial' ? chalk.yellow(status) : chalk.red(status));
      
      if (falkordbRunning || redisRunning) {
        console.log('\nContainers:');
        console.log('  FalkorDB:', falkordbRunning ? chalk.green('✓') : chalk.red('✗'));
        console.log('  Redis:', redisRunning ? chalk.green('✓') : chalk.red('✗'));
        
        const falkorPort = 6380 + (parseInt(projectId.substring(0, 4), 16) % 1000);
        const redisPort = 7379 + (parseInt(projectId.substring(0, 4), 16) % 1000);
        
        console.log('\nPorts:');
        console.log('  FalkorDB:', chalk.cyan(`localhost:${falkorPort}`));
        console.log('  Redis:', chalk.cyan(`localhost:${redisPort}`));
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error);
    }
  }

  private async serveCommand(options: any): Promise<void> {
    console.log(chalk.blue('Starting MCP server...'));
    
    try {
      // Determine transport type
      let transport: 'stdio' | 'http' | 'websocket' = 'stdio';
      if (options.websocket) {
        transport = 'websocket';
      } else if (options.http || options.port) {
        transport = 'http';
      }
      
      // Build server options based on transport
      const serverOptions: any = {
        rootPath: process.cwd()
      };
      
      if (transport === 'stdio') {
        serverOptions.stdio = true;
      } else {
        const port = parseInt(options.port) || 3000;
        
        if (transport === 'websocket') {
          serverOptions.websocket = {
            port,
            host: '0.0.0.0',
            path: '/mcp'
          };
        } else {
          serverOptions.http = {
            port,
            host: '0.0.0.0'
          };
        }
      }
      
      const server = new MultiTransportServer(serverOptions, process.cwd());
      
      // Initialize server
      const initResult = await server.initialize();
      if (!initResult.success) {
        throw new Error(initResult.error?.message || 'Failed to initialize server');
      }
      
      // Start server
      const startResult = await server.start();
      if (!startResult.success) {
        throw new Error(startResult.error?.message || 'Failed to start server');
      }
      
      console.log(chalk.green('✓ MCP server started successfully'));
      
      if (transport === 'stdio') {
        console.log(chalk.gray('\nServer running in stdio mode'));
        console.log(chalk.gray('Add to Claude Desktop configuration:'));
        console.log(chalk.cyan(JSON.stringify({
          mcpServers: {
            'kb-mcp': {
              command: 'kb',
              args: ['serve']
            }
          }
        }, null, 2)));
      } else if (transport === 'websocket') {
        console.log(chalk.gray(`\nWebSocket endpoint: ws://localhost:${options.port || 3000}/mcp`));
      } else {
        console.log(chalk.gray(`\nHTTP endpoint: http://localhost:${options.port || 3000}/`));
      }
      
      console.log(chalk.gray('\nPress Ctrl+C to stop the server'));
      
      // Keep server running
      process.on('SIGINT', async () => {
        console.log('\n' + chalk.yellow('Shutting down server...'));
        await server.stop();
        process.exit(0);
      });
      
      // Keep the process alive
      await new Promise(() => {});
      
    } catch (error) {
      console.error(chalk.red('Failed to start server:'), error);
      process.exit(1);
    }
  }

  async run(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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
const cli = new BasicKBCLI();
cli.run().catch((error) => {
  console.error(chalk.red('CLI Error:'), error);
  process.exit(1);
});