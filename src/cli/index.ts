#!/usr/bin/env node

/**
 * KB Manager CLI
 * Production-ready command-line interface for knowledge base management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SecurityContext } from '../types/index.js';
import { SecureKBManager } from '../core/secure-kb-manager.js';
import { AuthManager } from './auth.js';
import { ConfigManager } from '../core/config.js';
import { 
  initCommand,
  serveCommand,
  updateCommand,
  dbCommand,
} from './commands/index.js';

// Version from package.json
const VERSION = '1.0.0';

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection:'), reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

/**
 * Main CLI application
 */
class KBManagerCLI {
  private program: Command;
  private authManager: AuthManager;
  private configManager: ConfigManager;
  private kbManager?: SecureKBManager;
  private context?: SecurityContext;

  constructor() {
    this.program = new Command();
    this.authManager = new AuthManager();
    this.configManager = new ConfigManager();
    
    this.setupProgram();
    this.setupCommands();
  }

  /**
   * Setup the main program
   */
  private setupProgram(): void {
    this.program
      .name('kb')
      .description('Secure, SOC2-compliant knowledge base management')
      .version(VERSION)
      .option('-c, --config <path>', 'Path to config file', '.kbconfig.yaml')
      .option('-d, --debug', 'Enable debug logging')
      .option('--no-color', 'Disable colored output')
      .hook('preAction', async (thisCommand) => {
        // Load configuration
        await this.loadConfiguration(thisCommand.opts());
        
        // Initialize KB manager if not serving
        if (thisCommand.name() !== 'serve') {
          await this.initializeKBManager();
        }
        
        // Authenticate user for protected commands
        const protectedCommands = ['write', 'delete', 'audit', 'backup', 'restore', 'config'];
        if (protectedCommands.includes(thisCommand.name() || '')) {
          await this.authenticate();
        }
      });
  }

  /**
   * Setup all commands
   */
  private setupCommands(): void {
    // Initialize KB
    this.program
      .command('init')
      .description('Initialize a new knowledge base')
      .option('-t, --template <name>', 'Use a template (basic, enterprise)', 'basic')
      .option('-e, --encrypt', 'Enable encryption at rest')
      .option('-g, --git', 'Initialize with git versioning', true)
      .action(async (options) => {
        await initCommand(options, this.configManager);
      });

    // Read file
    this.program
      .command('read <path>')
      .alias('cat')
      .description('Read a knowledge base file')
      .option('-d, --decrypt', 'Decrypt encrypted content')
      .option('-m, --metadata', 'Show metadata only')
      .action(async (filePath, options) => {
        await this.readCommand(filePath, options);
      });

    // Write/Update file
    this.program
      .command('write <path>')
      .alias('create')
      .alias('update')
      .description('Create or update a knowledge base file')
      .option('-c, --content <text>', 'Content to write')
      .option('-f, --file <path>', 'Read content from file')
      .option('-t, --template <name>', 'Use a template')
      .option('-e, --encrypt', 'Encrypt the file')
      .option('-i, --interactive', 'Interactive mode')
      .action(async (filePath, options) => {
        await this.writeCommand(filePath, options);
      });

    // Delete file
    this.program
      .command('delete <path>')
      .alias('rm')
      .description('Delete a knowledge base file')
      .option('-f, --force', 'Skip confirmation')
      .option('--no-backup', 'Do not create backup')
      .action(async (filePath, options) => {
        await this.deleteCommand(filePath, options);
      });

    // List directory
    this.program
      .command('list [directory]')
      .alias('ls')
      .description('List knowledge base contents')
      .option('-r, --recursive', 'List recursively')
      .option('-l, --long', 'Long format with details')
      .option('-a, --all', 'Show hidden files')
      .action(async (directory, options) => {
        await this.listCommand(directory || '', options);
      });

    // Search
    this.program
      .command('search <query>')
      .alias('find')
      .description('Search knowledge base content')
      .option('-d, --directory <path>', 'Search in specific directory')
      .option('-i, --case-insensitive', 'Case insensitive search', true)
      .option('-l, --limit <number>', 'Maximum results', '100')
      .option('-c, --context <lines>', 'Context lines to show', '2')
      .action(async (query, options) => {
        await this.searchCommand(query, options);
      });

    // Serve as MCP server
    this.program
      .command('serve')
      .description('Start as MCP server')
      .option('-p, --port <number>', 'Port to listen on', '3000')
      .option('--stdio', 'Use stdio transport (default)')
      .option('--websocket', 'Use WebSocket transport')
      .option('--tls', 'Enable TLS')
      .option('--cert <path>', 'TLS certificate path')
      .option('--key <path>', 'TLS key path')
      .action(async (options) => {
        await serveCommand(options, this.configManager);
      });

    // Audit commands
    this.program
      .command('audit <action>')
      .description('Audit log management (query, export, verify)')
      .option('-f, --from <date>', 'Start date (ISO 8601)')
      .option('-t, --to <date>', 'End date (ISO 8601)')
      .option('-u, --user <id>', 'Filter by user')
      .option('-e, --event <type>', 'Filter by event type')
      .option('--format <type>', 'Export format (json, csv)', 'json')
      .option('-o, --output <file>', 'Output file')
      .action(async (action, options) => {
        await this.auditCommand(action, options);
      });

    // Configuration management
    this.program
      .command('config <action> [key] [value]')
      .description('Manage configuration (get, set, list)')
      .option('-g, --global', 'Use global config')
      .option('-s, --secure', 'Encrypt sensitive values')
      .action(async (action, key, value, options) => {
        await this.configCommand(action, key, value, options);
      });

    // Backup
    this.program
      .command('backup')
      .description('Create a backup of the knowledge base')
      .option('-o, --output <path>', 'Backup file path')
      .option('-e, --encrypt', 'Encrypt backup')
      .option('-i, --incremental', 'Incremental backup')
      .option('--compress', 'Compress backup', true)
      .action(async (options) => {
        await this.backupCommand(options);
      });

    // Restore
    this.program
      .command('restore <backup>')
      .description('Restore from backup')
      .option('-t, --target <path>', 'Restore to specific path')
      .option('-f, --force', 'Overwrite existing files')
      .option('--verify', 'Verify backup integrity first', true)
      .action(async (backupPath, options) => {
        await this.restoreCommand(backupPath, options);
      });

    // Export
    this.program
      .command('export')
      .description('Export knowledge base')
      .option('-f, --format <type>', 'Export format (json, yaml, markdown)', 'json')
      .option('-o, --output <path>', 'Output file')
      .option('-e, --encrypt', 'Encrypt export')
      .option('--include-audit', 'Include audit logs')
      .action(async (options) => {
        await this.exportCommand(options);
      });

    // Import
    this.program
      .command('import <file>')
      .description('Import knowledge base')
      .option('-f, --format <type>', 'Import format (json, yaml, markdown)')
      .option('--merge', 'Merge with existing content')
      .option('--validate', 'Validate before import', true)
      .action(async (file, options) => {
        await this.importCommand(file, options);
      });

    // Authentication
    this.program
      .command('auth <action>')
      .description('Authentication management (login, logout, status)')
      .option('-u, --username <name>', 'Username')
      .option('-p, --password <pass>', 'Password (not recommended)')
      .option('--mfa <code>', 'MFA code')
      .option('--api-key', 'Use API key authentication')
      .action(async (action, options) => {
        await this.handleAuth(action, options);
      });

    // Update command
    this.program
      .command('update <action>')
      .description('Self-update management (check, install, config)')
      .option('-y, --yes', 'Skip confirmation prompts')
      .option('--channel <name>', 'Update channel (stable, beta, alpha)', 'stable')
      .option('--prerelease', 'Include pre-release versions')
      .option('--show', 'Show current update configuration')
      .option('--enable <bool>', 'Enable/disable auto-updates')
      .option('--interval <hours>', 'Update check interval in hours')
      .action(async (action, options) => {
        await updateCommand(action, options);
      });

    // Database management
    this.program
      .command('db <action>')
      .description('Database management (start, stop, status, reset, logs)')
      .option('--no-start', 'Don\'t auto-start after reset')
      .option('-f, --follow', 'Follow log output')
      .option('--tail <lines>', 'Number of log lines to show', '100')
      .option('--service <name>', 'Show logs for specific service (falkordb, redis)')
      .action(async (action, options) => {
        await dbCommand(action, options);
      });

    // Version command
    this.program
      .command('version')
      .description('Show version information')
      .action(() => {
        console.log(`KB-MCP version ${VERSION}`);
        console.log(`Node.js ${process.version}`);
        console.log(`Platform: ${process.platform} ${process.arch}`);
      });
  }

  /**
   * Load configuration
   */
  private async loadConfiguration(options: any): Promise<void> {
    const spinner = ora('Loading configuration').start();
    
    try {
      // Load from file or defaults
      await this.configManager.load(options.config);
      
      // Apply CLI options
      if (options.debug) {
        this.configManager.set('logging.level', 'debug');
      }
      
      spinner.succeed('Configuration loaded');
    } catch (error) {
      spinner.fail(`Failed to load configuration: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Initialize KB manager
   */
  private async initializeKBManager(): Promise<void> {
    const config = this.configManager.getConfig();
    const kbPath = config.storage?.path || path.join(process.cwd(), 'kb');
    
    this.kbManager = new SecureKBManager({
      kbPath,
      encryptionKey: config.security?.encryption?.key,
      enableAudit: config.compliance?.audit?.enabled ?? true,
      enableVersioning: config.storage?.versioning ?? true,
      enableEncryption: config.storage?.encryption_at_rest ?? false,
      rateLimiting: config.security?.rate_limiting,
    });
    
    // Initialize if needed
    const initialized = await this.kbManager.initialize();
    if (!initialized.success) {
      console.error(chalk.red('Failed to initialize KB manager:'), initialized.error);
      process.exit(1);
    }
  }

  /**
   * Authenticate user
   */
  private async authenticate(): Promise<void> {
    const spinner = ora('Authenticating').start();
    
    try {
      // Check for existing session
      const session = await this.authManager.getSession();
      if (session && !session.expired) {
        this.context = session.context;
        spinner.succeed('Authenticated');
        return;
      }
      
      // Prompt for credentials
      spinner.stop();
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: 'Username:',
          validate: (input) => input.length > 0,
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
          validate: (input) => input.length > 0,
        },
      ]);
      
      // Check if MFA is required
      const config = this.configManager.getConfig();
      if (config.security?.authentication?.mfa_required) {
        const mfaAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'mfaCode',
            message: 'MFA Code:',
            validate: (input) => /^\d{6}$/.test(input),
          },
        ]);
        answers.mfaCode = mfaAnswer.mfaCode;
      }
      
      spinner.start('Authenticating');
      
      // Authenticate
      const result = await this.authManager.authenticate(
        answers.username,
        answers.password,
        answers.mfaCode
      );
      
      if (!result.success) {
        spinner.fail('Authentication failed');
        process.exit(1);
      }
      
      this.context = result.context;
      spinner.succeed('Authenticated successfully');
    } catch (error) {
      spinner.fail(`Authentication error: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Handle auth command
   */
  private async handleAuth(action: string, options: any): Promise<void> {
    switch (action) {
      case 'login':
        await this.authManager.login(options);
        break;
      
      case 'logout':
        await this.authManager.logout();
        console.log(chalk.green('Logged out successfully'));
        break;
      
      case 'status':
        const session = await this.authManager.getSession();
        if (session && !session.expired) {
          console.log(chalk.green('Authenticated as:'), session.context.user_id);
          console.log(chalk.gray('Session expires:'), new Date(session.expiresAt));
        } else {
          console.log(chalk.yellow('Not authenticated'));
        }
        break;
      
      default:
        console.error(chalk.red(`Unknown auth action: ${action}`));
        process.exit(1);
    }
  }

  /**
   * Read command implementation
   */
  private async readCommand(filePath: string, options: any): Promise<void> {
    const spinner = ora(`Reading ${filePath}`).start();
    try {
      const result = await this.kbManager!.readFile(filePath);
      spinner.stop();
      
      if (!result.success) {
        console.error(chalk.red('Error:'), result.error);
        return;
      }
      
      if (options.metadata) {
        console.log(chalk.blue('Metadata:'), JSON.stringify(result.data.metadata, null, 2));
      } else {
        console.log(result.data.content);
      }
    } catch (error) {
      spinner.fail(`Failed to read ${filePath}: ${error}`);
    }
  }

  /**
   * Write command implementation
   */
  private async writeCommand(filePath: string, options: any): Promise<void> {
    let content = '';
    
    if (options.content) {
      content = options.content;
    } else if (options.file) {
      const contentBuffer = await fs.readFile(options.file);
      content = contentBuffer.toString();
    } else if (options.interactive) {
      const answer = await inquirer.prompt([{
        type: 'editor',
        name: 'content',
        message: 'Enter content:'
      }]);
      content = answer.content;
    } else {
      console.error(chalk.red('Error: Must provide content via --content, --file, or --interactive'));
      return;
    }
    
    const spinner = ora(`Writing ${filePath}`).start();
    try {
      const result = await this.kbManager!.writeFile(filePath, content);
      if (result.success) {
        spinner.succeed(`File ${filePath} written successfully`);
      } else {
        spinner.fail(`Failed to write ${filePath}: ${result.error}`);
      }
    } catch (error) {
      spinner.fail(`Failed to write ${filePath}: ${error}`);
    }
  }

  /**
   * Delete command implementation
   */
  private async deleteCommand(filePath: string, options: any): Promise<void> {
    if (!options.force) {
      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete ${filePath}?`,
        default: false
      }]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Delete cancelled'));
        return;
      }
    }
    
    const spinner = ora(`Deleting ${filePath}`).start();
    try {
      const result = await this.kbManager!.deleteFile(filePath);
      if (result.success) {
        spinner.succeed(`File ${filePath} deleted successfully`);
      } else {
        spinner.fail(`Failed to delete ${filePath}: ${result.error}`);
      }
    } catch (error) {
      spinner.fail(`Failed to delete ${filePath}: ${error}`);
    }
  }

  /**
   * List command implementation
   */
  private async listCommand(directory: string, options: any): Promise<void> {
    const spinner = ora(`Listing ${directory || 'root'}`).start();
    try {
      const result = await this.kbManager!.listFiles(directory);
      spinner.stop();
      
      if (!result.success) {
        console.error(chalk.red('Error:'), result.error);
        return;
      }
      
      console.log(chalk.blue(`\nContents of ${directory || 'root'}:`));
      result.data.files.forEach((file: any) => {
        if (options.long) {
          console.log(`${file.path.padEnd(30)} ${file.size.toString().padStart(10)} ${file.modified}`);
        } else {
          console.log(file.path);
        }
      });
      
      console.log(chalk.gray(`\nTotal: ${result.data.total_files} files`));
    } catch (error) {
      spinner.fail(`Failed to list ${directory}: ${error}`);
    }
  }

  /**
   * Search command implementation
   */
  private async searchCommand(query: string, options: any): Promise<void> {
    const spinner = ora(`Searching for "${query}"`).start();
    try {
      const result = await this.kbManager!.searchContent(query, {
        limit: parseInt(options.limit),
        category: options.category,
        includeContent: true
      });
      spinner.stop();
      
      if (!result.success) {
        console.error(chalk.red('Error:'), result.error);
        return;
      }
      
      console.log(chalk.blue(`\nSearch results for "${query}":`));
      result.data.forEach((item: any, index: number) => {
        console.log(`\n${index + 1}. ${chalk.yellow(item.file.path)} (score: ${item.score})`);
        if (item.snippet) {
          console.log(chalk.gray(item.snippet));
        }
      });
      
      console.log(chalk.gray(`\nTotal: ${result.data.length} results`));
    } catch (error) {
      spinner.fail(`Search failed: ${error}`);
    }
  }

  /**
   * Audit command implementation
   */
  private async auditCommand(action: string, options: any): Promise<void> {
    console.log(chalk.yellow(`Audit ${action} not implemented yet`));
  }

  /**
   * Config command implementation
   */
  private async configCommand(action: string, key: string, value: string, options: any): Promise<void> {
    switch (action) {
      case 'get':
        if (key) {
          const val = this.configManager.get(key);
          console.log(val);
        } else {
          console.log(JSON.stringify(this.configManager.getConfig(), null, 2));
        }
        break;
      
      case 'set':
        if (!key || value === undefined) {
          console.error(chalk.red('Error: key and value are required for set'));
          return;
        }
        this.configManager.set(key, value);
        await this.configManager.save();
        console.log(chalk.green(`Set ${key} = ${value}`));
        break;
      
      case 'list':
        console.log(JSON.stringify(this.configManager.getConfig(), null, 2));
        break;
      
      default:
        console.error(chalk.red(`Unknown config action: ${action}`));
    }
  }

  /**
   * Backup command implementation
   */
  private async backupCommand(options: any): Promise<void> {
    console.log(chalk.yellow('Backup command not implemented yet'));
  }

  /**
   * Restore command implementation
   */
  private async restoreCommand(backupPath: string, options: any): Promise<void> {
    console.log(chalk.yellow('Restore command not implemented yet'));
  }

  /**
   * Export command implementation
   */
  private async exportCommand(options: any): Promise<void> {
    console.log(chalk.yellow('Export command not implemented yet'));
  }

  /**
   * Import command implementation
   */
  private async importCommand(file: string, options: any): Promise<void> {
    console.log(chalk.yellow('Import command not implemented yet'));
  }

  /**
   * Run the CLI
   */
  async run(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
}

// Run the CLI
const cli = new KBManagerCLI();
cli.run().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});