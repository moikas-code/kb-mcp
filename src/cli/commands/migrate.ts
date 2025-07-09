/**
 * Migrate Command
 * CLI command for migrating from file-based KB to graph-based KB
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { FileToGraphMigrator, MigrationConfig } from '../../migration/file-to-graph.js';
import { UnifiedMemoryConfig } from '../../graph/index.js';

export const migrateCommand = new Command('migrate')
  .description('Migrate from file-based KB to graph-based KB')
  .requiredOption('-s, --source <path>', 'Source project path containing KB files')
  .option('-h, --host <host>', 'FalkorDB host', 'localhost')
  .option('-p, --port <port>', 'FalkorDB port', '6379')
  .option('--password <password>', 'FalkorDB password')
  .option('-g, --graph <name>', 'Graph name', 'knowledge_graph')
  .option('-b, --batch-size <size>', 'Batch size for processing', '10')
  .option('--no-relationships', 'Skip creating relationships between nodes')
  .option('--no-entities', 'Skip extracting entities')
  .option('--no-embeddings', 'Skip generating embeddings')
  .option('--dry-run', 'Run migration without actually creating nodes')
  .option('--config <file>', 'Configuration file path')
  .action(async (options) => {
    const spinner = ora('Preparing migration...').start();
    
    try {
      // Load configuration
      const config = await loadConfig(options);
      
      // Create migrator
      const migrator = new FileToGraphMigrator(config);
      
      spinner.text = 'Starting migration...';
      
      // Run migration
      const result = await migrator.migrate();
      
      if (result.success) {
        spinner.succeed('Migration completed successfully!');
        
        // Display stats
        const stats = result.data;
        console.log('\n' + chalk.bold('Migration Statistics:'));
        console.log(chalk.green(`✓ Total files: ${stats.total_files}`));
        console.log(chalk.green(`✓ Processed files: ${stats.processed_files}`));
        console.log(chalk.green(`✓ Total nodes: ${stats.total_nodes}`));
        console.log(chalk.green(`✓ Total edges: ${stats.total_edges}`));
        console.log(chalk.blue(`ℹ Processing time: ${stats.processing_time_ms}ms`));
        
        if (stats.failed_files > 0) {
          console.log(chalk.yellow(`⚠ Failed files: ${stats.failed_files}`));
          
          if (stats.errors.length > 0) {
            console.log('\n' + chalk.bold('Errors:'));
            stats.errors.forEach((error: any) => {
              console.log(chalk.red(`  • ${error}`));
            });
          }
        }
      } else {
        spinner.fail('Migration failed');
        console.error(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Migration failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

/**
 * Load configuration from options and config file
 */
