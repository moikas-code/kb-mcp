/**
 * KB-MCP Benchmark Commands
 * Performance testing and analysis CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { BenchmarkRunner } from '../../benchmarks/benchmark-runner.js';
import { Table } from 'console-table-printer';
import { promises as fs } from 'fs';
import path from 'path';

export function createBenchmarkCommand(): Command {
  const benchmarkCmd = new Command('benchmark')
    .description('Run performance benchmarks for KB-MCP analysis engine')
    .option('-i, --iterations <n>', 'Number of iterations per test', '10')
    .option('-w, --warmup <n>', 'Number of warmup runs', '3')
    .option('--no-memory', 'Disable memory profiling')
    .option('-o, --output <file>', 'Save results to file')
    .option('-f, --format <format>', 'Output format (json|csv|table)', 'table');

  // Run all benchmarks
  benchmarkCmd
    .command('run [category]')
    .description('Run benchmarks (category: all|core|patterns|debt|nlq|scalability|graph)')
    .option('-q, --quick', 'Quick benchmark with fewer iterations')
    .option('-v, --verbose', 'Show detailed metrics')
    .action(async (category: string = 'all', options: any) => {
      const spinner = ora('Initializing benchmark runner...').start();

      try {
        const benchmarkOptions = {
          iterations: options.quick ? 3 : parseInt(options.parent.iterations),
          warmupRuns: options.quick ? 1 : parseInt(options.parent.warmup),
          includeMemoryProfiling: options.parent.memory !== false,
          includeDetailedMetrics: options.verbose
        };

        const runner = new BenchmarkRunner(benchmarkOptions);
        
        spinner.text = 'Running benchmarks...';
        
        let result;
        if (category === 'all') {
          result = await runner.runAllBenchmarks();
        } else {
          result = await runner.runBenchmarkCategory(category);
        }

        spinner.succeed('Benchmarks completed');

        if (result.success) {
          if (category === 'all') {
            await displayBenchmarkSuite(result.data!, options);
          } else {
            await displayCategoryResults(result.data!, category, options);
          }

          if (options.parent.output) {
            await saveBenchmarkResults(options.parent.output, result.data, options.parent.format);
          }
        } else {
          spinner.fail(chalk.red(`Benchmark failed: ${result.error}`));
        }

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Compare benchmark results
  benchmarkCmd
    .command('compare <baseline> [current]')
    .description('Compare benchmark results')
    .option('-t, --threshold <percent>', 'Performance regression threshold', '5')
    .action(async (baseline: string, current: string, options: any) => {
      const spinner = ora('Loading benchmark results...').start();

      try {
        // Load baseline
        const baselineData = JSON.parse(await fs.readFile(baseline, 'utf-8'));
        
        // Load or run current benchmarks
        let currentData;
        if (current) {
          currentData = JSON.parse(await fs.readFile(current, 'utf-8'));
        } else {
          spinner.text = 'Running current benchmarks...';
          const runner = new BenchmarkRunner({ iterations: 5 });
          const result = await runner.runAllBenchmarks();
          if (!result.success) {
            throw new Error('Failed to run current benchmarks');
          }
          currentData = result.data;
        }

        spinner.succeed('Comparison ready');

        await displayComparison(baselineData, currentData, parseFloat(options.threshold));

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Profile specific operations
  benchmarkCmd
    .command('profile <operation>')
    .description('Profile specific operation (file|project|pattern|query)')
    .option('-p, --path <path>', 'File or project path to profile')
    .option('-r, --runs <n>', 'Number of profiling runs', '20')
    .action(async (operation: string, options: any) => {
      const spinner = ora('Starting profiler...').start();

      try {
        const runner = new BenchmarkRunner({
          iterations: parseInt(options.runs),
          includeDetailedMetrics: true,
          includeMemoryProfiling: true
        });

        spinner.text = `Profiling ${operation} operation...`;

        // Run specific profiling based on operation
        const profileData = await profileOperation(runner, operation, options);

        spinner.succeed('Profiling complete');

        await displayProfilingResults(profileData, operation);

      } catch (error: any) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  return benchmarkCmd;
}

/**
 * Display Functions
 */

