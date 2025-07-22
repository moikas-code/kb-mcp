#!/usr/bin/env node

/**
 * Basic CLI for KB-MCP
 * Provides core knowledge base operations through command line
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import fs from 'fs/promises';
import path from 'path';
import { input, confirm } from '@inquirer/prompts';
import { fileURLToPath } from 'url';
import { BackendManager } from '../core/backend-manager.js';
import { SearchOptions, StorageBackend } from '../core/storage-interface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BasicCLI {
  private program: Command;
  private backendManager?: BackendManager;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  private async getBackendManager(): Promise<BackendManager> {
    if (!this.backendManager) {
      this.backendManager = new BackendManager();
      const initResult = await this.backendManager.initialize();
      if (!initResult.success) {
        console.error(chalk.red(`Failed to initialize backend: ${initResult.error?.message}`));
        process.exit(1);
      }
    }
    return this.backendManager;
  }

  private async getCurrentBackend(): Promise<StorageBackend> {
    const manager = await this.getBackendManager();
    const backend = manager.getBackend();
    if (!backend) {
      console.error(chalk.red('No backend available'));
      process.exit(1);
    }
    return backend;
  }

  private setupCommands(): void {
    this.program
      .name('kb')
      .description('KB-MCP Basic CLI - Knowledge Base Management')
      .version('2.1.4');

    // Write command
    this.program
      .command('write <filepath> [content]')
      .description('Write content to a knowledge base file')
      .option('-i, --interactive', 'Enter content interactively')
      .option('-m, --metadata <json>', 'Add metadata as JSON')
      .option('--semantic', 'Enable semantic search indexing (graph backend only)')
      .action(async (filepath: string, content?: string, options?: any) => {
        await this.writeCommand(filepath, content, options);
      });

    // Read command
    this.program
      .command('read <filepath>')
      .description('Read content from a knowledge base file')
      .option('-m, --metadata', 'Show metadata')
      .option('-s, --stats', 'Show file statistics')
      .action(async (filepath: string, options: any) => {
        await this.readCommand(filepath, options);
      });

    // List command
    this.program
      .command('list [directory]')
      .description('List files in the knowledge base')
      .option('-c, --category <category>', 'Filter by category')
      .option('-d, --detailed', 'Show detailed information')
      .option('-t, --tree', 'Show as directory tree')
      .action(async (directory?: string, options?: any) => {
        await this.listCommand(directory, options);
      });

    // Delete command
    this.program
      .command('delete <filepath>')
      .description('Delete a file from the knowledge base')
      .option('-f, --force', 'Skip confirmation')
      .action(async (filepath: string, options: any) => {
        await this.deleteCommand(filepath, options);
      });

    // Search command
    this.program
      .command('search <query>')
      .description('Search for content in the knowledge base')
      .option('-l, --limit <number>', 'Limit results', '10')
      .option('-c, --category <category>', 'Search in specific category')
      .option('-f, --fuzzy', 'Use fuzzy search')
      .option('--semantic', 'Use semantic search (graph backend only)')
      .action(async (query: string, options: any) => {
        await this.searchCommand(query, options);
      });

    // Status command
    this.program
      .command('status')
      .description('Show knowledge base implementation status')
      .action(async () => {
        await this.statusCommand();
      });

    // Issues command
    this.program
      .command('issues')
      .description('List known issues')
      .option('-s, --severity <level>', 'Filter by severity')
      .action(async (options: any) => {
        await this.issuesCommand(options);
      });

    // Export command
    this.program
      .command('export <output>')
      .description('Export knowledge base to JSON')
      .action(async (output: string) => {
        await this.exportCommand(output);
      });

    // Import command
    this.program
      .command('import <input>')
      .description('Import knowledge base from JSON')
      .option('-f, --force', 'Overwrite existing files')
      .action(async (input: string, options: any) => {
        await this.importCommand(input, options);
      });

    // Backend command group
    const backend = this.program
      .command('backend')
      .description('Backend management commands');

    backend
      .command('status')
      .description('Show current backend status')
      .action(async () => {
        await this.backendStatusCommand();
      });

    backend
      .command('switch <type>')
      .description('Switch backend type (filesystem or graph)')
      .action(async (type: string) => {
        await this.backendSwitchCommand(type);
      });

    backend
      .command('config')
      .description('Show backend configuration')
      .action(async () => {
        await this.backendConfigCommand();
      });
  }

  private async writeCommand(filepath: string, content?: string, options?: any): Promise<void> {
    const spinner = ora('Writing file...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      // Get content if not provided
      if (!content && !options.interactive) {
        spinner.fail('No content provided. Use -i flag for interactive mode.');
        return;
      }

      if (options.interactive) {
        content = await input({
          message: 'Enter content (press Enter twice to finish):',
        });
      }

      // Parse metadata if provided
      let metadata: Record<string, any> | undefined;
      if (options.metadata) {
        try {
          metadata = JSON.parse(options.metadata);
        } catch (error) {
          spinner.fail('Invalid metadata JSON');
          return;
        }
      }

      // Add semantic search flag to metadata if specified
      if (options.semantic && backend.getBackendType() === 'graph') {
        metadata = { ...metadata, enableSemanticSearch: true };
      }

      // Write file using backend
      const result = await backend.writeFile(filepath, content || '', metadata);
      
      if (result.success) {
        spinner.succeed(chalk.green(`File written successfully: ${filepath}`));
        if (options.semantic && backend.getBackendType() === 'graph') {
          console.log(chalk.blue('✓ Semantic search indexing enabled'));
        }
      } else {
        spinner.fail(`Failed to write file: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readCommand(filepath: string, options: any): Promise<void> {
    const spinner = ora('Reading file...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const result = await backend.readFile(filepath);
      
      if (result.success && result.data) {
        spinner.succeed(chalk.green(`File: ${filepath}`));
        
        if (options.metadata && result.data.metadata) {
          console.log(chalk.blue('\nMetadata:'));
          console.log(JSON.stringify(result.data.metadata, null, 2));
        }
        
        if (options.stats) {
          console.log(chalk.blue('\nStatistics:'));
          console.log(`Size: ${result.data.size} bytes`);
          console.log(`Created: ${result.data.created}`);
          console.log(`Modified: ${result.data.modified}`);
          console.log(`Category: ${result.data.category}`);
        }
        
        console.log(chalk.yellow('\nContent:'));
        console.log(result.data.content);
      } else {
        spinner.fail(`Failed to read file: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listCommand(directory?: string, options?: any): Promise<void> {
    const spinner = ora('Listing files...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const result = await backend.listFiles(directory);
      
      if (result.success && result.data) {
        spinner.succeed(chalk.green(`Found ${result.data.total_files} files`));
        
        if (options.tree) {
          // Show as tree structure
          console.log(chalk.blue('\nDirectory Tree:'));
          this.printTree(result.data.files);
        } else if (options.detailed) {
          // Show detailed table
          const table = new Table({
            head: ['Path', 'Category', 'Size', 'Modified'],
            style: { head: ['cyan'] }
          });
          
          const files = options.category 
            ? result.data.files.filter(f => f.category === options.category)
            : result.data.files;
          
          files.forEach(file => {
            table.push([
              file.path,
              file.category,
              `${file.size} bytes`,
              new Date(file.modified).toLocaleString()
            ]);
          });
          
          console.log(table.toString());
        } else {
          // Simple list
          const files = options.category 
            ? result.data.files.filter(f => f.category === options.category)
            : result.data.files;
          
          files.forEach(file => {
            console.log(`- ${file.path}`);
          });
        }
        
        // Show category summary
        console.log(chalk.blue('\nCategory Summary:'));
        Object.entries(result.data.categories).forEach(([category, files]) => {
          if (files.length > 0) {
            console.log(`${category}: ${files.length} files`);
          }
        });
      } else {
        spinner.fail(`Failed to list files: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private printTree(files: any[], prefix = ''): void {
    // Group files by directory
    const tree: Record<string, any> = {};
    
    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file
          if (!current._files) current._files = [];
          current._files.push(part);
        } else {
          // It's a directory
          if (!current[part]) current[part] = {};
          current = current[part];
        }
      });
    });
    
    // Print the tree
    this.printTreeNode(tree, prefix);
  }

  private printTreeNode(node: Record<string, any>, prefix: string): void {
    const entries = Object.entries(node).filter(([key]) => key !== '_files');
    const files = node._files || [];
    
    // Print directories
    entries.forEach(([name, subNode], index) => {
      const isLast = index === entries.length - 1 && files.length === 0;
      console.log(`${prefix}${isLast ? '└── ' : '├── '}${chalk.blue(name + '/')}`);
      this.printTreeNode(subNode, prefix + (isLast ? '    ' : '│   '));
    });
    
    // Print files
    files.forEach((file: string, index: number) => {
      const isLast = index === files.length - 1;
      console.log(`${prefix}${isLast ? '└── ' : '├── '}${file}`);
    });
  }

  private async deleteCommand(filepath: string, options: any): Promise<void> {
    try {
      const backend = await this.getCurrentBackend();
      
      // Confirm deletion unless forced
      if (!options.force) {
        const confirmed = await confirm({
          message: `Are you sure you want to delete ${filepath}?`,
          default: false
        });
        
        if (!confirmed) {
          console.log(chalk.yellow('Deletion cancelled'));
          return;
        }
      }
      
      const spinner = ora('Deleting file...').start();
      const result = await backend.deleteFile(filepath);
      
      if (result.success) {
        spinner.succeed(chalk.green(`File deleted successfully: ${filepath}`));
      } else {
        spinner.fail(`Failed to delete file: ${result.error?.message}`);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async searchCommand(query: string, options: any): Promise<void> {
    const spinner = ora(`Searching for "${query}"...`).start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const searchOptions: SearchOptions = {
        limit: parseInt(options.limit) || 10,
        category: options.category,
        fuzzy: options.fuzzy,
        includeContent: true
      };
      
      // Use appropriate search method based on backend and options
      if (options.semantic && backend.getBackendType() === 'graph') {
        // Graph backend with semantic search
        const graphBackend = backend as any; // Type assertion for graph-specific methods
        if (graphBackend.semanticSearch) {
          const results = await graphBackend.semanticSearch(query, parseInt(options.limit) || 10);
          if (!results.success) {
            spinner.fail(`Search failed: ${results.error?.message}`);
            return;
          }
          
          spinner.succeed(chalk.green(`Found ${results.data.length} results (semantic search)`));
          
          results.data.forEach((result: any, index: number) => {
            console.log(chalk.blue(`\n${index + 1}. ${result.file.path} (similarity: ${result.similarity.toFixed(3)})`));
            console.log(chalk.gray(result.snippet));
          });
        } else {
          spinner.fail('Semantic search not available on current backend');
        }
      } else {
        // Use text search
        const searchResult = await backend.searchContent(query, searchOptions);
        if (!searchResult.success) {
          spinner.fail(`Search failed: ${searchResult.error?.message}`);
          return;
        }
        
        spinner.succeed(chalk.green(`Found ${searchResult.data.length} results`));
        
        searchResult.data.forEach((result, index) => {
          console.log(chalk.blue(`\n${index + 1}. ${result.file.path} (score: ${result.score})`));
          console.log(chalk.gray(result.snippet));
          
          if (result.matches.length > 0) {
            console.log(chalk.yellow('Matches:'));
            result.matches.slice(0, 3).forEach(match => {
              console.log(`  Line ${match.line}: ${match.context}`);
            });
          }
        });
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async statusCommand(): Promise<void> {
    const spinner = ora('Fetching status...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const result = await backend.getStatus();
      
      if (result.success && result.data) {
        spinner.succeed('Status retrieved successfully');
        
        console.log(chalk.blue('\nImplementation Status:'));
        console.log(`Overall Completion: ${chalk.green(result.data.overall_completion + '%')}`);
        console.log(`Critical Issues: ${chalk.red(result.data.critical_issues)}`);
        console.log(`Last Updated: ${result.data.last_updated}`);
        
        const table = new Table({
          head: ['Phase', 'Status', 'Completion', 'Notes'],
          style: { head: ['cyan'] }
        });
        
        result.data.phases.forEach(phase => {
          const status = phase.status === 'completed' ? chalk.green(phase.status) :
                        phase.status === 'in_progress' ? chalk.yellow(phase.status) :
                        chalk.red(phase.status);
          
          table.push([
            phase.name,
            status,
            `${phase.completion}%`,
            phase.notes || ''
          ]);
        });
        
        console.log(table.toString());
      } else {
        spinner.fail(`Failed to get status: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async issuesCommand(options: any): Promise<void> {
    const spinner = ora('Fetching issues...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const result = await backend.getIssues();
      
      if (result.success && result.data) {
        const issues = options.severity 
          ? result.data.filter(i => i.severity === options.severity)
          : result.data;
        
        spinner.succeed(`Found ${issues.length} issues`);
        
        if (issues.length === 0) {
          console.log(chalk.green('No issues found!'));
          return;
        }
        
        const table = new Table({
          head: ['ID', 'Title', 'Severity', 'Category', 'Status'],
          style: { head: ['cyan'] }
        });
        
        issues.forEach(issue => {
          const severity = issue.severity === 'critical' ? chalk.red(issue.severity) :
                          issue.severity === 'high' ? chalk.yellow(issue.severity) :
                          chalk.blue(issue.severity);
          
          table.push([
            issue.id,
            issue.title.substring(0, 40) + (issue.title.length > 40 ? '...' : ''),
            severity,
            issue.category,
            issue.status
          ]);
        });
        
        console.log(table.toString());
      } else {
        spinner.fail(`Failed to get issues: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async exportCommand(output: string): Promise<void> {
    const spinner = ora('Exporting knowledge base...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const result = await backend.exportData();
      
      if (result.success && result.data) {
        await fs.writeFile(output, JSON.stringify(result.data, null, 2));
        spinner.succeed(chalk.green(`Exported to ${output}`));
        console.log(`Total files: ${result.data.files.length}`);
        console.log(`Export size: ${JSON.stringify(result.data).length} bytes`);
      } else {
        spinner.fail(`Failed to export: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async importCommand(input: string, options: any): Promise<void> {
    const spinner = ora('Importing knowledge base...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      
      const data = JSON.parse(await fs.readFile(input, 'utf-8'));
      
      if (!options.force) {
        const confirmed = await confirm({
          message: `Import ${data.files.length} files? This may overwrite existing files.`,
          default: false
        });
        
        if (!confirmed) {
          spinner.fail('Import cancelled');
          return;
        }
      }
      
      const result = await backend.importData(data);
      
      if (result.success) {
        spinner.succeed(chalk.green(`Imported ${data.files.length} files successfully`));
      } else {
        spinner.fail(`Failed to import: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async backendStatusCommand(): Promise<void> {
    const spinner = ora('Checking backend status...').start();
    
    try {
      const backend = await this.getCurrentBackend();
      const manager = await this.getBackendManager();
      const config = manager.getCurrentConfig();
      
      const healthResult = await backend.healthCheck();
      
      spinner.succeed('Backend status retrieved');
      
      console.log(chalk.blue('\nBackend Information:'));
      console.log(`Type: ${chalk.green(backend.getBackendType())}`);
      console.log(`Status: ${healthResult.success && healthResult.data.status === 'healthy' ? chalk.green('Healthy') : chalk.red('Unhealthy')}`);
      
      if (healthResult.success && healthResult.data.details) {
        console.log(chalk.blue('\nDetails:'));
        Object.entries(healthResult.data.details).forEach(([key, value]) => {
          console.log(`${key}: ${JSON.stringify(value)}`);
        });
      }
      
      console.log(chalk.blue('\nConfiguration:'));
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async backendSwitchCommand(type: string): Promise<void> {
    if (type !== 'filesystem' && type !== 'graph') {
      console.error(chalk.red('Invalid backend type. Use "filesystem" or "graph"'));
      return;
    }
    
    const spinner = ora(`Switching to ${type} backend...`).start();
    
    try {
      const manager = await this.getBackendManager();
      const result = await manager.switchBackend(type as 'filesystem' | 'graph');
      
      if (result.success) {
        spinner.succeed(chalk.green(`Successfully switched to ${type} backend`));
        
        // Show new backend status
        const backend = manager.getBackend();
        if (backend) {
          const healthResult = await backend.healthCheck();
          
          if (healthResult.success) {
            console.log(chalk.blue('\nBackend Status:'));
            console.log(`Health: ${healthResult.data.status}`);
            if (healthResult.data.details) {
              Object.entries(healthResult.data.details).forEach(([key, value]) => {
                console.log(`${key}: ${JSON.stringify(value)}`);
              });
            }
          }
        }
      } else {
        spinner.fail(`Failed to switch backend: ${result.error?.message}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async backendConfigCommand(): Promise<void> {
    try {
      const backend = await this.getCurrentBackend();
      const config = backend.getConfiguration();
      
      console.log(chalk.blue('Current Backend Configuration:'));
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async run(): Promise<void> {
    try {
      await this.program.parseAsync(process.argv);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  }
}

// Create and run the CLI
const cli = new BasicCLI();
cli.run().catch(error => {
  console.error(chalk.red(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});