async function loadConfig(options: any): Promise<MigrationConfig> {
  let config: Partial<MigrationConfig> = {};
  
  // Load from config file if provided
  if (options.config) {
    try {
      const configData = await fs.readFile(options.config, 'utf-8');
      config = JSON.parse(configData);
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load config file: ${error}`));
    }
  }
  
  // Build graph configuration
  const graphConfig: UnifiedMemoryConfig = {
    host: options.host,
    port: parseInt(options.port || options.connection?.port || 3000),
    password: options.password,
    graph_name: options.graph,
    embedding_model: config.graph_config?.embedding_model || 'Xenova/all-MiniLM-L6-v2',
    enable_auto_consolidation: config.graph_config?.enable_auto_consolidation ?? true,
    consolidation_threshold: config.graph_config?.consolidation_threshold || 5,
    contradiction_detection: config.graph_config?.contradiction_detection ?? true,
    insight_generation: config.graph_config?.insight_generation ?? true,
  };
  
  // Build migration configuration
  const migrationConfig: MigrationConfig = {
    source_path: options.source,
    graph_config: graphConfig,
    batch_size: parseInt(options.batchSize),
    create_relationships: !options.noRelationships,
    extract_entities: !options.noEntities,
    generate_embeddings: !options.noEmbeddings,
    dry_run: options.dryRun,
    ...config,
  };
  
  return migrationConfig;
}

/**
 * Generate sample configuration file
 */
export const generateMigrationConfig = new Command('generate-migration-config')
  .description('Generate a sample migration configuration file')
  .option('-o, --output <file>', 'Output file path', 'migration-config.json')
  .action(async (options) => {
    const sampleConfig: MigrationConfig = {
      source_path: './path/to/source/project',
      graph_config: {
        host: 'localhost',
        port: 6379,
        graph_name: 'knowledge_graph',
        embedding_model: 'Xenova/all-MiniLM-L6-v2',
        enable_auto_consolidation: true,
        consolidation_threshold: 5,
        contradiction_detection: true,
        insight_generation: true,
      },
      batch_size: 10,
      create_relationships: true,
      extract_entities: true,
      generate_embeddings: true,
      dry_run: false,
    };
    
    try {
      await fs.writeFile(options.output, JSON.stringify(sampleConfig, null, 2));
      console.log(chalk.green(`✓ Sample configuration written to ${options.output}`));
    } catch (error) {
      console.error(chalk.red(`Failed to write config file: ${error}`));
      process.exit(1);
    }
  });

/**
 * Validate migration setup
 */
export const validateMigration = new Command('validate-migration')
  .description('Validate migration setup and requirements')
  .requiredOption('-s, --source <path>', 'Source project path')
  .option('-h, --host <host>', 'FalkorDB host', 'localhost')
  .option('-p, --port <port>', 'FalkorDB port', '6379')
  .option('--password <password>', 'FalkorDB password')
  .action(async (options) => {
    const spinner = ora('Validating migration setup...').start();
    
    try {
      // Check source directory
      const sourcePath = path.resolve(options.source);
      const kbPath = path.join(sourcePath, 'kb');
      
      try {
        await fs.access(sourcePath);
        spinner.text = 'Source directory found';
      } catch {
        spinner.fail('Source directory not found');
        process.exit(1);
      }
      
      try {
        await fs.access(kbPath);
        spinner.text = 'KB directory found';
      } catch {
        spinner.fail('KB directory not found in source');
        process.exit(1);
      }
      
      // Count files
      const glob = await import('glob');
      const files = await glob.glob(path.join(kbPath, '**/*.md'));
      spinner.text = `Found ${files.length} markdown files`;
      
      // Test FalkorDB connection
      spinner.text = 'Testing FalkorDB connection...';
      
      try {
        const FalkorDB = await import('falkordb');
        const client = new FalkorDB.FalkorDB({
          socket: {
            host: options.host,
            port: parseInt(options.port || '6379')
          },
          password: options.password
        });
        
        // Test connection by selecting graph
        const graph = client.selectGraph(options.graph || 'knowledge_graph');
        await graph.query('RETURN 1'); // Simple test query
        await client.close();
        
        spinner.succeed('Migration setup validated successfully!');
        
        console.log('\n' + chalk.bold('Validation Results:'));
        console.log(chalk.green(`✓ Source directory: ${sourcePath}`));
        console.log(chalk.green(`✓ KB directory: ${kbPath}`));
        console.log(chalk.green(`✓ Markdown files: ${files.length}`));
        console.log(chalk.green(`✓ FalkorDB connection: ${options.host}:${options.port || '6379'}`));
        
        if (files.length === 0) {
          console.log(chalk.yellow('⚠ No markdown files found to migrate'));
        }
      } catch (error) {
        spinner.fail('FalkorDB connection failed');
        console.error(chalk.red(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

/**
 * Preview migration
 */
export const previewMigration = new Command('preview-migration')
  .description('Preview what would be migrated without making changes')
  .requiredOption('-s, --source <path>', 'Source project path')
  .option('-l, --limit <number>', 'Limit number of files to preview', '10')
  .action(async (options) => {
    const spinner = ora('Analyzing files for migration preview...').start();
    
    try {
      const sourcePath = path.resolve(options.source);
      const kbPath = path.join(sourcePath, 'kb');
      
      // Get all markdown files
      const glob = await import('glob');
      const files = await glob.glob(path.join(kbPath, '**/*.md'));
      
      spinner.succeed(`Found ${files.length} files to analyze`);
      
      const limit = parseInt(options.limit);
      const previewFiles = files.slice(0, limit);
      
      console.log('\n' + chalk.bold('Migration Preview:'));
      console.log(chalk.blue(`Showing ${previewFiles.length} of ${files.length} files\n`));
      
      for (const file of previewFiles) {
        const relativePath = path.relative(kbPath, file);
        const content = await fs.readFile(file, 'utf-8');
        
        // Analyze content
        const lines = content.split('\n');
        const headings = lines.filter(line => line.trim().match(/^#+\s/)).length;
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
        
        console.log(chalk.cyan(`📄 ${relativePath}`));
        console.log(`   Size: ${Math.round(content.length / 1024)}KB`);
        console.log(`   Headings: ${headings}`);
        console.log(`   Sentences: ${sentences}`);
        console.log(`   → Will create: Document node + ${headings} concept nodes + extracted entities`);
        console.log();
      }
      
      if (files.length > limit) {
        console.log(chalk.yellow(`... and ${files.length - limit} more files`));
      }
      
      console.log(chalk.bold('\nEstimated nodes to create:'));
      console.log(`• Document nodes: ${files.length}`);
      console.log(`• Concept nodes: ~${files.length * 3} (estimated)`);
      console.log(`• Fact nodes: ~${files.length * 5} (estimated)`);
      console.log(`• Entity nodes: ~${files.length * 2} (estimated)`);
      console.log(`• Total: ~${files.length * 11} nodes`);
      
    } catch (error) {
      spinner.fail('Preview failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });