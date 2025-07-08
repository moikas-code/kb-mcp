#!/usr/bin/env node

/**
 * Standalone KB-MCP CLI
 * Minimal version for initial release
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get version from package.json
const packageJson = JSON.parse(
  await fs.readFile(path.join(__dirname, '../../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

interface KBEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

class StandaloneKBCLI {
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
      .version(VERSION);
  }

  private setupCommands(): void {
    // Initialize command
    this.program
      .command('init')
      .description('Initialize a new knowledge base')
      .action(async () => {
        await this.initKB();
      });

    // Write command
    this.program
      .command('write <title>')
      .description('Create a new knowledge base entry')
      .option('-c, --content <content>', 'Entry content')
      .option('-t, --tags <tags>', 'Comma-separated tags')
      .action(async (title: string, options: any) => {
        await this.writeEntry(title, options);
      });

    // Read command
    this.program
      .command('read [id]')
      .description('Read a knowledge base entry')
      .action(async (id?: string) => {
        await this.readEntry(id);
      });

    // List command
    this.program
      .command('list')
      .description('List all knowledge base entries')
      .option('-t, --tags <tags>', 'Filter by tags')
      .action(async (options: any) => {
        await this.listEntries(options);
      });

    // Search command
    this.program
      .command('search <query>')
      .description('Search knowledge base entries')
      .action(async (query: string) => {
        await this.searchEntries(query);
      });

    // Delete command
    this.program
      .command('delete <id>')
      .description('Delete a knowledge base entry')
      .action(async (id: string) => {
        await this.deleteEntry(id);
      });

    // Status command
    this.program
      .command('status')
      .description('Show knowledge base status')
      .action(async () => {
        await this.showStatus();
      });

    // Update commands
    this.program
      .command('update')
      .description('Update management')
      .addCommand(
        new Command('check')
          .description('Check for updates')
          .action(async () => {
            console.log(chalk.blue('Update checking functionality will be available in future releases.'));
            console.log(chalk.gray('Current version:'), chalk.green(VERSION));
          })
      );
  }

  private async initKB(): Promise<void> {
    const spinner = ora('Initializing knowledge base...').start();

    try {
      await fs.mkdir(this.kbPath, { recursive: true });
      await fs.mkdir(path.join(this.kbPath, 'entries'), { recursive: true });
      
      const config = {
        version: VERSION,
        created_at: new Date().toISOString(),
        backend: 'filesystem'
      };
      
      await fs.writeFile(
        path.join(this.kbPath, 'config.json'),
        JSON.stringify(config, null, 2)
      );

      spinner.succeed('Knowledge base initialized successfully!');
      console.log(chalk.gray('Location:'), this.kbPath);
    } catch (error) {
      spinner.fail(`Failed to initialize knowledge base: ${error}`);
    }
  }

  private async writeEntry(title: string, options: any): Promise<void> {
    const spinner = ora('Creating entry...').start();

    try {
      await this.ensureKBExists();

      const id = this.generateId();
      const entry: KBEntry = {
        id,
        title,
        content: options.content || '',
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const entryPath = path.join(this.kbPath, 'entries', `${id}.json`);
      await fs.writeFile(entryPath, JSON.stringify(entry, null, 2));

      spinner.succeed('Entry created successfully!');
      console.log(chalk.gray('ID:'), chalk.cyan(id));
      console.log(chalk.gray('Title:'), title);
    } catch (error) {
      spinner.fail(`Failed to create entry: ${error}`);
    }
  }

  private async readEntry(id?: string): Promise<void> {
    try {
      await this.ensureKBExists();

      if (!id) {
        console.log(chalk.yellow('Please provide an entry ID'));
        return;
      }

      const entryPath = path.join(this.kbPath, 'entries', `${id}.json`);
      
      try {
        const entryData = await fs.readFile(entryPath, 'utf-8');
        const entry: KBEntry = JSON.parse(entryData);

        console.log(chalk.bold.blue(`📝 ${entry.title}`));
        console.log(chalk.gray('ID:'), entry.id);
        console.log(chalk.gray('Created:'), new Date(entry.created_at).toLocaleDateString());
        console.log(chalk.gray('Updated:'), new Date(entry.updated_at).toLocaleDateString());
        
        if (entry.tags.length > 0) {
          console.log(chalk.gray('Tags:'), entry.tags.map(tag => chalk.cyan(`#${tag}`)).join(' '));
        }
        
        console.log('\n' + entry.content);
      } catch (error) {
        console.log(chalk.red(`Entry '${id}' not found`));
      }
    } catch (error) {
      console.log(chalk.red(`Error reading entry: ${error}`));
    }
  }

  private async listEntries(options: any): Promise<void> {
    try {
      await this.ensureKBExists();

      const entriesDir = path.join(this.kbPath, 'entries');
      const files = await fs.readdir(entriesDir);
      const entries: KBEntry[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const entryData = await fs.readFile(path.join(entriesDir, file), 'utf-8');
          entries.push(JSON.parse(entryData));
        }
      }

      let filteredEntries = entries;
      if (options.tags) {
        const filterTags = options.tags.split(',').map((t: string) => t.trim());
        filteredEntries = entries.filter(entry => 
          filterTags.some(tag => entry.tags.includes(tag))
        );
      }

      if (filteredEntries.length === 0) {
        console.log(chalk.yellow('No entries found'));
        return;
      }

      console.log(chalk.bold(`📚 Found ${filteredEntries.length} entries:\n`));

      filteredEntries
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .forEach(entry => {
          console.log(chalk.cyan(entry.id), chalk.bold(entry.title));
          if (entry.tags.length > 0) {
            console.log('  ' + entry.tags.map(tag => chalk.gray(`#${tag}`)).join(' '));
          }
          console.log('  ' + chalk.gray(new Date(entry.updated_at).toLocaleDateString()));
          console.log();
        });
    } catch (error) {
      console.log(chalk.red(`Error listing entries: ${error}`));
    }
  }

  private async searchEntries(query: string): Promise<void> {
    try {
      await this.ensureKBExists();

      const entriesDir = path.join(this.kbPath, 'entries');
      const files = await fs.readdir(entriesDir);
      const results: KBEntry[] = [];

      const searchTerm = query.toLowerCase();

      for (const file of files) {
        if (file.endsWith('.json')) {
          const entryData = await fs.readFile(path.join(entriesDir, file), 'utf-8');
          const entry: KBEntry = JSON.parse(entryData);
          
          if (
            entry.title.toLowerCase().includes(searchTerm) ||
            entry.content.toLowerCase().includes(searchTerm) ||
            entry.tags.some(tag => tag.toLowerCase().includes(searchTerm))
          ) {
            results.push(entry);
          }
        }
      }

      if (results.length === 0) {
        console.log(chalk.yellow(`No results found for "${query}"`));
        return;
      }

      console.log(chalk.bold(`🔍 Found ${results.length} results for "${query}":\n`));

      results.forEach(entry => {
        console.log(chalk.cyan(entry.id), chalk.bold(entry.title));
        if (entry.tags.length > 0) {
          console.log('  ' + entry.tags.map(tag => chalk.gray(`#${tag}`)).join(' '));
        }
        console.log('  ' + chalk.gray(new Date(entry.updated_at).toLocaleDateString()));
        console.log();
      });
    } catch (error) {
      console.log(chalk.red(`Error searching entries: ${error}`));
    }
  }

  private async deleteEntry(id: string): Promise<void> {
    const spinner = ora('Deleting entry...').start();

    try {
      await this.ensureKBExists();

      const entryPath = path.join(this.kbPath, 'entries', `${id}.json`);
      
      try {
        await fs.unlink(entryPath);
        spinner.succeed('Entry deleted successfully!');
      } catch (error) {
        spinner.fail(`Entry '${id}' not found`);
      }
    } catch (error) {
      spinner.fail(`Error deleting entry: ${error}`);
    }
  }

  private async showStatus(): Promise<void> {
    try {
      await this.ensureKBExists();

      const configPath = path.join(this.kbPath, 'config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

      const entriesDir = path.join(this.kbPath, 'entries');
      const files = await fs.readdir(entriesDir);
      const entryCount = files.filter(f => f.endsWith('.json')).length;

      console.log(chalk.bold('📊 Knowledge Base Status\n'));
      console.log(chalk.gray('Location:'), this.kbPath);
      console.log(chalk.gray('Version:'), config.version);
      console.log(chalk.gray('Backend:'), config.backend);
      console.log(chalk.gray('Created:'), new Date(config.created_at).toLocaleDateString());
      console.log(chalk.gray('Entries:'), chalk.cyan(entryCount.toString()));

      if (entryCount > 0) {
        const latestFile = files
          .filter(f => f.endsWith('.json'))
          .map(f => ({ name: f, time: require('fs').statSync(path.join(entriesDir, f)).mtime }))
          .sort((a, b) => b.time.getTime() - a.time.getTime())[0];

        console.log(chalk.gray('Last updated:'), new Date(latestFile.time).toLocaleDateString());
      }
    } catch (error) {
      console.log(chalk.red(`Error showing status: ${error}`));
    }
  }

  private async ensureKBExists(): Promise<void> {
    const configPath = path.join(this.kbPath, 'config.json');
    
    try {
      await fs.access(configPath);
    } catch (error) {
      throw new Error('Knowledge base not found. Run "kb init" first.');
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async run(): Promise<void> {
    await this.program.parseAsync();
  }
}

// Run the CLI
const cli = new StandaloneKBCLI();
cli.run().catch(error => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});