/**
 * KB-MCP Code Analysis CLI Commands
 * Provides command-line interface for code intelligence features
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import { AnalysisEngine } from '../../analysis/analysis-engine.js';
import { UnifiedMemory } from '../../graph/unified-memory.js';
import { BatchProcessor } from '../../analysis/batch-processor.js';
import { MoidvkAdapter } from '../../integrations/moidvk-adapter.js';
import { Table } from 'console-table-printer';

export function createAnalyzeCommand(): Command {
  const analyzeCmd = new Command('analyze')
    .description('Analyze code with KB-MCP intelligence engine')
    .option('-d, --depth <level>', 'Analysis depth (quick|standard|comprehensive)', 'standard')
    .option('-f, --format <format>', 'Output format (json|table|markdown)', 'table')
    .option('-o, --output <file>', 'Save results to file')
    .option('--no-cache', 'Disable result caching')
    .option('--parallel <workers>', 'Number of parallel workers', '4')
    .option('--moidvk', 'Enable MOIDVK hybrid analysis');

  // Subcommand: analyze file
  analyzeCmd
    .command('file <path>')
    .description('Analyze a single file')
    .option('-l, --language <lang>', 'Override language detection')
    .option('--patterns', 'Include pattern detection', true)
    .option('--debt', 'Include technical debt analysis', true)
    .option('--insights', 'Generate AI insights', true)
    .action(async (filePath: string, options: any) => {
      const spinner = ora('Analyzing file...').start();

      try {
        const engine = await createAnalysisEngine(options);
        const content = await fs.readFile(filePath, 'utf-8');
        
        const result = await engine.analyzeFile(filePath, content, {
          language: options.language,
          includePatterns: options.patterns,
          includeDebt: options.debt,
          includeInsights: options.insights
        });

        spinner.succeed('Analysis complete');

        if (result.success) {
          await displayFileAnalysis(result.data!, options);
          
          if (options.output) {
            await saveResults(options.output, result.data, options.format);
          }
        } else {
          spinner.fail(chalk.red(`Analysis failed: ${result.error}`));
        }

        await engine.cleanup();
      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand: analyze project
  analyzeCmd
    .command('project [path]')
    .description('Analyze entire project')
    .option('--include <patterns>', 'Include file patterns (comma-separated)')
    .option('--exclude <patterns>', 'Exclude file patterns (comma-separated)')
    .option('--max-files <n>', 'Maximum files to analyze', '1000')
    .option('--progress', 'Show progress bar', true)
    .action(async (projectPath: string = '.', options: any) => {
      const spinner = ora('Initializing project analysis...').start();

      try {
        const engine = await createAnalysisEngine(options);
        const batchProcessor = new BatchProcessor({
          concurrency: parseInt(options.parent.parallel),
          progressReporting: options.progress
        });

        if (options.progress) {
          batchProcessor.on('progress', ({ completed, total, percentage }) => {
            spinner.text = `Analyzing project... ${completed}/${total} (${percentage.toFixed(1)}%)`;
          });
        }

        spinner.text = 'Discovering files...';
        
        const analysisRequest = {
          projectPath: path.resolve(projectPath),
          analysisTypes: ['file', 'pattern', 'debt', 'dependencies'] as any[],
          options: {
            includeTests: true,
            maxFileSize: 5 * 1024 * 1024,
            excludePatterns: options.exclude?.split(',') || []
          }
        };

        const result = await batchProcessor.processBatch(analysisRequest);

        spinner.succeed(`Analyzed ${result.data?.summary.processedFiles} files`);

        if (result.success) {
          await displayProjectAnalysis(result.data!, options);
          
          if (options.output) {
            await saveResults(options.output, result.data, options.format);
          }
        } else {
          spinner.fail(chalk.red(`Analysis failed: ${result.error}`));
        }

        await engine.cleanup();
        await batchProcessor.cleanup();
      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand: analyze patterns
  analyzeCmd
    .command('patterns <path>')
    .description('Detect code patterns and anti-patterns')
    .option('-t, --type <type>', 'Pattern types (design|anti|smell|all)', 'all')
    .option('--min-confidence <n>', 'Minimum confidence score (0-1)', '0.7')
    .action(async (codePath: string, options: any) => {
      const spinner = ora('Detecting patterns...').start();

      try {
        const engine = await createAnalysisEngine(options);
        
        // Determine if path is file or directory
        const stats = await fs.stat(codePath);
        let patterns: any[] = [];

        if (stats.isFile()) {
          const content = await fs.readFile(codePath, 'utf-8');
          const result = await engine.analyzeFile(codePath, content);
          patterns = result.data?.patterns || [];
        } else {
          const result = await engine.analyzeProject(codePath);
          patterns = result.data?.patterns || [];
        }

        // Filter by type and confidence
        if (options.type !== 'all') {
          patterns = patterns.filter(p => p.type === options.type);
        }
        patterns = patterns.filter(p => 
          (p.confidence || 1) >= parseFloat(options.minConfidence)
        );

        spinner.succeed(`Found ${patterns.length} patterns`);

        await displayPatterns(patterns, options);

        if (options.output) {
          await saveResults(options.output, patterns, options.format);
        }

        await engine.cleanup();
      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand: analyze debt
  analyzeCmd
    .command('debt <path>')
    .description('Analyze technical debt')
    .option('-p, --priority <level>', 'Filter by priority (low|medium|high|all)', 'all')
    .option('--threshold <score>', 'Debt score threshold', '0')
    .action(async (projectPath: string, options: any) => {
      const spinner = ora('Analyzing technical debt...').start();

      try {
        const engine = await createAnalysisEngine(options);
        const result = await engine.analyzeProject(projectPath, {
          analysisDepth: 'comprehensive'
        });

        spinner.succeed('Technical debt analysis complete');

        if (result.success && result.data?.technicalDebt) {
          await displayTechnicalDebt(result.data.technicalDebt, options);
          
          if (options.output) {
            await saveResults(options.output, result.data.technicalDebt, options.format);
          }
        } else {
          spinner.fail(chalk.red('No technical debt data found'));
        }

        await engine.cleanup();
      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand: query
  analyzeCmd
    .command('query <question>')
    .description('Ask natural language questions about your code')
    .option('-c, --context <path>', 'Context path for the query', '.')
    .option('--max-results <n>', 'Maximum results to return', '10')
    .option('--explain', 'Include detailed explanations', true)
    .action(async (question: string, options: any) => {
      const spinner = ora('Processing query...').start();

      try {
        const engine = await createAnalysisEngine(options);
        
        // Load context if needed
        if (options.context !== '.') {
          spinner.text = 'Loading context...';
          await engine.analyzeProject(options.context);
        }

        spinner.text = 'Searching for answers...';
        const result = await engine.processQuery(question, {
          includeContext: true,
          includeExplanations: options.explain,
          maxResults: parseInt(options.maxResults)
        });

        spinner.succeed('Query processed');

        if (result.success) {
          await displayQueryResults(result.data!, options);
          
          if (options.output) {
            await saveResults(options.output, result.data, options.format);
          }
        } else {
          spinner.fail(chalk.red(`Query failed: ${result.error}`));
        }

        await engine.cleanup();
      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand: watch
  analyzeCmd
    .command('watch <path>')
    .description('Watch files for real-time analysis')
    .option('-i, --interval <ms>', 'Debounce interval', '1000')
    .option('--incremental', 'Enable incremental analysis', true)
    .action(async (watchPath: string, options: any) => {
      console.log(chalk.blue('Starting file watcher...'));

      try {
        const engine = await createAnalysisEngine(options);
        const watcher = await engine.startRealTimeAnalysis(watchPath);

        console.log(chalk.green(`✓ Watching ${watchPath} for changes`));
        console.log(chalk.gray('Press Ctrl+C to stop\n'));

        // Handle file changes
        let changeCount = 0;
        engine.on('fileAnalyzed', (result: any) => {
          changeCount++;
          console.log(chalk.yellow(`[${new Date().toLocaleTimeString()}] File changed: ${result.file}`));
          
          if (result.patterns?.length > 0) {
            console.log(chalk.cyan(`  Found ${result.patterns.length} patterns`));
          }
          
          if (result.technicalDebt?.items?.length > 0) {
            console.log(chalk.magenta(`  Found ${result.technicalDebt.items.length} debt items`));
          }
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
          console.log(chalk.yellow('\n\nStopping file watcher...'));
          await engine.stopRealTimeAnalysis();
          console.log(chalk.green(`✓ Analyzed ${changeCount} file changes`));
          process.exit(0);
        });

      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  return analyzeCmd;
}

/**
 * Helper Functions
 */

