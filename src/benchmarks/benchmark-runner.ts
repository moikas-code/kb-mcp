/**
 * Benchmark Runner for KB-MCP Analysis Engine
 * Comprehensive performance testing and profiling
 */

import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import path from 'path';
import { AnalysisEngine } from '../analysis/analysis-engine.js';
import { UnifiedMemory } from '../graph/unified-memory.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface BenchmarkOptions {
  iterations?: number;
  warmupRuns?: number;
  includeMemoryProfiling?: boolean;
  includeDetailedMetrics?: boolean;
  outputFormat?: 'console' | 'json' | 'csv';
  saveResults?: boolean;
  testDataPath?: string;
}

export interface BenchmarkResult {
  testName: string;
  category: string;
  iterations: number;
  metrics: {
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    medianTime: number;
    p95Time: number;
    p99Time: number;
    throughput: number; // operations per second
  };
  memory?: {
    initialUsage: number;
    peakUsage: number;
    finalUsage: number;
    gcCollections: number;
  };
  metadata: {
    timestamp: string;
    nodeVersion: string;
    platform: string;
    cpuInfo: string;
    testParams: Record<string, any>;
  };
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  results: BenchmarkResult[];
  summary: {
    totalTests: number;
    totalTime: number;
    averagePerformance: number;
    performanceRating: 'excellent' | 'good' | 'average' | 'poor';
    recommendations: string[];
  };
}

export class BenchmarkRunner {
  private analysisEngine: AnalysisEngine | null = null;
  private testData: Map<string, any> = new Map();
  private results: BenchmarkResult[] = [];

  constructor(private options: BenchmarkOptions = {}) {
    this.options = {
      iterations: 10,
      warmupRuns: 3,
      includeMemoryProfiling: true,
      includeDetailedMetrics: true,
      outputFormat: 'console',
      saveResults: true,
      ...options
    };
  }

