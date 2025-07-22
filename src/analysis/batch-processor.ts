/**
 * Batch Processing Engine for Large-Scale Analysis
 * Optimized for processing hundreds of files efficiently
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { ParallelProcessor, AnalysisTask, AnalysisResult } from './parallel-processor.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface BatchProcessingOptions {
  concurrency?: number;
  chunkSize?: number;
  includeTests?: boolean;
  maxFileSize?: number;
  supportedExtensions?: string[];
  excludePatterns?: string[];
  progressReporting?: boolean;
  enableCaching?: boolean;
  cacheTimeout?: number;
}

export interface BatchAnalysisRequest {
  projectPath: string;
  analysisTypes: ('file' | 'pattern' | 'debt' | 'dependencies')[];
  options?: BatchProcessingOptions;
  filters?: {
    languages?: string[];
    maxComplexity?: number;
    modifiedAfter?: Date;
    minFileSize?: number;
  };
}

export interface BatchAnalysisProgress {
  phase: 'discovery' | 'analysis' | 'aggregation' | 'complete';
  filesDiscovered: number;
  filesProcessed: number;
  filesTotal: number;
  estimatedTimeRemaining: number;
  currentFile?: string;
  errors: string[];
}

export interface BatchAnalysisResult {
  summary: {
    totalFiles: number;
    processedFiles: number;
    failedFiles: number;
    processingTime: number;
    averageFileTime: number;
  };
  results: {
    byFile: Map<string, AnalysisResult>;
    aggregated: {
      patterns: any[];
      technicalDebt: any;
      dependencies: any[];
      metrics: any;
    };
  };
  errors: Array<{
    file: string;
    error: string;
    timestamp: Date;
  }>;
}

export class BatchProcessor extends EventEmitter {
  private parallelProcessor: ParallelProcessor;
  private options: Required<BatchProcessingOptions>;
  private cache = new Map<string, { result: any; timestamp: number }>();

  constructor(options: BatchProcessingOptions = {}) {
    super();

    this.options = {
      concurrency: options.concurrency || 8,
      chunkSize: options.chunkSize || 50,
      includeTests: options.includeTests || false,
      maxFileSize: options.maxFileSize || 5 * 1024 * 1024, // 5MB
      supportedExtensions: options.supportedExtensions || [
        '.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp'
      ],
      excludePatterns: options.excludePatterns || [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/target/**',
        '**/.git/**',
        '**/coverage/**'
      ],
      progressReporting: options.progressReporting !== false,
      enableCaching: options.enableCaching !== false,
      cacheTimeout: options.cacheTimeout || 3600000 // 1 hour
    };

    this.parallelProcessor = new ParallelProcessor({
      maxWorkers: this.options.concurrency,
      enableStreaming: true,
      priority: 'speed'
    });

    this.setupEventHandlers();
  }

  /**
   * Process entire project with batch analysis
   */
  async processBatch(request: BatchAnalysisRequest): Promise<Result<BatchAnalysisResult>> {
    try {
      const startTime = Date.now();
      
      this.emit('batchStarted', { projectPath: request.projectPath });

      // Phase 1: File Discovery
      const discoveryResult = await this.discoverFiles(request);
      if (!discoveryResult.success) {
        return discoveryResult as any;
      }

      const files = discoveryResult.data!;
      this.emit('discoveryComplete', { fileCount: files.length });

      // Phase 2: Task Creation
      const tasks = await this.createAnalysisTasks(files, request);
      
      // Phase 3: Parallel Processing
      const processingResult = await this.executeParallelAnalysis(tasks, files.length);
      if (!processingResult.success) {
        return processingResult as any;
      }

      // Phase 4: Result Aggregation
      const aggregationResult = await this.aggregateResults(
        processingResult.data!,
        request.analysisTypes
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      const batchResult: BatchAnalysisResult = {
        summary: {
          totalFiles: files.length,
          processedFiles: processingResult.data!.filter(r => r.success).length,
          failedFiles: processingResult.data!.filter(r => !r.success).length,
          processingTime,
          averageFileTime: processingTime / files.length
        },
        results: {
          byFile: new Map(processingResult.data!.map(r => [r.taskId, r])),
          aggregated: aggregationResult
        },
        errors: processingResult.data!
          .filter(r => !r.success)
          .map(r => ({
            file: r.taskId,
            error: r.error || 'Unknown error',
            timestamp: new Date()
          }))
      };

      this.emit('batchComplete', {
        duration: processingTime,
        filesProcessed: batchResult.summary.processedFiles,
        errors: batchResult.errors.length
      });

      return { success: true, data: batchResult };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'processBatch' }).message
      };
    }
  }

  /**
   * Stream batch processing for real-time updates
   */
  async *streamBatch(request: BatchAnalysisRequest): AsyncGenerator<BatchAnalysisProgress, BatchAnalysisResult, unknown> {
    const startTime = Date.now();
    let filesProcessed = 0;
    const errors: string[] = [];

    try {
      // Discovery phase
      yield {
        phase: 'discovery',
        filesDiscovered: 0,
        filesProcessed: 0,
        filesTotal: 0,
        estimatedTimeRemaining: 0,
        errors: []
      };

      const discoveryResult = await this.discoverFiles(request);
      if (!discoveryResult.success) {
        throw new Error(discoveryResult.error);
      }

      const files = discoveryResult.data!;
      const totalFiles = files.length;

      yield {
        phase: 'analysis',
        filesDiscovered: totalFiles,
        filesProcessed: 0,
        filesTotal: totalFiles,
        estimatedTimeRemaining: 0,
        errors: []
      };

      // Create tasks
      const tasks = await this.createAnalysisTasks(files, request);

      // Stream processing
      const results: AnalysisResult[] = [];
      
      for await (const chunkResults of this.parallelProcessor.streamAnalysis(
        tasks,
        {
          chunkSize: this.options.chunkSize,
          concurrency: this.options.concurrency,
          onProgress: (completed, total) => {
            filesProcessed = completed;
          }
        }
      )) {
        results.push(...chunkResults);
        
        // Update errors
        const newErrors = chunkResults
          .filter(r => !r.success)
          .map(r => r.error || 'Unknown error');
        errors.push(...newErrors);

        // Calculate estimated time remaining
        const elapsedTime = Date.now() - startTime;
        const averageTimePerFile = elapsedTime / filesProcessed;
        const remainingFiles = totalFiles - filesProcessed;
        const estimatedTimeRemaining = remainingFiles * averageTimePerFile;

        yield {
          phase: 'analysis',
          filesDiscovered: totalFiles,
          filesProcessed,
          filesTotal: totalFiles,
          estimatedTimeRemaining,
          currentFile: chunkResults[chunkResults.length - 1]?.taskId,
          errors: [...errors]
        };
      }

      // Aggregation phase
      yield {
        phase: 'aggregation',
        filesDiscovered: totalFiles,
        filesProcessed: filesProcessed,
        filesTotal: totalFiles,
        estimatedTimeRemaining: 0,
        errors: [...errors]
      };

      const aggregatedResults = await this.aggregateResults(
        results,
        request.analysisTypes
      );

      // Complete phase
      yield {
        phase: 'complete',
        filesDiscovered: totalFiles,
        filesProcessed: filesProcessed,
        filesTotal: totalFiles,
        estimatedTimeRemaining: 0,
        errors: [...errors]
      };

      const processingTime = Date.now() - startTime;

      return {
        summary: {
          totalFiles,
          processedFiles: results.filter(r => r.success).length,
          failedFiles: results.filter(r => !r.success).length,
          processingTime,
          averageFileTime: processingTime / totalFiles
        },
        results: {
          byFile: new Map(results.map(r => [r.taskId, r])),
          aggregated: aggregatedResults
        },
        errors: results
          .filter(r => !r.success)
          .map(r => ({
            file: r.taskId,
            error: r.error || 'Unknown error',
            timestamp: new Date()
          }))
      };

    } catch (error) {
      throw new Error(`Batch processing failed: ${error.message}`);
    }
  }

  /**
   * Discover files for analysis
   */
  private async discoverFiles(request: BatchAnalysisRequest): Promise<Result<string[]>> {
    try {
      const { projectPath, options } = request;
      
      // Build glob patterns
      const patterns = this.options.supportedExtensions.map(ext => 
        `${projectPath}/**/*${ext}`
      );

      const globOptions = {
        ignore: this.options.excludePatterns,
        absolute: true,
        nodir: true
      };

      // Discover files
      let files: string[] = [];
      for (const pattern of patterns) {
        const matchedFiles = await glob(pattern, globOptions);
        files.push(...matchedFiles);
      }

      // Remove duplicates
      files = [...new Set(files)];

      // Apply filters
      files = await this.applyFilters(files, request.filters);

      return { success: true, data: files };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'discoverFiles' }).message
      };
    }
  }

  /**
   * Apply filters to file list
   */
  private async applyFilters(files: string[], filters?: BatchAnalysisRequest['filters']): Promise<string[]> {
    if (!filters) return files;

    let filteredFiles = files;

    // File size filters
    if (filters.minFileSize || this.options.maxFileSize) {
      const sizeFilteredFiles: string[] = [];
      
      for (const file of filteredFiles) {
        try {
          const stats = await fs.stat(file);
          
          if (filters.minFileSize && stats.size < filters.minFileSize) {
            continue;
          }
          
          if (this.options.maxFileSize && stats.size > this.options.maxFileSize) {
            continue;
          }
          
          sizeFilteredFiles.push(file);
        } catch (error) {
          // Skip files that can't be accessed
          continue;
        }
      }
      
      filteredFiles = sizeFilteredFiles;
    }

    // Modified date filter
    if (filters.modifiedAfter) {
      const dateFilteredFiles: string[] = [];
      
      for (const file of filteredFiles) {
        try {
          const stats = await fs.stat(file);
          
          if (stats.mtime >= filters.modifiedAfter) {
            dateFilteredFiles.push(file);
          }
        } catch (error) {
          // Skip files that can't be accessed
          continue;
        }
      }
      
      filteredFiles = dateFilteredFiles;
    }

    // Language filters
    if (filters.languages && filters.languages.length > 0) {
      const languageMap: Record<string, string[]> = {
        typescript: ['.ts', '.tsx'],
        javascript: ['.js', '.jsx'],
        python: ['.py'],
        rust: ['.rs'],
        go: ['.go'],
        java: ['.java'],
        c: ['.c'],
        cpp: ['.cpp', '.cc', '.cxx']
      };

      const allowedExtensions = new Set<string>();
      for (const lang of filters.languages) {
        const extensions = languageMap[lang] || [];
        extensions.forEach(ext => allowedExtensions.add(ext));
      }

      filteredFiles = filteredFiles.filter(file => {
        const ext = path.extname(file);
        return allowedExtensions.has(ext);
      });
    }

    return filteredFiles;
  }

  /**
   * Create analysis tasks from file list
   */
  private async createAnalysisTasks(
    files: string[],
    request: BatchAnalysisRequest
  ): Promise<Omit<AnalysisTask, 'id'>[]> {
    const tasks: Omit<AnalysisTask, 'id'>[] = [];

    for (const file of files) {
      // Check cache first
      if (this.options.enableCaching) {
        const cached = this.getCachedResult(file);
        if (cached) {
          continue; // Skip cached files
        }
      }

      // Create file analysis task
      if (request.analysisTypes.includes('file')) {
        tasks.push({
          type: 'file',
          data: {
            filePath: file,
            content: await this.readFileContent(file)
          },
          priority: this.calculateFilePriority(file),
          estimatedDuration: this.estimateAnalysisDuration(file)
        });
      }

      // Create pattern detection task
      if (request.analysisTypes.includes('pattern')) {
        const content = await this.readFileContent(file);
        if (content) {
          tasks.push({
            type: 'pattern',
            data: {
              code: content,
              language: this.detectLanguage(file),
              filePath: file
            },
            priority: this.calculateFilePriority(file),
            estimatedDuration: this.estimateAnalysisDuration(file)
          });
        }
      }
    }

    // Add project-level tasks
    if (request.analysisTypes.includes('debt')) {
      tasks.push({
        type: 'debt',
        data: {
          projectPath: request.projectPath,
          options: request.options
        },
        priority: 10, // High priority for project-level analysis
        estimatedDuration: 30000 // 30 seconds estimate
      });
    }

    return tasks;
  }

  /**
   * Execute parallel analysis
   */
  private async executeParallelAnalysis(
    tasks: Omit<AnalysisTask, 'id'>[],
    totalFiles: number
  ): Promise<Result<AnalysisResult[]>> {
    try {
      const results: AnalysisResult[] = [];
      let processedCount = 0;

      for await (const chunkResults of this.parallelProcessor.streamAnalysis(
        tasks,
        {
          chunkSize: this.options.chunkSize,
          concurrency: this.options.concurrency,
          onProgress: (completed, total) => {
            processedCount = completed;
            
            if (this.options.progressReporting) {
              this.emit('progress', {
                completed,
                total,
                percentage: (completed / total) * 100
              });
            }
          }
        }
      )) {
        results.push(...chunkResults);

        // Cache successful results
        if (this.options.enableCaching) {
          for (const result of chunkResults) {
            if (result.success) {
              this.cacheResult(result.taskId, result);
            }
          }
        }
      }

      return { success: true, data: results };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'executeParallelAnalysis' }).message
      };
    }
  }

  /**
   * Aggregate analysis results
   */
  private async aggregateResults(
    results: AnalysisResult[],
    analysisTypes: string[]
  ): Promise<any> {
    const aggregated = {
      patterns: [],
      technicalDebt: null,
      dependencies: [],
      metrics: {
        totalFiles: results.length,
        successfulAnalyses: results.filter(r => r.success).length,
        failedAnalyses: results.filter(r => !r.success).length,
        averageAnalysisTime: results.reduce((sum, r) => sum + r.metrics.duration, 0) / results.length,
        totalAnalysisTime: results.reduce((sum, r) => sum + r.metrics.duration, 0)
      }
    };

    // Aggregate patterns
    if (analysisTypes.includes('pattern')) {
      for (const result of results) {
        if (result.success && result.data?.patterns) {
          aggregated.patterns.push(...result.data.patterns);
        }
      }
    }

    // Aggregate technical debt
    if (analysisTypes.includes('debt')) {
      const debtResults = results.filter(r => 
        r.success && r.data?.technicalDebt
      );
      
      if (debtResults.length > 0) {
        aggregated.technicalDebt = this.mergeTechnicalDebt(
          debtResults.map(r => r.data.technicalDebt)
        );
      }
    }

    return aggregated;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.parallelProcessor.on('taskComplete', (result) => {
      this.emit('fileAnalysisComplete', {
        file: result.taskId,
        success: result.success,
        duration: result.metrics.duration
      });
    });

    this.parallelProcessor.on('stats', (stats) => {
      this.emit('processingStats', stats);
    });
  }

  /**
   * Helper methods
   */
  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return null;
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp'
    };
    
    return languageMap[ext] || 'unknown';
  }

  private calculateFilePriority(filePath: string): number {
    // Higher priority for main source files
    if (filePath.includes('/src/')) return 8;
    if (filePath.includes('/lib/')) return 7;
    if (filePath.includes('/test/')) return 3;
    if (filePath.includes('/spec/')) return 3;
    return 5;
  }

  private estimateAnalysisDuration(filePath: string): number {
    // Simple estimation based on file type and potential size
    const ext = path.extname(filePath);
    const baseTime = 1000; // 1 second base
    
    if (['.ts', '.tsx'].includes(ext)) return baseTime * 1.5;
    if (['.js', '.jsx'].includes(ext)) return baseTime * 1.2;
    if (ext === '.py') return baseTime * 1.3;
    
    return baseTime;
  }

  private getCachedResult(filePath: string): any | null {
    if (!this.options.enableCaching) return null;
    
    const cached = this.cache.get(filePath);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.options.cacheTimeout) {
      this.cache.delete(filePath);
      return null;
    }
    
    return cached.result;
  }

  private cacheResult(filePath: string, result: any): void {
    if (this.options.enableCaching) {
      this.cache.set(filePath, {
        result,
        timestamp: Date.now()
      });
    }
  }

  private mergeTechnicalDebt(debtData: any[]): any {
    // Simple merge implementation
    return {
      totalDebt: debtData.reduce((sum, debt) => sum + (debt.totalDebt || 0), 0),
      items: debtData.flatMap(debt => debt.items || []),
      summary: {
        highPriority: debtData.reduce((sum, debt) => 
          sum + (debt.summary?.highPriority || 0), 0),
        mediumPriority: debtData.reduce((sum, debt) => 
          sum + (debt.summary?.mediumPriority || 0), 0),
        lowPriority: debtData.reduce((sum, debt) => 
          sum + (debt.summary?.lowPriority || 0), 0)
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.parallelProcessor.shutdown();
    this.cache.clear();
  }
}