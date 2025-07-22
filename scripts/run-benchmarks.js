#!/usr/bin/env node

/**
 * KB-MCP Benchmark CLI
 * Command-line interface for running performance benchmarks
 */

import { BenchmarkRunner } from '../src/benchmarks/benchmark-runner.js';
import { program } from 'commander';
import chalk from 'chalk';

// Configure CLI
program
  .name('kb-mcp-benchmark')
  .description('Run performance benchmarks for KB-MCP analysis engine')
  .version('1.0.0');

program
  .option('-i, --iterations <number>', 'Number of iterations per test', '10')
  .option('-w, --warmup <number>', 'Number of warmup runs', '3')
  .option('-c, --category <category>', 'Run specific category (core|patterns|debt|nlq|scalability|graph)')
  .option('--no-memory', 'Disable memory profiling')
  .option('--no-save', 'Don\'t save results to file')
  .option('-f, --format <format>', 'Output format (console|json|csv)', 'console')
  .option('-q, --quick', 'Quick benchmark with fewer iterations')
  .option('-v, --verbose', 'Verbose output with detailed metrics')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 KB-MCP Analysis Engine Benchmark Suite\n'));

    // Parse options
    const benchmarkOptions = {
      iterations: options.quick ? 3 : parseInt(options.iterations),
      warmupRuns: options.quick ? 1 : parseInt(options.warmup),
      includeMemoryProfiling: options.memory !== false,
      includeDetailedMetrics: options.verbose || false,
      outputFormat: options.format,
      saveResults: options.save !== false
    };

    console.log(chalk.gray('Configuration:'));
    console.log(chalk.gray(`  Iterations: ${benchmarkOptions.iterations}`));
    console.log(chalk.gray(`  Warmup runs: ${benchmarkOptions.warmupRuns}`));
    console.log(chalk.gray(`  Memory profiling: ${benchmarkOptions.includeMemoryProfiling ? 'enabled' : 'disabled'}`));
    console.log(chalk.gray(`  Save results: ${benchmarkOptions.saveResults ? 'yes' : 'no'}`));
    console.log('');

    try {
      const runner = new BenchmarkRunner(benchmarkOptions);

      if (options.category) {
        console.log(chalk.yellow(`Running ${options.category} benchmarks...\n`));
        const result = await runner.runBenchmarkCategory(options.category);
        
        if (!result.success) {
          console.error(chalk.red('Benchmark failed:'), result.error?.message);
          process.exit(1);
        }

        console.log(chalk.green(`\n✅ ${options.category} benchmarks completed successfully!`));
      } else {
        console.log(chalk.yellow('Running full benchmark suite...\n'));
        const result = await runner.runAllBenchmarks();
        
        if (!result.success) {
          console.error(chalk.red('Benchmark failed:'), result.error?.message);
          process.exit(1);
        }

        console.log(chalk.green('\n✅ All benchmarks completed successfully!'));
      }
    } catch (error) {
      console.error(chalk.red('Error running benchmarks:'), error.message);
      process.exit(1);
    }
  });

// Add specific benchmark commands
program
  .command('core')
  .description('Run core analysis benchmarks')
  .action(async () => {
    await runCategory('core');
  });

program
  .command('patterns')
  .description('Run pattern detection benchmarks')
  .action(async () => {
    await runCategory('patterns');
  });

program
  .command('debt')
  .description('Run technical debt analysis benchmarks')
  .action(async () => {
    await runCategory('debt');
  });

program
  .command('nlq')
  .description('Run natural language query benchmarks')
  .action(async () => {
    await runCategory('nlq');
  });

program
  .command('scalability')
  .description('Run scalability benchmarks')
  .action(async () => {
    await runCategory('scalability');
  });

program
  .command('graph')
  .description('Run graph operations benchmarks')
  .action(async () => {
    await runCategory('graph');
  });

program
  .command('compare')
  .description('Compare with previous benchmark results')
  .option('-b, --baseline <file>', 'Baseline benchmark file to compare against')
  .action(async (options) => {
    console.log(chalk.blue.bold('📊 Benchmark Comparison\n'));
    
    if (!options.baseline) {
      console.error(chalk.red('Error: Baseline file required for comparison'));
      console.log(chalk.gray('Usage: npm run benchmark compare -b benchmarks/baseline.json'));
      process.exit(1);
    }

    try {
      // Run current benchmarks
      const runner = new BenchmarkRunner({ iterations: 5, saveResults: false });
      const currentResult = await runner.runAllBenchmarks();
      
      if (!currentResult.success) {
        console.error(chalk.red('Failed to run current benchmarks'));
        process.exit(1);
      }

      // Load baseline results
      const fs = await import('fs/promises');
      const baselineData = JSON.parse(await fs.readFile(options.baseline, 'utf8'));
      
      // Compare results
      compareResults(baselineData.results, currentResult.data.results);
      
    } catch (error) {
      console.error(chalk.red('Error during comparison:'), error.message);
      process.exit(1);
    }
  });

