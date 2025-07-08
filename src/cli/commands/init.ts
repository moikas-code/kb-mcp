/**
 * Init Command
 * Initialize a new knowledge base
 */

import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import simpleGit from 'simple-git';
import { ConfigManager } from '../../core/config.js';
import { SecureKBManager } from '../../core/secure-kb-manager.js';
import { EncryptionService } from '../../core/security.js';

export async function initCommand(
  options: any,
  configManager: ConfigManager
): Promise<void> {
  const spinner = ora('Initializing knowledge base').start();
  
  try {
    // Get KB path
    const kbPath = path.resolve(process.cwd(), 'kb');
    
    // Check if already initialized
    const configPath = path.join(process.cwd(), '.kbconfig.yaml');
    if (await fileExists(configPath)) {
      spinner.stop();
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Knowledge base already initialized. Overwrite configuration?',
          default: false,
        },
      ]);
      
      if (!answer.overwrite) {
        console.log(chalk.yellow('Initialization cancelled'));
        return;
      }
      
      spinner.start('Re-initializing knowledge base');
    }
    
    // Get template
    const templates = configManager.getTemplates();
    const templateName = options.template || 'basic';
    const template = templates[templateName];
    
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }
    
    spinner.text = 'Creating configuration';
    
    // Interactive setup for enterprise template
    if (templateName === 'enterprise' || options.interactive) {
      spinner.stop();
      
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'encryption',
          message: 'Enable encryption at rest?',
          default: options.encrypt || templateName === 'enterprise',
        },
        {
          type: 'confirm',
          name: 'mfa',
          message: 'Require multi-factor authentication?',
          default: templateName === 'enterprise',
        },
        {
          type: 'confirm',
          name: 'audit',
          message: 'Enable SOC2 audit logging?',
          default: templateName === 'enterprise',
        },
        {
          type: 'list',
          name: 'storage',
          message: 'Primary storage backend:',
          choices: [
            { name: 'Filesystem (Simple, no setup required)', value: 'filesystem' },
            { name: 'Graph Database (Advanced features, requires FalkorDB)', value: 'graph' },
            { name: 'Amazon S3', value: 's3' },
            { name: 'Google Cloud Storage', value: 'gcs' },
            { name: 'Azure Blob Storage', value: 'azure' }
          ],
          default: 'filesystem',
        },
      ]);
      
      // Apply answers to template
      if (template.storage) {
        template.storage.encryption_at_rest = answers.encryption;
        template.storage.backend = answers.storage;
        template.storage.primary = answers.storage === 'graph' ? 'graph' : answers.storage;
      }
      if (template.security?.authentication) {
        template.security.authentication.mfa_required = answers.mfa;
      }
      if (template.compliance?.audit) {
        template.compliance.audit.enabled = answers.audit;
      }
      
      // Auto-start database for graph backend
      if (answers.storage === 'graph') {
        spinner.stop();
        console.log(chalk.yellow('\n📊 Graph backend selected - setting up database...'));
        
        try {
          const { dbCommand } = await import('./db.js');
          await dbCommand('start', { quiet: true });
          console.log(chalk.green('✓ Database started successfully'));
        } catch (error) {
          console.log(chalk.red('✗ Failed to start database automatically'));
          console.log(chalk.yellow('Run "kb db start" manually after initialization'));
        }
        
        spinner.start('Creating configuration');
      }
      
      spinner.start('Creating configuration');
    }
    
    // Apply CLI options
    if (options.encrypt && template.storage) {
      template.storage.encryption_at_rest = true;
    }
    
    // Generate encryption key if needed
    if (template.storage?.encryption_at_rest || template.compliance?.audit?.encryption_required) {
      if (!template.security) template.security = {};
      if (!template.security.encryption) template.security.encryption = {};
      
      spinner.text = 'Generating encryption keys';
      template.security.encryption.key = EncryptionService.generateToken(32);
      
      console.log(chalk.yellow('\n⚠️  IMPORTANT: Save this encryption key securely!'));
      console.log(chalk.yellow(`   Key: ${template.security.encryption.key}`));
      console.log(chalk.yellow('   You will need it to decrypt your data.\n'));
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'saved',
          message: 'Have you saved the encryption key?',
          default: false,
        },
      ]);
      
      if (!answer.saved) {
        console.log(chalk.red('Initialization cancelled. Please save the key and try again.'));
        return;
      }
    }
    
    // Set storage path
    if (!template.storage) template.storage = {};
    template.storage.path = kbPath;
    
    // Load and merge configuration
    await configManager.load();
    for (const [key, value] of Object.entries(template)) {
      configManager.set(key, value);
    }
    
    // Save configuration
    spinner.text = 'Saving configuration';
    const saveResult = await configManager.save(configPath);
    if (!saveResult.success) {
      throw new Error(saveResult.error.message);
    }
    
    // Initialize KB manager
    spinner.text = 'Creating knowledge base structure';
    const kbManager = new SecureKBManager({
      kbPath,
      encryptionKey: template.security?.encryption?.key,
      enableAudit: template.compliance?.audit?.enabled ?? true,
      enableVersioning: options.git !== false,
      enableEncryption: template.storage?.encryption_at_rest ?? false,
    });
    
    const initResult = await kbManager.initialize();
    if (!initResult.success) {
      throw new Error(initResult.error.message);
    }
    
    // Create default structure
    spinner.text = 'Creating default directories';
    const defaultDirs = [
      'docs',
      'guides',
      'references',
      'notes',
      'archive',
    ];
    
    for (const dir of defaultDirs) {
      await fs.mkdir(path.join(kbPath, dir), { recursive: true });
    }
    
    // Create README
    spinner.text = 'Creating README';
    const readmeContent = `# Knowledge Base

This knowledge base was initialized with the ${templateName} template.

## Structure

- \`docs/\` - Documentation files
- \`guides/\` - How-to guides and tutorials  
- \`references/\` - API references and specifications
- \`notes/\` - Meeting notes and discussions
- \`archive/\` - Archived content

## Configuration

Configuration is stored in \`.kbconfig.yaml\`.

## Usage

\`\`\`bash
# Read a file
kb read docs/example.md

# Create a new file
kb write guides/new-guide.md

# Search content
kb search "keyword"

# List all files
kb list
\`\`\`

## Security

${template.storage?.encryption_at_rest ? '✓ Encryption at rest enabled' : '✗ Encryption at rest disabled'}
${template.security?.authentication?.mfa_required ? '✓ MFA required' : '✗ MFA not required'}
${template.compliance?.audit?.enabled ? '✓ Audit logging enabled' : '✗ Audit logging disabled'}
${options.git !== false ? '✓ Version control enabled' : '✗ Version control disabled'}

---

Generated by KB Manager v1.0.0
`;
    
    await fs.writeFile(path.join(kbPath, 'README.md'), readmeContent);
    
    // Initialize git if enabled
    if (options.git !== false) {
      spinner.text = 'Initializing version control';
      const git = simpleGit(kbPath);
      
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        await git.init();
        await git.add('.');
        await git.commit('Initial knowledge base setup');
      }
    }
    
    // Create .gitignore
    const gitignoreContent = `.audit/
.cache/
*.bak
*.key
*.enc
.DS_Store
Thumbs.db
`;
    
    await fs.writeFile(path.join(kbPath, '.gitignore'), gitignoreContent);
    
    spinner.succeed('Knowledge base initialized successfully');
    
    // Print summary
    console.log('\n' + chalk.bold('Summary:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Path:       ${chalk.cyan(kbPath)}`);
    console.log(`Template:   ${chalk.cyan(templateName)}`);
    console.log(`Config:     ${chalk.cyan(configPath)}`);
    console.log(`Encryption: ${template.storage?.encryption_at_rest ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    console.log(`Audit:      ${template.compliance?.audit?.enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    console.log(`Git:        ${options.git !== false ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    
    console.log('\n' + chalk.bold('Next steps:'));
    console.log(chalk.gray('1.'), 'Create your first file:');
    console.log(chalk.cyan('   kb write docs/welcome.md'));
    console.log(chalk.gray('2.'), 'List contents:');
    console.log(chalk.cyan('   kb list'));
    console.log(chalk.gray('3.'), 'Start MCP server:');
    console.log(chalk.cyan('   kb serve'));
    
  } catch (error) {
    spinner.fail(`Initialization failed: ${error}`);
    process.exit(1);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}