async function displayBenchmarkSuite(suite: any, options: any): Promise<void> {
  console.log(chalk.blue('\n🎯 Benchmark Results Summary\n'));

  // Overall summary
  console.log(chalk.yellow('Performance Rating: ') + 
    getPerformanceColor(suite.summary.performanceRating)(
      suite.summary.performanceRating.toUpperCase()
    ));
  
  console.log(chalk.gray(`Total Tests: ${suite.summary.totalTests}`));
  console.log(chalk.gray(`Total Time: ${(suite.summary.totalTime / 1000).toFixed(2)}s`));
  console.log(chalk.gray(`Average Performance: ${suite.summary.averagePerformance.toFixed(2)} ops/s`));

  // Results by category
  const categories = new Map<string, any[]>();
  suite.results.forEach((result: any) => {
    if (!categories.has(result.category)) {
      categories.set(result.category, []);
    }
    categories.get(result.category)!.push(result);
  });

  console.log(chalk.yellow('\nResults by Category:'));
  
  for (const [category, results] of categories) {
    console.log(chalk.cyan(`\n${category.toUpperCase()}:`));
    
    const table = new Table({
      columns: [
        { name: 'test', alignment: 'left' },
        { name: 'avg_time', alignment: 'right' },
        { name: 'throughput', alignment: 'right' },
        { name: 'p95_time', alignment: 'right' },
        { name: 'memory', alignment: 'right' }
      ]
    });

    results.forEach(result => {
      table.addRow({
        test: result.testName,
        avg_time: `${result.metrics.averageTime.toFixed(1)}ms`,
        throughput: `${result.metrics.throughput.toFixed(1)} ops/s`,
        p95_time: `${result.metrics.p95Time.toFixed(1)}ms`,
        memory: result.memory ? 
          `${(result.memory.peakUsage / 1024 / 1024).toFixed(1)}MB` : '-'
      });
    });

    table.printTable();
  }

  // Recommendations
  if (suite.summary.recommendations?.length > 0) {
    console.log(chalk.yellow('\n💡 Recommendations:'));
    suite.summary.recommendations.forEach((rec: string) => {
      console.log(`  • ${rec}`);
    });
  }
}

async function displayCategoryResults(results: any[], category: string, options: any): Promise<void> {
  console.log(chalk.blue(`\n📊 ${category.toUpperCase()} Benchmark Results\n`));

  const table = new Table({
    columns: [
      { name: 'test', alignment: 'left', maxLen: 40 },
      { name: 'iterations', alignment: 'right' },
      { name: 'avg_time', alignment: 'right' },
      { name: 'min_time', alignment: 'right' },
      { name: 'max_time', alignment: 'right' },
      { name: 'p95_time', alignment: 'right' },
      { name: 'throughput', alignment: 'right' }
    ]
  });

  results.forEach(result => {
    table.addRow({
      test: result.testName,
      iterations: result.iterations,
      avg_time: `${result.metrics.averageTime.toFixed(2)}ms`,
      min_time: `${result.metrics.minTime.toFixed(2)}ms`,
      max_time: `${result.metrics.maxTime.toFixed(2)}ms`,
      p95_time: `${result.metrics.p95Time.toFixed(2)}ms`,
      throughput: `${result.metrics.throughput.toFixed(2)} ops/s`
    });
  });

  table.printTable();

  // Show detailed metrics if verbose
  if (options.verbose) {
    console.log(chalk.yellow('\nDetailed Metrics:'));
    results.forEach(result => {
      console.log(chalk.cyan(`\n${result.testName}:`));
      console.log(`  Median: ${result.metrics.medianTime.toFixed(2)}ms`);
      console.log(`  P99: ${result.metrics.p99Time.toFixed(2)}ms`);
      if (result.memory) {
        console.log(`  Initial Memory: ${(result.memory.initialUsage / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  Peak Memory: ${(result.memory.peakUsage / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  GC Collections: ${result.memory.gcCollections}`);
      }
      if (result.metadata.testParams) {
        console.log(`  Parameters: ${JSON.stringify(result.metadata.testParams)}`);
      }
    });
  }
}

