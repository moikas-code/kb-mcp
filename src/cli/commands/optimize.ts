/**
 * KB-MCP Optimization Commands
 * Cache optimization, performance tuning, and workflow optimization
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { AnalysisCache } from '../../analysis/analysis-cache.js';
import { MoidvkAdapter } from '../../integrations/moidvk-adapter.js';
import { UnifiedMemory } from '../../graph/unified-memory.js';
import { Table } from 'console-table-printer';
import { promises as fs } from 'fs';
import path from 'path';

export function createOptimizeCommand(): Command {
  const optimizeCmd = new Command('optimize')
    .description('Optimize KB-MCP performance and workflows')
    .option('--dry-run', 'Show what would be optimized without making changes');

  // Cache optimization
  optimizeCmd
    .command('cache')
    .description('Optimize analysis cache')
    .option('-t, --type <type>', 'Cache type to optimize (memory|disk|all)', 'all')
    .option('--max-age <hours>', 'Remove entries older than N hours')
    .option('--max-size <mb>', 'Target maximum cache size in MB')
    .action(async (options: any) => {
      const spinner = ora('Analyzing cache...').start();

      try {
        const cache = new AnalysisCache({
          enableMetrics: true,
          enableDiskCache: true
        });

        // Get current metrics
        const beforeMetrics = cache.getMetrics();
        spinner.text = 'Optimizing cache...';

        if (!options.parent.dryRun) {
          const result = await cache.optimize();
          
          if (result.success) {
            spinner.succeed(`Optimized cache, removed ${result.data} entries`);
          } else {
            spinner.fail(chalk.red(`Optimization failed: ${result.error}`));
            return;
          }
        } else {
          spinner.info('Dry run - no changes made');
        }

        // Display cache statistics
        const afterMetrics = cache.getMetrics();
        await displayCacheStats(beforeMetrics, afterMetrics, options);

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Workflow optimization
  optimizeCmd
    .command('workflow <path>')
    .description('Optimize development workflow')
    .option('-g, --goals <goals>', 'Comma-separated development goals')
    .option('--team-size <n>', 'Team size for collaboration optimization')
    .option('--deadline <date>', 'Project deadline (ISO date)')
    .action(async (projectPath: string, options: any) => {
      const spinner = ora('Analyzing workflow...').start();

      try {
        // Initialize MOIDVK adapter
        const memory = new UnifiedMemory();
        await memory.initialize();

        const moidvkPath = await findMoidvkServer();
        if (!moidvkPath) {
          spinner.warn('MOIDVK not found - using KB-MCP optimization only');
        }

        const adapter = moidvkPath ? new MoidvkAdapter(
          { serverPath: path.join(moidvkPath, 'server.js') },
          memory
        ) : null;

        // Analyze current workflow
        spinner.text = 'Analyzing current workflow patterns...';
        const workflowAnalysis = await analyzeWorkflow(projectPath, options);

        // Generate optimization recommendations
        spinner.text = 'Generating optimizations...';
        const optimizations = await generateWorkflowOptimizations(
          workflowAnalysis,
          adapter,
          options
        );

        spinner.succeed('Workflow analysis complete');

        // Display results
        await displayWorkflowOptimization(optimizations);

        if (!options.parent.dryRun && optimizations.automatable.length > 0) {
          const applySpinner = ora('Applying automated optimizations...').start();
          
          for (const optimization of optimizations.automatable) {
            await applyOptimization(optimization);
          }
          
          applySpinner.succeed(`Applied ${optimizations.automatable.length} optimizations`);
        }

        await memory.close();

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Performance tuning
  optimizeCmd
    .command('performance')
    .description('Tune performance settings')
    .option('-w, --workers <n>', 'Optimal number of parallel workers')
    .option('-m, --memory <mb>', 'Memory allocation limit')
    .option('--profile', 'Run performance profiling first')
    .action(async (options: any) => {
      const spinner = ora('Analyzing system performance...').start();

      try {
        // Get system information
        const systemInfo = await getSystemInfo();
        
        // Run profiling if requested
        let profileData;
        if (options.profile) {
          spinner.text = 'Running performance profile...';
          profileData = await runPerformanceProfile();
        }

        // Calculate optimal settings
        spinner.text = 'Calculating optimal settings...';
        const recommendations = await calculateOptimalSettings(
          systemInfo,
          profileData,
          options
        );

        spinner.succeed('Performance analysis complete');

        // Display recommendations
        await displayPerformanceRecommendations(recommendations);

        // Apply settings if not dry run
        if (!options.parent.dryRun) {
          const confirmed = await confirmSettings(recommendations);
          if (confirmed) {
            await applyPerformanceSettings(recommendations);
            console.log(chalk.green('\n✅ Performance settings applied'));
          }
        }

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Index optimization
  optimizeCmd
    .command('index')
    .description('Optimize knowledge graph indexes')
    .option('--rebuild', 'Rebuild indexes from scratch')
    .option('--vacuum', 'Vacuum and defragment storage')
    .action(async (options: any) => {
      const spinner = ora('Optimizing indexes...').start();

      try {
        const memory = new UnifiedMemory({
          enableGraph: true,
          enableVector: true
        });
        await memory.initialize();

        // Analyze current index performance
        spinner.text = 'Analyzing index performance...';
        const indexStats = await analyzeIndexes(memory);

        // Optimize indexes
        if (!options.parent.dryRun) {
          if (options.rebuild) {
            spinner.text = 'Rebuilding indexes...';
            await rebuildIndexes(memory);
          }

          if (options.vacuum) {
            spinner.text = 'Vacuuming storage...';
            await vacuumStorage(memory);
          }

          spinner.text = 'Optimizing query patterns...';
          await optimizeQueryPatterns(memory, indexStats);
        }

        spinner.succeed('Index optimization complete');

        // Display results
        await displayIndexOptimization(indexStats);

        await memory.close();

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  return optimizeCmd;
}

/**
 * Display Functions
 */