  /**
   * Initialize benchmark environment
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Initialize analysis engine with test configuration
      const memory = new UnifiedMemory({
        enableGraph: true,
        enableVector: true,
        enableTemporal: true,
        enableWorking: true
      });

      await memory.initialize();

      this.analysisEngine = new AnalysisEngine(memory, {
        enableRealTimeAnalysis: false, // Disable for benchmarking
        enablePatternDetection: true,
        enableDebtAnalysis: true,
        enableInsightsGeneration: true,
        enableNaturalLanguageQueries: true,
        analysisDepth: 'detailed'
      });

      // Load test data
      await this.loadTestData();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'initialize' })
      };
    }
  }

  /**
   * Run all benchmarks
   */
  async runAllBenchmarks(): Promise<Result<BenchmarkSuite>> {
    try {
      console.log('🚀 Starting KB-MCP Performance Benchmarks...\n');

      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult as any;
      }

      const suiteResults: BenchmarkResult[] = [];

      // Core Analysis Benchmarks
      console.log('📊 Running Core Analysis Benchmarks...');
      const coreResults = await this.runCoreAnalysisBenchmarks();
      suiteResults.push(...coreResults);

      // Pattern Detection Benchmarks
      console.log('🔍 Running Pattern Detection Benchmarks...');
      const patternResults = await this.runPatternDetectionBenchmarks();
      suiteResults.push(...patternResults);

      // Technical Debt Benchmarks
      console.log('💸 Running Technical Debt Analysis Benchmarks...');
      const debtResults = await this.runTechnicalDebtBenchmarks();
      suiteResults.push(...debtResults);

      // Natural Language Query Benchmarks
      console.log('🗣️ Running Natural Language Query Benchmarks...');
      const nlqResults = await this.runNaturalLanguageQueryBenchmarks();
      suiteResults.push(...nlqResults);

      // Memory and Scalability Benchmarks
      console.log('📈 Running Scalability Benchmarks...');
      const scalabilityResults = await this.runScalabilityBenchmarks();
      suiteResults.push(...scalabilityResults);

      // Graph Operations Benchmarks
      console.log('🕸️ Running Graph Operations Benchmarks...');
      const graphResults = await this.runGraphOperationsBenchmarks();
      suiteResults.push(...graphResults);

      const suite: BenchmarkSuite = {
        name: 'KB-MCP Analysis Engine Benchmark Suite',
        description: 'Comprehensive performance testing of code analysis capabilities',
        results: suiteResults,
        summary: this.generateSummary(suiteResults)
      };

      // Save results if requested
      if (this.options.saveResults) {
        await this.saveResults(suite);
      }

      // Output results
      this.outputResults(suite);

      return { success: true, data: suite };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'runAllBenchmarks' })
      };
    }
  }

  /**
   * Run specific benchmark category
   */
  async runBenchmarkCategory(category: string): Promise<Result<BenchmarkResult[]>> {
    try {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult as any;
      }

      let results: BenchmarkResult[] = [];

      switch (category) {
        case 'core':
          results = await this.runCoreAnalysisBenchmarks();
          break;
        case 'patterns':
          results = await this.runPatternDetectionBenchmarks();
          break;
        case 'debt':
          results = await this.runTechnicalDebtBenchmarks();
          break;
        case 'nlq':
          results = await this.runNaturalLanguageQueryBenchmarks();
          break;
        case 'scalability':
          results = await this.runScalabilityBenchmarks();
          break;
        case 'graph':
          results = await this.runGraphOperationsBenchmarks();
          break;
        default:
          throw new Error(`Unknown benchmark category: ${category}`);
      }

      return { success: true, data: results };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'runBenchmarkCategory' })
      };
    }
  }

  /**
   * Core Analysis Benchmarks
   */
  private async runCoreAnalysisBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Single file analysis benchmark
    const singleFileResult = await this.runBenchmark(
      'single-file-analysis',
      'core',
      async () => {
        const testFile = this.testData.get('mediumFile');
        return await this.analysisEngine!.analyzeFile(testFile.path, testFile.content);
      },
      { fileSize: 'medium', complexity: 'moderate' }
    );
    results.push(singleFileResult);

    // Project analysis benchmark
    const projectResult = await this.runBenchmark(
      'project-analysis',
      'core',
      async () => {
        const testProject = this.testData.get('smallProject');
        return await this.analysisEngine!.analyzeProject(testProject.path);
      },
      { projectSize: 'small', fileCount: 25 }
    );
    results.push(projectResult);

    // Comprehensive analysis benchmark
    const comprehensiveResult = await this.runBenchmark(
      'comprehensive-analysis',
      'core',
      async () => {
        const testProject = this.testData.get('mediumProject');
        return await this.analysisEngine!.analyzeProject(testProject.path, {
          includeTests: true,
          maxDepth: 5,
          languages: ['typescript', 'javascript']
        });
      },
      { projectSize: 'medium', comprehensive: true }
    );
    results.push(comprehensiveResult);

    return results;
  }

  /**
   * Pattern Detection Benchmarks
   */
  private async runPatternDetectionBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Anti-pattern detection
    const antiPatternResult = await this.runBenchmark(
      'anti-pattern-detection',
      'patterns',
      async () => {
        const testProject = this.testData.get('complexProject');
        const analysis = await this.analysisEngine!.analyzeProject(testProject.path);
        return analysis.success ? analysis.data.patterns.filter(p => p.type === 'anti_pattern') : [];
      },
      { patternType: 'anti-patterns', complexity: 'high' }
    );
    results.push(antiPatternResult);

    // Design pattern detection
    const designPatternResult = await this.runBenchmark(
      'design-pattern-detection',
      'patterns',
      async () => {
        const testProject = this.testData.get('wellStructuredProject');
        const analysis = await this.analysisEngine!.analyzeProject(testProject.path);
        return analysis.success ? analysis.data.patterns.filter(p => p.type === 'design_pattern') : [];
      },
      { patternType: 'design-patterns', structure: 'well-organized' }
    );
    results.push(designPatternResult);

    // Code smell detection
    const codeSmellResult = await this.runBenchmark(
      'code-smell-detection',
      'patterns',
      async () => {
        const testProject = this.testData.get('legacyProject');
        const analysis = await this.analysisEngine!.analyzeProject(testProject.path);
        return analysis.success ? analysis.data.patterns.filter(p => p.type === 'code_smell') : [];
      },
      { patternType: 'code-smells', codeQuality: 'legacy' }
    );
    results.push(codeSmellResult);

    return results;
  }

  /**
   * Technical Debt Benchmarks
   */
  private async runTechnicalDebtBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Basic debt analysis
    const basicDebtResult = await this.runBenchmark(
      'basic-debt-analysis',
      'debt',
      async () => {
        const testProject = this.testData.get('mediumProject');
        const analysis = await this.analysisEngine!.analyzeProject(testProject.path);
        return analysis.success ? analysis.data.technicalDebt : null;
      },
      { analysisType: 'basic', scope: 'project' }
    );
    results.push(basicDebtResult);

    // Comprehensive debt analysis
    const comprehensiveDebtResult = await this.runBenchmark(
      'comprehensive-debt-analysis',
      'debt',
      async () => {
        const testProject = this.testData.get('largeProject');
        const analysis = await this.analysisEngine!.analyzeProject(testProject.path, {
          includeTests: true,
          maxDepth: 10
        });
        return analysis.success ? analysis.data.technicalDebt : null;
      },
      { analysisType: 'comprehensive', scope: 'large-project' }
    );
    results.push(comprehensiveDebtResult);

    return results;
  }

  /**
   * Natural Language Query Benchmarks
   */
  private async runNaturalLanguageQueryBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    const testQueries = [
      'What are the most complex functions?',
      'Find all classes that implement Service interface',
      'Show me functions with high technical debt',
      'Which modules have circular dependencies?',
      'Find all anti-patterns in the codebase'
    ];

    for (const query of testQueries) {
      const queryResult = await this.runBenchmark(
        `nlq-${query.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        'nlq',
        async () => {
          return await this.analysisEngine!.processQuery(query, {
            includeContext: true,
            includeExplanations: true,
            includeSuggestions: true,
            maxResults: 10
          });
        },
        { query, queryType: 'semantic' }
      );
      results.push(queryResult);
    }

    return results;
  }

  /**
   * Scalability Benchmarks
   */
  private async runScalabilityBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Large file analysis
    const largeFileResult = await this.runBenchmark(
      'large-file-analysis',
      'scalability',
      async () => {
        const testFile = this.testData.get('largeFile');
        return await this.analysisEngine!.analyzeFile(testFile.path, testFile.content);
      },
      { fileSize: 'large', lines: 5000 }
    );
    results.push(largeFileResult);

    // Many files analysis
    const manyFilesResult = await this.runBenchmark(
      'many-files-analysis',
      'scalability',
      async () => {
        const testProject = this.testData.get('manyFilesProject');
        return await this.analysisEngine!.analyzeProject(testProject.path);
      },
      { fileCount: 200, projectSize: 'large' }
    );
    results.push(manyFilesResult);

    // Deep project analysis
    const deepProjectResult = await this.runBenchmark(
      'deep-project-analysis',
      'scalability',
      async () => {
        const testProject = this.testData.get('deepProject');
        return await this.analysisEngine!.analyzeProject(testProject.path, {
          maxDepth: 15
        });
      },
      { depth: 15, nesting: 'deep' }
    );
    results.push(deepProjectResult);

    return results;
  }

  /**
   * Graph Operations Benchmarks
   */
  private async runGraphOperationsBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Entity creation benchmark
    const entityCreationResult = await this.runBenchmark(
      'entity-creation',
      'graph',
      async () => {
        // Create 1000 entities and measure performance
        const entities = this.generateTestEntities(1000);
        for (const entity of entities) {
          await this.analysisEngine!['memory'].graph.createNode(
            entity.type,
            entity.properties
          );
        }
        return entities.length;
      },
      { entityCount: 1000, operation: 'create' }
    );
    results.push(entityCreationResult);

    // Relationship creation benchmark
    const relationshipCreationResult = await this.runBenchmark(
      'relationship-creation',
      'graph',
      async () => {
        // Create 500 relationships and measure performance
        const relationships = this.generateTestRelationships(500);
        for (const rel of relationships) {
          await this.analysisEngine!['memory'].graph.createEdge(
            rel.sourceId,
            rel.targetId,
            rel.type,
            rel.metadata
          );
        }
        return relationships.length;
      },
      { relationshipCount: 500, operation: 'create' }
    );
    results.push(relationshipCreationResult);

    // Complex query benchmark
    const complexQueryResult = await this.runBenchmark(
      'complex-graph-query',
      'graph',
      async () => {
        const query = `
          MATCH (f:Function)-[:CALLS*2..4]->(target:Function)
          WHERE f.complexity > 10
          RETURN f, target, length(()-[:CALLS*]-(target)) as callDepth
          ORDER BY callDepth DESC
          LIMIT 50
        `;
        return await this.analysisEngine!['memory'].graph.query(query);
      },
      { queryType: 'complex', depth: 4 }
    );
    results.push(complexQueryResult);

    return results;
  }

  /**
   * Run individual benchmark
   */
  private async runBenchmark(
    testName: string,
    category: string,
    operation: () => Promise<any>,
    testParams: Record<string, any> = {}
  ): Promise<BenchmarkResult> {
    console.log(`  Running ${testName}...`);

    const times: number[] = [];
    let initialMemory = 0;
    let peakMemory = 0;
    let finalMemory = 0;
    let gcCollections = 0;

    // Track memory if enabled
    if (this.options.includeMemoryProfiling) {
      initialMemory = process.memoryUsage().heapUsed;
    }

    // Warmup runs
    for (let i = 0; i < this.options.warmupRuns!; i++) {
      await operation();
    }

    // Actual benchmark runs
    for (let i = 0; i < this.options.iterations!; i++) {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        gcCollections++;
      }

      const startTime = performance.now();
      await operation();
      const endTime = performance.now();

      times.push(endTime - startTime);

      // Track peak memory
      if (this.options.includeMemoryProfiling) {
        const currentMemory = process.memoryUsage().heapUsed;
        peakMemory = Math.max(peakMemory, currentMemory);
      }
    }

    if (this.options.includeMemoryProfiling) {
      finalMemory = process.memoryUsage().heapUsed;
    }

    // Calculate statistics
    times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / times.length;
    const medianTime = times[Math.floor(times.length / 2)];
    const p95Time = times[Math.floor(times.length * 0.95)];
    const p99Time = times[Math.floor(times.length * 0.99)];

    const result: BenchmarkResult = {
      testName,
      category,
      iterations: this.options.iterations!,
      metrics: {
        totalTime,
        averageTime,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        medianTime,
        p95Time,
        p99Time,
        throughput: 1000 / averageTime // operations per second
      },
      metadata: {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: `${process.platform} ${process.arch}`,
        cpuInfo: this.getCpuInfo(),
        testParams
      }
    };

    if (this.options.includeMemoryProfiling) {
      result.memory = {
        initialUsage: initialMemory,
        peakUsage: peakMemory,
        finalUsage: finalMemory,
        gcCollections
      };
    }

    return result;
  }

  /**
   * Load test data for benchmarks
   */
  private async loadTestData(): Promise<void> {
    // Generate or load test data for different scenarios
    this.testData.set('mediumFile', {
      path: '/test/medium-file.ts',
      content: this.generateTestFileContent(1000), // 1000 lines
      size: 'medium'
    });

    this.testData.set('largeFile', {
      path: '/test/large-file.ts',
      content: this.generateTestFileContent(5000), // 5000 lines
      size: 'large'
    });

    // Mock project structures
    this.testData.set('smallProject', {
      path: '/test/small-project',
      fileCount: 25,
      size: 'small'
    });

    this.testData.set('mediumProject', {
      path: '/test/medium-project',
      fileCount: 100,
      size: 'medium'
    });

    this.testData.set('largeProject', {
      path: '/test/large-project',
      fileCount: 500,
      size: 'large'
    });

    this.testData.set('complexProject', {
      path: '/test/complex-project',
      fileCount: 150,
      complexity: 'high'
    });

    this.testData.set('wellStructuredProject', {
      path: '/test/well-structured-project',
      fileCount: 80,
      structure: 'good'
    });

    this.testData.set('legacyProject', {
      path: '/test/legacy-project',
      fileCount: 200,
      quality: 'legacy'
    });

    this.testData.set('manyFilesProject', {
      path: '/test/many-files-project',
      fileCount: 300,
      depth: 'shallow'
    });

    this.testData.set('deepProject', {
      path: '/test/deep-project',
      fileCount: 100,
      depth: 'deep'
    });
  }

  /**
   * Generate test file content
   */
  private generateTestFileContent(lines: number): string {
    const content = [];
    content.push('/**');
    content.push(' * Test file for benchmarking');
    content.push(' */');
    content.push('');
    content.push('export class TestClass {');
    content.push('  private data: Map<string, any> = new Map();');
    content.push('');

    for (let i = 0; i < lines - 20; i++) {
      if (i % 20 === 0) {
        content.push(`  method${Math.floor(i / 20)}() {`);
        content.push('    let result = 0;');
      } else if (i % 20 === 10) {
        content.push('    for (let j = 0; j < 100; j++) {');
        content.push('      result += j * Math.random();');
        content.push('    }');
      } else if (i % 20 === 19) {
        content.push('    return result;');
        content.push('  }');
        content.push('');
      } else {
        content.push(`    // Line ${i}: Processing data and calculations`);
      }
    }

    content.push('}');
    return content.join('\n');
  }

  /**
   * Generate test entities for graph benchmarks
   */
  private generateTestEntities(count: number): any[] {
    const entities = [];
    for (let i = 0; i < count; i++) {
      entities.push({
        type: i % 3 === 0 ? 'Function' : i % 3 === 1 ? 'Class' : 'Module',
        properties: {
          id: `entity_${i}`,
          name: `TestEntity${i}`,
          complexity: Math.floor(Math.random() * 20),
          line: Math.floor(Math.random() * 1000),
          file_path: `/test/file${Math.floor(i / 10)}.ts`
        }
      });
    }
    return entities;
  }

  /**
   * Generate test relationships for graph benchmarks
   */
  private generateTestRelationships(count: number): any[] {
    const relationships = [];
    for (let i = 0; i < count; i++) {
      relationships.push({
        sourceId: `entity_${i}`,
        targetId: `entity_${(i + 1) % count}`,
        type: i % 2 === 0 ? 'CALLS' : 'DEPENDS_ON',
        metadata: {
          weight: Math.random(),
          line: Math.floor(Math.random() * 100)
        }
      });
    }
    return relationships;
  }

  /**
   * Generate benchmark summary
   */
  private generateSummary(results: BenchmarkResult[]): BenchmarkSuite['summary'] {
    const totalTime = results.reduce((sum, r) => sum + r.metrics.totalTime, 0);
    const averagePerformance = results.reduce((sum, r) => sum + r.metrics.throughput, 0) / results.length;

    // Performance rating based on throughput
    let performanceRating: 'excellent' | 'good' | 'average' | 'poor';
    if (averagePerformance > 100) performanceRating = 'excellent';
    else if (averagePerformance > 50) performanceRating = 'good';
    else if (averagePerformance > 20) performanceRating = 'average';
    else performanceRating = 'poor';

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (performanceRating === 'poor') {
      recommendations.push('Consider optimizing slow operations');
      recommendations.push('Enable parallel processing for large projects');
    }
    
    if (results.some(r => r.memory && r.memory.peakUsage > 1024 * 1024 * 1024)) {
      recommendations.push('Memory usage is high - consider implementing streaming analysis');
    }
    
    if (results.some(r => r.metrics.p95Time > r.metrics.averageTime * 3)) {
      recommendations.push('High variance in performance - investigate inconsistent operations');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is good - maintain current optimization level');
    }

    return {
      totalTests: results.length,
      totalTime,
      averagePerformance,
      performanceRating,
      recommendations
    };
  }

  /**
   * Save benchmark results
   */
  private async saveResults(suite: BenchmarkSuite): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `benchmark-results-${timestamp}.json`;
    const filePath = path.join(process.cwd(), 'benchmarks', filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Save detailed results
    await fs.writeFile(filePath, JSON.stringify(suite, null, 2));

    // Save summary CSV
    const csvPath = path.join(process.cwd(), 'benchmarks', `summary-${timestamp}.csv`);
    const csvContent = this.generateCsvSummary(suite.results);
    await fs.writeFile(csvPath, csvContent);

    console.log(`\n📁 Results saved to: ${filePath}`);
    console.log(`📊 CSV summary saved to: ${csvPath}`);
  }

  /**
   * Generate CSV summary
   */
  private generateCsvSummary(results: BenchmarkResult[]): string {
    const headers = [
      'Test Name',
      'Category',
      'Average Time (ms)',
      'Throughput (ops/s)',
      'P95 Time (ms)',
      'Memory Peak (MB)'
    ];

    const rows = results.map(result => [
      result.testName,
      result.category,
      result.metrics.averageTime.toFixed(2),
      result.metrics.throughput.toFixed(2),
      result.metrics.p95Time.toFixed(2),
      result.memory ? (result.memory.peakUsage / 1024 / 1024).toFixed(2) : 'N/A'
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Output benchmark results
   */
  private outputResults(suite: BenchmarkSuite): void {
    console.log('\n🎯 Benchmark Results Summary');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${suite.summary.totalTests}`);
    console.log(`Total Time: ${(suite.summary.totalTime / 1000).toFixed(2)}s`);
    console.log(`Average Performance: ${suite.summary.averagePerformance.toFixed(2)} ops/s`);
    console.log(`Performance Rating: ${suite.summary.performanceRating.toUpperCase()}`);
    
    console.log('\n📊 Individual Test Results:');
    console.log('-'.repeat(100));
    console.log('Test Name'.padEnd(30) + 'Category'.padEnd(15) + 'Avg Time'.padEnd(12) + 'Throughput'.padEnd(12) + 'P95 Time'.padEnd(12) + 'Memory Peak');
    console.log('-'.repeat(100));

    for (const result of suite.results) {
      const name = result.testName.padEnd(30);
      const category = result.category.padEnd(15);
      const avgTime = `${result.metrics.averageTime.toFixed(1)}ms`.padEnd(12);
      const throughput = `${result.metrics.throughput.toFixed(1)} ops/s`.padEnd(12);
      const p95Time = `${result.metrics.p95Time.toFixed(1)}ms`.padEnd(12);
      const memoryPeak = result.memory ? `${(result.memory.peakUsage / 1024 / 1024).toFixed(1)}MB` : 'N/A';
      
      console.log(name + category + avgTime + throughput + p95Time + memoryPeak);
    }

    console.log('\n💡 Recommendations:');
    for (const recommendation of suite.summary.recommendations) {
      console.log(`• ${recommendation}`);
    }

    console.log('\n✅ Benchmark completed successfully!');
  }

  /**
   * Get CPU information
   */
  private getCpuInfo(): string {
    try {
      const os = require('os');
      const cpus = os.cpus();
      return `${cpus[0].model} (${cpus.length} cores)`;
    } catch {
      return 'Unknown CPU';
    }
  }
}