async function createAnalysisEngine(options: any): Promise<AnalysisEngine> {
  const memory = new UnifiedMemory({
    enableGraph: true,
    enableVector: true,
    enableTemporal: true,
    enableWorking: !options.noCache
  });

  await memory.initialize();

  const engine = new AnalysisEngine(memory, {
    enableRealTimeAnalysis: false,
    enablePatternDetection: true,
    enableDebtAnalysis: true,
    enableInsightsGeneration: true,
    enableNaturalLanguageQueries: true,
    analysisDepth: options.parent?.depth || 'standard'
  });

  // Setup MOIDVK integration if requested
  if (options.parent?.moidvk) {
    const moidvkPath = await findMoidvkServer();
    if (moidvkPath) {
      const adapter = new MoidvkAdapter(
        { serverPath: moidvkPath },
        memory
      );
      (engine as any).moidvkAdapter = adapter;
    }
  }

  return engine;
}

async function findMoidvkServer(): Promise<string | null> {
  const possiblePaths = [
    path.join(process.cwd(), '../moidvk/server.js'),
    path.join(process.cwd(), 'node_modules/moidvk/server.js'),
    '/home/moika/Documents/code/moidvk/server.js'
  ];

  for (const moidvkPath of possiblePaths) {
    try {
      await fs.access(moidvkPath);
      return moidvkPath;
    } catch {
      continue;
    }
  }

  return null;
}