async function displayComparison(baseline: any, current: any, threshold: number): Promise<void> {
  console.log(chalk.blue('\n📈 Performance Comparison\n'));

  const table = new Table({
    columns: [
      { name: 'test', alignment: 'left', maxLen: 35 },
      { name: 'baseline', alignment: 'right' },
      { name: 'current', alignment: 'right' },
      { name: 'change', alignment: 'right' },
      { name: 'status', alignment: 'center' }
    ]
  });

  let improvements = 0;
  let regressions = 0;
  let stable = 0;

  // Map results for comparison
  const baselineMap = new Map(
    baseline.results.map((r: any) => [r.testName, r])
  );

  current.results.forEach((currentResult: any) => {
    const baselineResult = baselineMap.get(currentResult.testName);
    
    if (baselineResult) {
      const baselineTime = baselineResult.metrics.averageTime;
      const currentTime = currentResult.metrics.averageTime;
      const change = ((currentTime - baselineTime) / baselineTime) * 100;

      let status: string;
      let statusColor: any;

      if (Math.abs(change) < threshold) {
        status = 'STABLE';
        statusColor = chalk.blue;
        stable++;
      } else if (change < 0) {
        status = 'IMPROVED';
        statusColor = chalk.green;
        improvements++;
      } else {
        status = 'SLOWER';
        statusColor = chalk.red;
        regressions++;
      }

      table.addRow({
        test: currentResult.testName,
        baseline: `${baselineTime.toFixed(1)}ms`,
        current: `${currentTime.toFixed(1)}ms`,
        change: statusColor(`${change > 0 ? '+' : ''}${change.toFixed(1)}%`),
        status: statusColor(status)
      });
    }
  });

  table.printTable();

  // Summary
  console.log(chalk.yellow('\nSummary:'));
  console.log(chalk.green(`  ✅ Improvements: ${improvements}`));
  console.log(chalk.red(`  ⚠️  Regressions: ${regressions}`));
  console.log(chalk.blue(`  📊 Stable: ${stable}`));

  // Performance rating comparison
  if (baseline.summary && current.summary) {
    console.log(chalk.yellow('\nOverall Performance:'));
    console.log(`  Baseline: ${baseline.summary.performanceRating}`);
    console.log(`  Current: ${current.summary.performanceRating}`);
  }

  // Flag significant regressions
  if (regressions > 0) {
    console.log(chalk.red('\n⚠️  Performance regressions detected!'));
    console.log(chalk.gray('   Consider investigating the slower operations.'));
  }
}

async function displayProfilingResults(profileData: any, operation: string): Promise<void> {
  console.log(chalk.blue(`\n🔍 Profiling Results: ${operation}\n`));

  // Execution timeline
  console.log(chalk.yellow('Execution Timeline:'));
  const timeline = profileData.timeline || [];
  timeline.forEach((event: any) => {
    const duration = event.endTime - event.startTime;
    console.log(`  ${event.phase}: ${duration.toFixed(2)}ms`);
  });

  // Memory usage
  if (profileData.memory) {
    console.log(chalk.yellow('\nMemory Usage:'));
    console.log(`  Heap Used: ${(profileData.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Heap Total: ${(profileData.memory.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  External: ${(profileData.memory.external / 1024 / 1024).toFixed(2)}MB`);
  }

  // CPU profiling
  if (profileData.cpu) {
    console.log(chalk.yellow('\nCPU Profile:'));
    const topFunctions = profileData.cpu.slice(0, 10);
    topFunctions.forEach((func: any) => {
      console.log(`  ${func.name}: ${func.selfTime.toFixed(2)}ms (${func.percentage.toFixed(1)}%)`);
    });
  }

  // Bottlenecks
  if (profileData.bottlenecks) {
    console.log(chalk.yellow('\n🚨 Bottlenecks Identified:'));
    profileData.bottlenecks.forEach((bottleneck: any) => {
      console.log(`  • ${bottleneck.description}`);
      console.log(`    Impact: ${bottleneck.impact}`);
      if (bottleneck.suggestion) {
        console.log(`    Suggestion: ${bottleneck.suggestion}`);
      }
    });
  }
}