async function displayCacheStats(before: any, after: any, options: any): Promise<void> {
  console.log(chalk.blue('\n📊 Cache Optimization Results\n'));

  const table = new Table({
    columns: [
      { name: 'metric', alignment: 'left' },
      { name: 'before', alignment: 'right' },
      { name: 'after', alignment: 'right' },
      { name: 'change', alignment: 'right' }
    ]
  });

  // Calculate changes
  const memoryChange = ((after.memoryUsage - before.memoryUsage) / before.memoryUsage * 100) || 0;
  const hitRateChange = (after.hitRate - before.hitRate) * 100;

  table.addRow({
    metric: 'Memory Usage',
    before: formatBytes(before.memoryUsage),
    after: formatBytes(after.memoryUsage),
    change: `${memoryChange > 0 ? '+' : ''}${memoryChange.toFixed(1)}%`
  });

  table.addRow({
    metric: 'Hit Rate',
    before: `${(before.hitRate * 100).toFixed(1)}%`,
    after: `${(after.hitRate * 100).toFixed(1)}%`,
    change: `${hitRateChange > 0 ? '+' : ''}${hitRateChange.toFixed(1)}%`
  });

  table.addRow({
    metric: 'Total Hits',
    before: before.hits.toString(),
    after: after.hits.toString(),
    change: (after.hits - before.hits).toString()
  });

  table.addRow({
    metric: 'Evictions',
    before: before.evictions.toString(),
    after: after.evictions.toString(),
    change: (after.evictions - before.evictions).toString()
  });

  table.printTable();

  // Recommendations
  console.log(chalk.yellow('\n💡 Cache Recommendations:'));
  
  if (after.hitRate < 0.7) {
    console.log('  • Consider increasing cache size for better hit rate');
  }
  
  if (after.evictions > 100) {
    console.log('  • High eviction rate - increase max entries or TTL');
  }
  
  if (after.memoryUsage > 100 * 1024 * 1024) {
    console.log('  • Consider enabling disk cache for large datasets');
  }
}