async function displayFileAnalysis(data: any, options: any): Promise<void> {
  if (options.parent?.format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(chalk.blue('\n📊 File Analysis Results\n'));

  // Entities
  if (data.entities?.length > 0) {
    console.log(chalk.yellow('Entities:'));
    const entityTable = new Table({
      columns: [
        { name: 'type', alignment: 'left' },
        { name: 'name', alignment: 'left' },
        { name: 'line', alignment: 'right' },
        { name: 'complexity', alignment: 'right' }
      ]
    });
    
    data.entities.forEach((entity: any) => {
      entityTable.addRow({
        type: entity.type,
        name: entity.name,
        line: entity.location?.start || '-',
        complexity: entity.complexity || '-'
      });
    });
    
    entityTable.printTable();
  }

  // Patterns
  if (data.patterns?.length > 0) {
    console.log(chalk.yellow('\nPatterns Detected:'));
    data.patterns.forEach((pattern: any) => {
      const icon = pattern.type === 'anti_pattern' ? '⚠️' : 
                   pattern.type === 'design_pattern' ? '✅' : '🔍';
      console.log(`  ${icon} ${pattern.name} (${pattern.type})`);
      if (pattern.description) {
        console.log(chalk.gray(`     ${pattern.description}`));
      }
    });
  }

  // Technical Debt
  if (data.technicalDebt?.items?.length > 0) {
    console.log(chalk.yellow('\nTechnical Debt:'));
    console.log(`  Total Score: ${chalk.red(data.technicalDebt.totalDebt.toFixed(2))}`);
    console.log(`  Debt Ratio: ${chalk.yellow(data.technicalDebt.debtRatio.toFixed(2))}%`);
    
    const topItems = data.technicalDebt.items.slice(0, 5);
    topItems.forEach((item: any) => {
      const severityColor = item.severity === 'high' ? chalk.red :
                           item.severity === 'medium' ? chalk.yellow :
                           chalk.green;
      console.log(`  • ${severityColor(item.severity.toUpperCase())} - ${item.message}`);
    });
    
    if (data.technicalDebt.items.length > 5) {
      console.log(chalk.gray(`  ... and ${data.technicalDebt.items.length - 5} more items`));
    }
  }
}

async function displayProjectAnalysis(data: any, options: any): Promise<void> {
  if (options.parent?.format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(chalk.blue('\n📊 Project Analysis Summary\n'));

  // Summary statistics
  const summaryTable = new Table({
    columns: [
      { name: 'metric', alignment: 'left' },
      { name: 'value', alignment: 'right' }
    ]
  });

  summaryTable.addRow({ metric: 'Total Files', value: data.summary.totalFiles });
  summaryTable.addRow({ metric: 'Processed Files', value: data.summary.processedFiles });
  summaryTable.addRow({ metric: 'Failed Files', value: data.summary.failedFiles });
  summaryTable.addRow({ metric: 'Processing Time', value: `${(data.summary.processingTime / 1000).toFixed(2)}s` });
  summaryTable.addRow({ metric: 'Avg Time per File', value: `${data.summary.averageFileTime.toFixed(0)}ms` });

  summaryTable.printTable();

  // Top patterns
  if (data.results.aggregated.patterns?.length > 0) {
    console.log(chalk.yellow('\nTop Patterns:'));
    const patternCounts = new Map<string, number>();
    
    data.results.aggregated.patterns.forEach((pattern: any) => {
      const key = `${pattern.type}:${pattern.name}`;
      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    });

    const sortedPatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedPatterns.forEach(([pattern, count]) => {
      const [type, name] = pattern.split(':');
      const icon = type === 'anti_pattern' ? '⚠️' : 
                   type === 'design_pattern' ? '✅' : '🔍';
      console.log(`  ${icon} ${name}: ${count} occurrences`);
    });
  }

  // Errors
  if (data.errors?.length > 0) {
    console.log(chalk.red('\nErrors:'));
    data.errors.slice(0, 5).forEach((error: any) => {
      console.log(`  • ${error.file}: ${error.error}`);
    });
    
    if (data.errors.length > 5) {
      console.log(chalk.gray(`  ... and ${data.errors.length - 5} more errors`));
    }
  }
}

async function displayPatterns(patterns: any[], options: any): Promise<void> {
  if (options.parent?.format === 'json') {
    console.log(JSON.stringify(patterns, null, 2));
    return;
  }

  if (patterns.length === 0) {
    console.log(chalk.yellow('No patterns found matching criteria'));
    return;
  }

  console.log(chalk.blue('\n🔍 Pattern Detection Results\n'));

  const patternTable = new Table({
    columns: [
      { name: 'type', alignment: 'left' },
      { name: 'name', alignment: 'left' },
      { name: 'file', alignment: 'left' },
      { name: 'line', alignment: 'right' },
      { name: 'confidence', alignment: 'right' }
    ]
  });

  patterns.forEach((pattern: any) => {
    patternTable.addRow({
      type: pattern.type,
      name: pattern.name,
      file: path.basename(pattern.file || 'unknown'),
      line: pattern.location?.start || '-',
      confidence: pattern.confidence ? `${(pattern.confidence * 100).toFixed(0)}%` : '-'
    });
  });

  patternTable.printTable();

  // Pattern summary
  const typeCounts = patterns.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(chalk.yellow('\nSummary:'));
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

async function displayTechnicalDebt(debt: any, options: any): Promise<void> {
  if (options.parent?.format === 'json') {
    console.log(JSON.stringify(debt, null, 2));
    return;
  }

  console.log(chalk.blue('\n💸 Technical Debt Analysis\n'));

  // Overall metrics
  console.log(chalk.yellow('Overall Metrics:'));
  console.log(`  Total Debt Score: ${chalk.red(debt.totalDebt.toFixed(2))}`);
  console.log(`  Debt Ratio: ${chalk.yellow(debt.debtRatio.toFixed(2))}%`);
  console.log(`  Total Items: ${debt.items?.length || 0}`);

  // Breakdown by priority
  if (debt.items?.length > 0) {
    const priorityCounts = debt.items.reduce((acc: any, item: any) => {
      acc[item.severity || 'unknown'] = (acc[item.severity || 'unknown'] || 0) + 1;
      return acc;
    }, {});

    console.log(chalk.yellow('\nBreakdown by Severity:'));
    Object.entries(priorityCounts).forEach(([severity, count]) => {
      const color = severity === 'high' ? chalk.red :
                   severity === 'medium' ? chalk.yellow :
                   chalk.green;
      console.log(`  ${color(severity)}: ${count}`);
    });

    // Top debt items
    console.log(chalk.yellow('\nTop Debt Items:'));
    
    let items = debt.items;
    if (options.priority !== 'all') {
      items = items.filter((item: any) => item.severity === options.priority);
    }
    
    items.slice(0, 10).forEach((item: any) => {
      const severityColor = item.severity === 'high' ? chalk.red :
                           item.severity === 'medium' ? chalk.yellow :
                           chalk.green;
      console.log(`\n  ${severityColor(`[${item.severity.toUpperCase()}]`)} ${item.type}`);
      console.log(`  ${chalk.gray(item.message)}`);
      if (item.file) {
        console.log(`  📁 ${item.file}:${item.location?.start || '?'}`);
      }
      if (item.estimatedEffort) {
        console.log(`  ⏱️  Estimated effort: ${item.estimatedEffort}`);
      }
    });

    if (items.length > 10) {
      console.log(chalk.gray(`\n  ... and ${items.length - 10} more items`));
    }
  }

  // Recommendations
  if (debt.recommendations?.length > 0) {
    console.log(chalk.yellow('\n💡 Recommendations:'));
    debt.recommendations.forEach((rec: string) => {
      console.log(`  • ${rec}`);
    });
  }
}

async function displayQueryResults(results: any, options: any): Promise<void> {
  if (options.parent?.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(chalk.blue('\n🔍 Query Results\n'));

  if (results.explanation) {
    console.log(chalk.yellow('Understanding your query:'));
    console.log(chalk.gray(results.explanation));
    console.log();
  }

  if (results.cypherQuery) {
    console.log(chalk.yellow('Generated query:'));
    console.log(chalk.cyan(results.cypherQuery));
    console.log();
  }

  if (results.results?.length > 0) {
    console.log(chalk.yellow(`Found ${results.results.length} results:\n`));
    
    results.results.forEach((result: any, index: number) => {
      console.log(chalk.green(`${index + 1}. ${result.name || result.title || 'Result'}`));
      
      // Display relevant properties
      Object.entries(result).forEach(([key, value]) => {
        if (key !== 'name' && key !== 'title' && value != null) {
          console.log(`   ${chalk.gray(key)}: ${value}`);
        }
      });
      
      console.log();
    });
  } else {
    console.log(chalk.yellow('No results found for your query'));
  }

  if (results.suggestions?.length > 0) {
    console.log(chalk.yellow('💡 Suggestions:'));
    results.suggestions.forEach((suggestion: string) => {
      console.log(`  • ${suggestion}`);
    });
  }
}

async function saveResults(outputPath: string, data: any, format: string): Promise<void> {
  let content: string;
  
  switch (format) {
    case 'json':
      content = JSON.stringify(data, null, 2);
      break;
    case 'markdown':
      content = generateMarkdownReport(data);
      break;
    default:
      content = JSON.stringify(data, null, 2);
  }

  await fs.writeFile(outputPath, content, 'utf-8');
  console.log(chalk.green(`\n✅ Results saved to ${outputPath}`));
}

function generateMarkdownReport(data: any): string {
  let markdown = '# Code Analysis Report\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;

  if (data.summary) {
    markdown += '## Summary\n\n';
    markdown += `- Total Files: ${data.summary.totalFiles}\n`;
    markdown += `- Processed: ${data.summary.processedFiles}\n`;
    markdown += `- Failed: ${data.summary.failedFiles}\n`;
    markdown += `- Time: ${(data.summary.processingTime / 1000).toFixed(2)}s\n\n`;
  }

  if (data.entities) {
    markdown += '## Entities\n\n';
    markdown += '| Type | Name | Line | Complexity |\n';
    markdown += '|------|------|------|------------|\n';
    data.entities.forEach((entity: any) => {
      markdown += `| ${entity.type} | ${entity.name} | ${entity.location?.start || '-'} | ${entity.complexity || '-'} |\n`;
    });
    markdown += '\n';
  }

  if (data.patterns) {
    markdown += '## Patterns\n\n';
    data.patterns.forEach((pattern: any) => {
      markdown += `- **${pattern.name}** (${pattern.type})\n`;
      if (pattern.description) {
        markdown += `  ${pattern.description}\n`;
      }
    });
    markdown += '\n';
  }

  if (data.technicalDebt) {
    markdown += '## Technical Debt\n\n';
    markdown += `- Total Score: ${data.technicalDebt.totalDebt.toFixed(2)}\n`;
    markdown += `- Debt Ratio: ${data.technicalDebt.debtRatio.toFixed(2)}%\n\n`;
    
    if (data.technicalDebt.items?.length > 0) {
      markdown += '### Top Issues\n\n';
      data.technicalDebt.items.slice(0, 10).forEach((item: any) => {
        markdown += `- **[${item.severity.toUpperCase()}]** ${item.type}: ${item.message}\n`;
      });
    }
  }

  return markdown;
}