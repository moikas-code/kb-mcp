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
import { SecurityContext } from '@types/index.js';
import { SecureKBManager } from '@core/secure-kb-manager.js';
import { AuthManager } from './auth.js';
import { ConfigManager } from '@core/config.js';
import { 
  initCommand,
  readCommand,
  writeCommand,
  deleteCommand,
  listCommand,
  searchCommand,
  serveCommand,
  auditCommand,
  configCommand,
  backupCommand,
  restoreCommand,
  exportCommand,
  importCommand,
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
        await readCommand(filePath, options, this.kbManager!, this.context!);
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
        await writeCommand(filePath, options, this.kbManager!, this.context!);
      });

    // Delete file
    this.program
      .command('delete <path>')
      .alias('rm')
      .description('Delete a knowledge base file')
      .option('-f, --force', 'Skip confirmation')
      .option('--no-backup', 'Do not create backup')
      .action(async (filePath, options) => {
        await deleteCommand(filePath, options, this.kbManager!, this.context!);
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
        await listCommand(directory || '', options, this.kbManager!, this.context!);
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
        await searchCommand(query, options, this.kbManager!, this.context!);
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
        await auditCommand(action, options, this.kbManager!, this.context!);
      });

    // Configuration management
    this.program
      .command('config <action> [key] [value]')
      .description('Manage configuration (get, set, list)')
      .option('-g, --global', 'Use global config')
      .option('-s, --secure', 'Encrypt sensitive values')
      .action(async (action, key, value, options) => {
        await configCommand(action, key, value, options, this.configManager);
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
        await backupCommand(options, this.kbManager!, this.context!);
      });

    // Restore
    this.program
      .command('restore <backup>')
      .description('Restore from backup')
      .option('-t, --target <path>', 'Restore to specific path')
      .option('-f, --force', 'Overwrite existing files')
      .option('--verify', 'Verify backup integrity first', true)
      .action(async (backupPath, options) => {
        await restoreCommand(backupPath, options, this.kbManager!, this.context!);
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
        await exportCommand(options, this.kbManager!, this.context!);
      });

    // Import
    this.program
      .command('import <file>')
      .description('Import knowledge base')
      .option('-f, --format <type>', 'Import format (json, yaml, markdown)')
      .option('--merge', 'Merge with existing content')
      .option('--validate', 'Validate before import', true)
      .action(async (file, options) => {
        await importCommand(file, options, this.kbManager!, this.context!);
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