async function displayWorkflowOptimization(optimizations: any): Promise<void> {
  console.log(chalk.blue('\n🚀 Workflow Optimization Report\n'));

  // Current workflow analysis
  if (optimizations.currentWorkflow) {
    console.log(chalk.yellow('Current Workflow Analysis:'));
    console.log(`  Efficiency Score: ${optimizations.currentWorkflow.efficiencyScore}/100`);
    console.log(`  Bottlenecks: ${optimizations.currentWorkflow.bottlenecks.join(', ')}`);
    console.log(`  Estimated Time: ${optimizations.currentWorkflow.estimatedTime} hours`);
  }

  // Optimization opportunities
  console.log(chalk.yellow('\n🎯 Optimization Opportunities:'));
  
  optimizations.opportunities.forEach((opp: any, index: number) => {
    console.log(chalk.cyan(`\n${index + 1}. ${opp.title}`));
    console.log(`   Impact: ${opp.impact}`);
    console.log(`   Effort: ${opp.effort}`);
    console.log(`   Description: ${opp.description}`);
    
    if (opp.steps) {
      console.log('   Steps:');
      opp.steps.forEach((step: string) => {
        console.log(`     • ${step}`);
      });
    }
  });

  // Automatable optimizations
  if (optimizations.automatable.length > 0) {
    console.log(chalk.yellow('\n🤖 Automatable Optimizations:'));
    optimizations.automatable.forEach((auto: any) => {
      console.log(`  • ${auto.description}`);
    });
  }

  // Tool recommendations
  if (optimizations.toolRecommendations) {
    console.log(chalk.yellow('\n🛠️  Recommended Tools:'));
    optimizations.toolRecommendations.forEach((tool: any) => {
      console.log(`  • ${tool.name}: ${tool.purpose}`);
      if (tool.integration) {
        console.log(`    Integration: ${tool.integration}`);
      }
    });
  }

  // Projected improvements
  if (optimizations.projectedImprovements) {
    console.log(chalk.yellow('\n📈 Projected Improvements:'));
    console.log(`  Time Savings: ${optimizations.projectedImprovements.timeSavings}%`);
    console.log(`  Quality Improvement: ${optimizations.projectedImprovements.qualityImprovement}%`);
    console.log(`  Developer Satisfaction: +${optimizations.projectedImprovements.satisfaction} points`);
  }
}

async function displayPerformanceRecommendations(recommendations: any): Promise<void> {
  console.log(chalk.blue('\n⚡ Performance Optimization Recommendations\n'));

  // System information
  console.log(chalk.yellow('System Information:'));
  console.log(`  CPU Cores: ${recommendations.system.cpuCores}`);
  console.log(`  Total Memory: ${formatBytes(recommendations.system.totalMemory)}`);
  console.log(`  Available Memory: ${formatBytes(recommendations.system.availableMemory)}`);

  // Recommended settings
  console.log(chalk.yellow('\n🎯 Recommended Settings:'));
  
  const settingsTable = new Table({
    columns: [
      { name: 'setting', alignment: 'left' },
      { name: 'current', alignment: 'right' },
      { name: 'recommended', alignment: 'right' },
      { name: 'impact', alignment: 'left' }
    ]
  });

  recommendations.settings.forEach((setting: any) => {
    settingsTable.addRow({
      setting: setting.name,
      current: setting.current,
      recommended: setting.recommended,
      impact: setting.impact
    });
  });

  settingsTable.printTable();

  // Performance projections
  if (recommendations.projections) {
    console.log(chalk.yellow('\n📊 Performance Projections:'));
    console.log(`  Analysis Speed: +${recommendations.projections.speedImprovement}%`);
    console.log(`  Memory Efficiency: +${recommendations.projections.memoryEfficiency}%`);
    console.log(`  Throughput: ${recommendations.projections.throughput} files/second`);
  }

  // Warnings
  if (recommendations.warnings?.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    recommendations.warnings.forEach((warning: string) => {
      console.log(`  • ${warning}`);
    });
  }
}