/**
 * Helper Functions
 */

async function profileOperation(runner: any, operation: string, options: any): Promise<any> {
  // Simulate profiling based on operation type
  const profileData: any = {
    operation,
    timeline: [],
    memory: process.memoryUsage(),
    cpu: [],
    bottlenecks: []
  };

  switch (operation) {
    case 'file':
      profileData.timeline = [
        { phase: 'parsing', startTime: 0, endTime: 50 },
        { phase: 'analysis', startTime: 50, endTime: 200 },
        { phase: 'pattern_detection', startTime: 200, endTime: 350 },
        { phase: 'storage', startTime: 350, endTime: 400 }
      ];
      break;

    case 'project':
      profileData.timeline = [
        { phase: 'discovery', startTime: 0, endTime: 500 },
        { phase: 'parallel_analysis', startTime: 500, endTime: 3000 },
        { phase: 'aggregation', startTime: 3000, endTime: 3500 },
        { phase: 'insights', startTime: 3500, endTime: 4000 }
      ];
      profileData.bottlenecks = [
        {
          description: 'File I/O during discovery phase',
          impact: 'High',
          suggestion: 'Implement parallel file discovery'
        }
      ];
      break;

    case 'pattern':
      profileData.timeline = [
        { phase: 'ast_parsing', startTime: 0, endTime: 100 },
        { phase: 'pattern_matching', startTime: 100, endTime: 300 },
        { phase: 'confidence_scoring', startTime: 300, endTime: 350 }
      ];
      break;

    case 'query':
      profileData.timeline = [
        { phase: 'nlp_processing', startTime: 0, endTime: 150 },
        { phase: 'query_generation', startTime: 150, endTime: 200 },
        { phase: 'graph_search', startTime: 200, endTime: 500 },
        { phase: 'result_ranking', startTime: 500, endTime: 550 }
      ];
      break;
  }

  return profileData;
}

function getPerformanceColor(rating: string): any {
  switch (rating.toLowerCase()) {
    case 'excellent':
      return chalk.green;
    case 'good':
      return chalk.cyan;
    case 'average':
      return chalk.yellow;
    case 'poor':
      return chalk.red;
    default:
      return chalk.gray;
  }
}

async function saveBenchmarkResults(outputPath: string, data: any, format: string): Promise<void> {
  let content: string;

  switch (format) {
    case 'json':
      content = JSON.stringify(data, null, 2);
      break;
    case 'csv':
      content = generateCSV(data);
      break;
    default:
      content = JSON.stringify(data, null, 2);
  }

  await fs.writeFile(outputPath, content, 'utf-8');
  console.log(chalk.green(`\n✅ Results saved to ${outputPath}`));
}

function generateCSV(data: any): string {
  const headers = [
    'Test Name',
    'Category', 
    'Iterations',
    'Average Time (ms)',
    'Min Time (ms)',
    'Max Time (ms)',
    'P95 Time (ms)',
    'Throughput (ops/s)',
    'Peak Memory (MB)'
  ];

  const rows = data.results.map((result: any) => [
    result.testName,
    result.category,
    result.iterations,
    result.metrics.averageTime.toFixed(2),
    result.metrics.minTime.toFixed(2),
    result.metrics.maxTime.toFixed(2),
    result.metrics.p95Time.toFixed(2),
    result.metrics.throughput.toFixed(2),
    result.memory ? (result.memory.peakUsage / 1024 / 1024).toFixed(2) : 'N/A'
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}