program
  .command('profile')
  .description('Run detailed performance profiling')
  .option('-t, --test <name>', 'Profile specific test')
  .action(async (options) => {
    console.log(chalk.blue.bold('🔍 Performance Profiling\n'));
    
    // Enable detailed profiling
    const runner = new BenchmarkRunner({
      iterations: 20,
      includeDetailedMetrics: true,
      includeMemoryProfiling: true
    });

    if (options.test) {
      console.log(chalk.yellow(`Profiling test: ${options.test}\n`));
      // Profile specific test (would need implementation)
    } else {
      console.log(chalk.yellow('Running full profiling suite...\n'));
      const result = await runner.runAllBenchmarks();
      
      if (result.success) {
        generateProfilingReport(result.data);
      }
    }
  });

/**
 * Run specific benchmark category
 */
async function runCategory(category) {
  console.log(chalk.blue.bold(`🚀 KB-MCP ${category.toUpperCase()} Benchmarks\n`));
  
  try {
    const runner = new BenchmarkRunner();
    const result = await runner.runBenchmarkCategory(category);
    
    if (!result.success) {
      console.error(chalk.red('Benchmark failed:'), result.error?.message);
      process.exit(1);
    }

    console.log(chalk.green(`\n✅ ${category} benchmarks completed successfully!`));
  } catch (error) {
    console.error(chalk.red('Error running benchmarks:'), error.message);
    process.exit(1);
  }
}

/**
 * Compare benchmark results
 */
function compareResults(baseline, current) {
  console.log(chalk.blue('📈 Performance Comparison Results\n'));
  console.log('='.repeat(80));
  console.log('Test Name'.padEnd(30) + 'Baseline'.padEnd(15) + 'Current'.padEnd(15) + 'Change'.padEnd(15) + 'Status');
  console.log('='.repeat(80));

  const testMap = new Map(current.map(test => [test.testName, test]));

  for (const baselineTest of baseline) {
    const currentTest = testMap.get(baselineTest.testName);
    
    if (!currentTest) {
      console.log(
        baselineTest.testName.padEnd(30) +
        `${baselineTest.metrics.averageTime.toFixed(1)}ms`.padEnd(15) +
        'N/A'.padEnd(15) +
        'N/A'.padEnd(15) +
        chalk.gray('MISSING')
      );
      continue;
    }

    const baselineTime = baselineTest.metrics.averageTime;
    const currentTime = currentTest.metrics.averageTime;
    const change = ((currentTime - baselineTime) / baselineTime) * 100;
    
    let status;
    let changeColor;
    
    if (Math.abs(change) < 5) {
      status = 'STABLE';
      changeColor = chalk.blue;
    } else if (change < 0) {
      status = 'IMPROVED';
      changeColor = chalk.green;
    } else {
      status = 'SLOWER';
      changeColor = chalk.red;
    }

    console.log(
      baselineTest.testName.padEnd(30) +
      `${baselineTime.toFixed(1)}ms`.padEnd(15) +
      `${currentTime.toFixed(1)}ms`.padEnd(15) +
      changeColor(`${change > 0 ? '+' : ''}${change.toFixed(1)}%`).padEnd(15) +
      changeColor(status)
    );
  }

  console.log('='.repeat(80));
  
  // Summary
  const improvements = current.filter(test => {
    const baseline = baseline.find(b => b.testName === test.testName);
    return baseline && test.metrics.averageTime < baseline.metrics.averageTime;
  }).length;

  const regressions = current.filter(test => {
    const baseline = baseline.find(b => b.testName === test.testName);
    return baseline && test.metrics.averageTime > baseline.metrics.averageTime * 1.05;
  }).length;

  console.log(chalk.green(`\n✅ Improvements: ${improvements}`));
  console.log(chalk.red(`⚠️ Regressions: ${regressions}`));
  console.log(chalk.blue(`📊 Stable: ${current.length - improvements - regressions}`));
}

/**
 * Generate detailed profiling report
 */
function generateProfilingReport(suite) {
  console.log(chalk.blue('\n🔍 Detailed Performance Profile\n'));

  // Find slowest operations
  const slowestTests = suite.results
    .sort((a, b) => b.metrics.averageTime - a.metrics.averageTime)
    .slice(0, 5);

  console.log(chalk.yellow('🐌 Slowest Operations:'));
  for (const test of slowestTests) {
    console.log(`  ${test.testName}: ${test.metrics.averageTime.toFixed(1)}ms`);
  }

  // Find most memory intensive
  const memoryTests = suite.results
    .filter(test => test.memory)
    .sort((a, b) => (b.memory?.peakUsage || 0) - (a.memory?.peakUsage || 0))
    .slice(0, 5);

  if (memoryTests.length > 0) {
    console.log(chalk.yellow('\n🧠 Most Memory Intensive:'));
    for (const test of memoryTests) {
      const memoryMB = (test.memory!.peakUsage / 1024 / 1024).toFixed(1);
      console.log(`  ${test.testName}: ${memoryMB}MB`);
    }
  }

  // Find most variable performance
  const variableTests = suite.results
    .map(test => ({
      ...test,
      variance: (test.metrics.maxTime - test.metrics.minTime) / test.metrics.averageTime
    }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 5);

  console.log(chalk.yellow('\n📊 Most Variable Performance:'));
  for (const test of variableTests) {
    console.log(`  ${test.testName}: ${(test.variance * 100).toFixed(1)}% variance`);
  }

  console.log(chalk.blue('\n📋 Optimization Recommendations:'));
  for (const recommendation of suite.summary.recommendations) {
    console.log(`  • ${recommendation}`);
  }
}

// Parse command line arguments
program.parse();

// If no command was specified, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}