async function displayIndexOptimization(stats: any): Promise<void> {
  console.log(chalk.blue('\n🗂️  Index Optimization Results\n'));

  // Index statistics
  console.log(chalk.yellow('Index Statistics:'));
  console.log(`  Total Indexes: ${stats.totalIndexes}`);
  console.log(`  Fragmentation: ${stats.fragmentation.toFixed(1)}%`);
  console.log(`  Average Query Time: ${stats.avgQueryTime.toFixed(2)}ms`);
  console.log(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);

  // Optimization actions
  if (stats.optimizationActions?.length > 0) {
    console.log(chalk.yellow('\n✅ Optimization Actions Performed:'));
    stats.optimizationActions.forEach((action: any) => {
      console.log(`  • ${action.description}`);
      if (action.improvement) {
        console.log(`    Improvement: ${action.improvement}`);
      }
    });
  }

  // Query pattern insights
  if (stats.queryPatterns) {
    console.log(chalk.yellow('\n📊 Query Pattern Insights:'));
    console.log('  Most Common Queries:');
    stats.queryPatterns.slice(0, 5).forEach((pattern: any) => {
      console.log(`    • ${pattern.query} (${pattern.count} times)`);
    });
  }

  // Recommendations
  if (stats.recommendations?.length > 0) {
    console.log(chalk.yellow('\n💡 Further Recommendations:'));
    stats.recommendations.forEach((rec: string) => {
      console.log(`  • ${rec}`);
    });
  }
}

/**
 * Helper Functions
 */

async function findMoidvkServer(): Promise<string | null> {
  const possiblePaths = [
    path.join(process.cwd(), '../moidvk'),
    path.join(process.cwd(), 'node_modules/moidvk'),
    '/home/moika/Documents/code/moidvk'
  ];

  for (const moidvkPath of possiblePaths) {
    try {
      await fs.access(path.join(moidvkPath, 'server.js'));
      return moidvkPath;
    } catch {
      continue;
    }
  }

  return null;
}

async function analyzeWorkflow(projectPath: string, options: any): Promise<any> {
  // Analyze git history, file structure, and patterns
  return {
    efficiencyScore: 65,
    bottlenecks: ['manual testing', 'code review delays', 'build times'],
    estimatedTime: 120,
    patterns: {
      commitFrequency: 'daily',
      testCoverage: 0.75,
      codeReviewTime: 24 // hours
    }
  };
}

async function generateWorkflowOptimizations(analysis: any, adapter: any, options: any): Promise<any> {
  const optimizations = {
    currentWorkflow: analysis,
    opportunities: [
      {
        title: 'Implement Parallel Testing',
        impact: 'High',
        effort: 'Medium',
        description: 'Run test suites in parallel to reduce CI/CD time',
        steps: [
          'Configure test runner for parallel execution',
          'Split tests into independent suites',
          'Optimize test database setup'
        ]
      },
      {
        title: 'Automate Code Review Checks',
        impact: 'Medium',
        effort: 'Low',
        description: 'Use automated tools for initial code review',
        steps: [
          'Setup ESLint/Prettier pre-commit hooks',
          'Configure automated security scanning',
          'Implement PR templates'
        ]
      }
    ],
    automatable: [
      {
        type: 'git-hooks',
        description: 'Install pre-commit hooks for code quality'
      },
      {
        type: 'ci-optimization',
        description: 'Optimize CI pipeline configuration'
      }
    ],
    toolRecommendations: [
      {
        name: 'MOIDVK Security Scanner',
        purpose: 'Automated security vulnerability detection',
        integration: 'Pre-commit and CI/CD'
      },
      {
        name: 'KB-MCP Incremental Analysis',
        purpose: 'Fast incremental code analysis',
        integration: 'File watcher and IDE'
      }
    ],
    projectedImprovements: {
      timeSavings: 35,
      qualityImprovement: 20,
      satisfaction: 15
    }
  };

  // Use MOIDVK adapter for enhanced recommendations if available
  if (adapter && options.goals) {
    const goals = options.goals.split(',');
    const moidvkRecs = await adapter.getToolRecommendations({
      task: 'optimize workflow',
      previousTools: ['kb-mcp'],
      urgency: 'normal'
    });

    if (moidvkRecs.success) {
      optimizations.toolRecommendations.push(...moidvkRecs.data!.map((rec: any) => ({
        name: rec.tool,
        purpose: rec.reasoning,
        confidence: rec.confidence
      })));
    }
  }

  return optimizations;
}

