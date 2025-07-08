#!/usr/bin/env node
/**
 * Simple KB CLI implementation
 * A basic working CLI for knowledge base management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { BackendManager } from '../core/backend-manager.js';
import { executeTool } from '../mcp/tools.js';

const VERSION = '1.1.0';

/**
 * Simple KB CLI
 */
class SimpleKBCLI {
  private program: Command;
  private backendManager?: BackendManager;

  constructor() {
    this.program = new Command();
    this.setupProgram();
    this.setupCommands();
  }

  private setupProgram(): void {
    this.program
      .name('kb')
      .description('Knowledge Base Management CLI')
      .version(VERSION)
      .option('-d, --debug', 'Enable debug logging')
      .hook('preAction', async () => {
        await this.initializeBackend();
      });
  }

  private setupCommands(): void {
    // Initialize command
    this.program
      .command('init')
      .description('Initialize a new knowledge base')
      .option('-t, --type <backend>', 'Backend type (filesystem or graph)', 'filesystem')
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
      .option('-c, --content <text>', 'Content to write')
      .action(async (filePath, content, options) => {
        await this.writeCommand(filePath, content || options.content);
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

    // Backend info command
    this.program
      .command('backend')
      .description('Show backend information')
      .action(async () => {
        await this.backendCommand();
      });

    // Switch backend command
    this.program
      .command('switch <backend>')
      .description('Switch to a different backend (filesystem or graph)')
      .action(async (backend) => {
        await this.switchCommand(backend);
      });

    // Status command
    this.program
      .command('status')
      .description('Show knowledge base status')
      .action(async () => {
        await this.statusCommand();
      });

    // Serve command
    this.program
      .command('serve')
      .description('Start as MCP server')
      .option('-p, --port <number>', 'Port number', '3000')
      .option('--stdio', 'Use stdio transport')
      .action(async (options) => {
        await this.serveCommand(options);
      });
  }

  private async initializeBackend(): Promise<void> {
    try {
      this.backendManager = new BackendManager(process.cwd());
      await this.backendManager.initialize();
    } catch (error) {
      console.error(chalk.red('Failed to initialize backend:'), error);
      process.exit(1);
    }
  }

  private async initCommand(options: any): Promise<void> {
    const spinner = ora('Initializing knowledge base').start();
    
    try {
      const kbPath = path.join(process.cwd(), 'kb');
      
      // Create kb directory
      await fs.mkdir(kbPath, { recursive: true });
      
      // Create basic structure
      const dirs = ['docs', 'notes', 'references'];
      for (const dir of dirs) {
        await fs.mkdir(path.join(kbPath, dir), { recursive: true });
      }
      
      // Create README
      const readme = `# Knowledge Base

Welcome to your knowledge base!

## Structure
- \`docs/\` - Documentation
- \`notes/\` - Meeting notes and quick thoughts  
- \`references/\` - Reference materials

## Usage
\`\`\`bash
# Read a file
kb read docs/example.md

# Create a file
kb write docs/new-doc.md "# New Document"

# List files
kb list

# Search content
kb search "keyword"
\`\`\`
`;
      
      await fs.writeFile(path.join(kbPath, 'README.md'), readme);
      
      spinner.succeed('Knowledge base initialized successfully');
      console.log(chalk.blue(`\nKB created at: ${chalk.cyan(kbPath)}`));
      console.log(chalk.gray('Backend type:'), chalk.cyan(options.type));
      
    } catch (error) {
      spinner.fail(`Initialization failed: ${error}`);
    }
  }

  private async readCommand(filePath: string): Promise<void> {
    const spinner = ora(`Reading ${filePath}`).start();
    
    try {
      const result = await executeTool('kb_read', { path: filePath }, this.backendManager!);
      spinner.stop();
      console.log(result.content);
    } catch (error) {
      spinner.fail(`Failed to read ${filePath}: ${error}`);
    }
  }

  private async writeCommand(filePath: string, content?: string): Promise<void> {
    if (!content) {
      console.error(chalk.red('Error: Content is required'));
      console.log('Usage: kb write <path> <content>');
      console.log('   or: kb write <path> --content "content"');
      return;
    }
    
    const spinner = ora(`Writing ${filePath}`).start();
    
    try {
      await executeTool('kb_update', { path: filePath, content }, this.backendManager!);
      spinner.succeed(`File ${filePath} written successfully`);
    } catch (error) {
      spinner.fail(`Failed to write ${filePath}: ${error}`);
    }
  }

  private async listCommand(directory: string): Promise<void> {
    const spinner = ora(`Listing ${directory || 'root'}`).start();
    
    try {
      const result = await executeTool('kb_list', { directory }, this.backendManager!);
      spinner.stop();
      
      console.log(chalk.blue(`\nContents of ${directory || 'root'}:`));
      result.files.forEach((file: any) => {
        console.log(`  ${file.path}`);
      });
      console.log(chalk.gray(`\nTotal: ${result.total_files} files`));
    } catch (error) {
      spinner.fail(`Failed to list directory: ${error}`);
    }
  }

  private async searchCommand(query: string, options: any): Promise<void> {
    const spinner = ora(`Searching for "${query}"`).start();
    
    try {
      const result = await executeTool('kb_search', { 
        query, 
        limit: parseInt(options.limit) 
      }, this.backendManager!);
      spinner.stop();
      
      console.log(chalk.blue(`\nSearch results for "${query}":`));
      result.results.forEach((item: any, index: number) => {
        console.log(`\n${index + 1}. ${chalk.yellow(item.path)} (score: ${item.score})`);
        if (item.snippet) {
          console.log(chalk.gray(item.snippet));
        }
      });
      console.log(chalk.gray(`\nTotal: ${result.total_results} results`));
    } catch (error) {
      spinner.fail(`Search failed: ${error}`);
    }
  }

  private async deleteCommand(filePath: string): Promise<void> {
    const spinner = ora(`Deleting ${filePath}`).start();
    
    try {
      await executeTool('kb_delete', { path: filePath }, this.backendManager!);
      spinner.succeed(`File ${filePath} deleted successfully`);
    } catch (error) {
      spinner.fail(`Failed to delete ${filePath}: ${error}`);
    }
  }

  private async backendCommand(): Promise<void> {
    try {
      const result = await executeTool('kb_backend_info', {}, this.backendManager!);
      
      console.log(chalk.bold('\nBackend Information:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('Current backend:', chalk.cyan(result.current_backend.type));
      console.log('Available backends:');
      result.available_backends.forEach((backend: any) => {
        const status = backend.available ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${status} ${backend.name}: ${backend.description}`);
      });
    } catch (error) {
      console.error(chalk.red('Failed to get backend info:'), error);
    }
  }

  private async switchCommand(backend: string): Promise<void> {
    const spinner = ora(`Switching to ${backend} backend`).start();
    
    try {
      await executeTool('kb_backend_switch', { 
        backend_type: backend, 
        migrate_data: true 
      }, this.backendManager!);
      spinner.succeed(`Successfully switched to ${backend} backend`);
    } catch (error) {
      spinner.fail(`Failed to switch backend: ${error}`);
    }
  }

  private async statusCommand(): Promise<void> {
    try {
      const result = await executeTool('kb_status', {}, this.backendManager!);
      
      console.log(chalk.bold('\nKnowledge Base Status:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log('Overall completion:', chalk.cyan(`${result.overall_completion}%`));
      console.log('Backend type:', chalk.cyan(result.backend_type));
      console.log('Critical issues:', result.critical_issues ? chalk.red(result.critical_issues) : chalk.green('0'));
      
      if (result.phases) {
        console.log('\nPhases:');
        result.phases.forEach((phase: any) => {
          const status = phase.completed ? chalk.green('✓') : chalk.yellow('○');
          console.log(`  ${status} ${phase.name}: ${phase.completion}%`);
        });
      }
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error);
    }
  }

  private async serveCommand(options: any): Promise<void> {
    console.log(chalk.blue('Starting MCP server...'));
    console.log(chalk.gray('Transport:'), options.stdio ? 'stdio' : 'http');
    
    if (!options.stdio) {
      console.log(chalk.gray('Port:'), chalk.cyan(options.port));
      console.log(chalk.gray('URL:'), chalk.cyan(`http://localhost:${options.port}`));
    }
    
    console.log(chalk.yellow('\nMCP server functionality not yet implemented in simple CLI'));
    console.log(chalk.gray('Use the full CLI for MCP server capabilities'));
  }

  async run(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
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
const cli = new SimpleKBCLI();
cli.run().catch((error) => {
  console.error(chalk.red('CLI Error:'), error);
  process.exit(1);
});