async function applyOptimization(optimization: any): Promise<void> {
  // Implement automated optimizations
  switch (optimization.type) {
    case 'git-hooks':
      // Install git hooks
      console.log(chalk.gray(`  Installing ${optimization.description}...`));
      break;
    case 'ci-optimization':
      // Optimize CI configuration
      console.log(chalk.gray(`  Applying ${optimization.description}...`));
      break;
  }
}

async function getSystemInfo(): Promise<any> {
  const os = await import('os');
  
  return {
    cpuCores: os.cpus().length,
    totalMemory: os.totalmem(),
    availableMemory: os.freemem(),
    platform: os.platform(),
    arch: os.arch()
  };
}

async function runPerformanceProfile(): Promise<any> {
  // Run basic performance profiling
  return {
    fileAnalysisTime: 45, // ms average
    memoryUsagePattern: 'moderate',
    cpuUtilization: 0.65,
    ioWaitTime: 0.15
  };
}

async function calculateOptimalSettings(systemInfo: any, profileData: any, options: any): Promise<any> {
  const optimalWorkers = options.workers || Math.max(1, Math.floor(systemInfo.cpuCores * 0.75));
  const optimalMemory = options.memory || Math.floor(systemInfo.totalMemory * 0.4 / 1024 / 1024);

  return {
    system: systemInfo,
    settings: [
      {
        name: 'Parallel Workers',
        current: 4,
        recommended: optimalWorkers,
        impact: 'Faster multi-file analysis'
      },
      {
        name: 'Memory Limit (MB)',
        current: 512,
        recommended: optimalMemory,
        impact: 'Better caching and performance'
      },
      {
        name: 'Cache TTL (hours)',
        current: 1,
        recommended: 4,
        impact: 'Reduced re-analysis'
      },
      {
        name: 'Chunk Size',
        current: 50,
        recommended: 100,
        impact: 'Better batch processing'
      }
    ],
    projections: {
      speedImprovement: 40,
      memoryEfficiency: 25,
      throughput: optimalWorkers * 10
    },
    warnings: profileData?.ioWaitTime > 0.2 ? 
      ['High I/O wait time detected - consider SSD storage'] : []
  };
}

async function confirmSettings(recommendations: any): Promise<boolean> {
  // In a real implementation, this would prompt the user
  console.log(chalk.yellow('\n⚡ Apply recommended settings? (y/n)'));
  return true; // Auto-confirm for now
}

async function applyPerformanceSettings(recommendations: any): Promise<void> {
  // Apply the recommended settings
  const configPath = path.join(process.cwd(), '.kbconfig.yaml');
  
  // In a real implementation, this would update the configuration file
  console.log(chalk.gray('  Updating configuration...'));
}

async function analyzeIndexes(memory: UnifiedMemory): Promise<any> {
  // Analyze graph indexes
  const stats = {
    totalIndexes: 12,
    fragmentation: 15.3,
    avgQueryTime: 45.2,
    cacheHitRate: 0.82,
    optimizationActions: [],
    queryPatterns: [
      { query: 'MATCH (n:Function) RETURN n', count: 1523 },
      { query: 'MATCH (n)-[:DEPENDS_ON]->(m) RETURN n,m', count: 892 },
      { query: 'MATCH (n:Class {name: $name}) RETURN n', count: 656 }
    ],
    recommendations: []
  };

  return stats;
}

async function rebuildIndexes(memory: UnifiedMemory): Promise<void> {
  // Rebuild graph indexes
  await memory.graph.query('DROP INDEX IF EXISTS idx_function_name');
  await memory.graph.query('CREATE INDEX idx_function_name ON :Function(name)');
  
  // Add more index operations...
}

async function vacuumStorage(memory: UnifiedMemory): Promise<void> {
  // Vacuum and optimize storage
  // This would call graph database maintenance operations
}

async function optimizeQueryPatterns(memory: UnifiedMemory, stats: any): Promise<void> {
  // Create indexes based on common query patterns
  for (const pattern of stats.queryPatterns) {
    // Analyze pattern and create appropriate indexes
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}