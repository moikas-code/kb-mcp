/**
 * Incremental Analysis Pipeline
 * Efficiently processes file changes and updates the knowledge graph
 */

import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { FileWatcher, FileChangeEvent, BatchedChanges } from '../monitoring/file-watcher.js';
import { CodeAnalyzer, AnalysisResult } from './code-analyzer.js';
import { CrossFileResolver, ProjectContext } from './cross-file-resolver.js';
import { UnifiedMemory } from '../graph/unified-memory.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface IncrementalAnalysisOptions {
  projectRoot: string;
  enableWatching?: boolean;
  batchSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  parallelAnalysis?: number;
  skipInitialScan?: boolean;
}

export interface AnalysisProgress {
  phase: 'initialization' | 'initial_scan' | 'incremental' | 'complete';
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  errors: string[];
  warnings: string[];
  startTime: Date;
  estimatedCompletion?: Date;
}

export interface AnalysisMetrics {
  totalAnalysisTime: number;
  averageFileTime: number;
  filesAnalyzed: number;
  entitiesExtracted: number;
  relationshipsCreated: number;
  errorsEncountered: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface DependencyImpact {
  changedFile: string;
  affectedFiles: string[];
  impactLevel: 'low' | 'medium' | 'high';
  reason: string;
}

export class IncrementalAnalyzer extends EventEmitter {
  private options: Required<IncrementalAnalysisOptions>;
  private fileWatcher: FileWatcher;
  private codeAnalyzer: CodeAnalyzer;
  private crossFileResolver: CrossFileResolver;
  private memory: UnifiedMemory;
  
  private isInitialized = false;
  private isAnalyzing = false;
  private progress: AnalysisProgress;
  private metrics: AnalysisMetrics;
  
  // Caching and optimization
  private fileHashes: Map<string, string> = new Map();
  private analysisCache: Map<string, AnalysisResult> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private processingQueue: Set<string> = new Set();

  constructor(memory: UnifiedMemory, options: IncrementalAnalysisOptions) {
    super();
    
    this.memory = memory;
    this.options = {
      enableWatching: true,
      batchSize: 10,
      maxRetries: 3,
      retryDelayMs: 1000,
      parallelAnalysis: 3,
      skipInitialScan: false,
      ...options
    };

    this.fileWatcher = new FileWatcher({
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      debounceMs: 500,
      maxConcurrentAnalysis: this.options.parallelAnalysis
    });

    this.codeAnalyzer = new CodeAnalyzer(memory);
    this.crossFileResolver = new CrossFileResolver(this.options.projectRoot);

    this.progress = {
      phase: 'initialization',
      filesProcessed: 0,
      totalFiles: 0,
      errors: [],
      warnings: [],
      startTime: new Date()
    };

    this.metrics = {
      totalAnalysisTime: 0,
      averageFileTime: 0,
      filesAnalyzed: 0,
      entitiesExtracted: 0,
      relationshipsCreated: 0,
      errorsEncountered: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the incremental analyzer
   */
  async initialize(): Promise<Result<void>> {
    try {
      if (this.isInitialized) {
        return { success: true, data: undefined };
      }

      this.progress.phase = 'initialization';
      this.emit('progress', this.progress);

      // Initialize components
      await this.memory.initialize();

      // Start file watching if enabled
      if (this.options.enableWatching) {
        const watchResult = await this.fileWatcher.startWatching(this.options.projectRoot);
        if (!watchResult.success) {
          return watchResult;
        }
      }

      // Perform initial scan unless skipped
      if (!this.options.skipInitialScan) {
        await this.performInitialScan();
      }

      this.isInitialized = true;
      this.progress.phase = 'complete';
      this.emit('initialized', { metrics: this.metrics });

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'initialize' })
      };
    }
  }

  /**
   * Perform initial project scan
   */
  private async performInitialScan(): Promise<void> {
    this.progress.phase = 'initial_scan';
    this.progress.startTime = new Date();
    
    const files = await this.findSourceFiles(this.options.projectRoot);
    this.progress.totalFiles = files.length;
    
    this.emit('progress', this.progress);

    // Process files in batches
    for (let i = 0; i < files.length; i += this.options.batchSize) {
      const batch = files.slice(i, i + this.options.batchSize);
      
      await Promise.all(
        batch.map(file => this.analyzeFile(file, false))
      );
      
      this.progress.filesProcessed = Math.min(i + this.options.batchSize, files.length);
      this.updateEstimatedCompletion();
      this.emit('progress', this.progress);
    }

    // Resolve cross-file relationships
    await this.resolveCrossFileRelationships();
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(filePath: string, isIncremental = true): Promise<Result<AnalysisResult>> {
    const startTime = Date.now();
    
    try {
      this.progress.currentFile = filePath;
      
      // Check if file content has changed
      const content = await fs.readFile(filePath, 'utf-8');
      const hash = this.calculateHash(content);
      const cachedHash = this.fileHashes.get(filePath);

      if (isIncremental && cachedHash === hash && this.analysisCache.has(filePath)) {
        this.metrics.cacheHits++;
        return {
          success: true,
          data: this.analysisCache.get(filePath)!
        };
      }

      this.metrics.cacheMisses++;
      this.fileHashes.set(filePath, hash);

      // Analyze the file
      const result = await this.codeAnalyzer.analyzeFile(filePath, content);
      
      if (result.success) {
        // Cache the result
        this.analysisCache.set(filePath, result.data);
        
        // Add to cross-file resolver
        this.crossFileResolver.addFileEntities(filePath, result.data.entities);
        
        // Update metrics
        this.metrics.filesAnalyzed++;
        this.metrics.entitiesExtracted += result.data.entities.length;
        this.metrics.relationshipsCreated += result.data.relationships.length;
        
        // Update dependency tracking
        this.updateDependencyGraph(filePath, result.data);
        
        this.emit('file_analyzed', {
          filePath,
          result: result.data,
          processingTime: Date.now() - startTime,
          isIncremental
        });
      } else {
        this.metrics.errorsEncountered++;
        this.progress.errors.push(`Error analyzing ${filePath}: ${result.error?.message}`);
        
        this.emit('analysis_error', {
          filePath,
          error: result.error,
          isIncremental
        });
      }

      // Update average processing time
      const processingTime = Date.now() - startTime;
      this.updateAverageTime(processingTime);

      return result;
    } catch (error) {
      this.metrics.errorsEncountered++;
      this.progress.errors.push(`Exception analyzing ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        success: false,
        error: toKBError(error, { operation: 'analyzeFile', context: { filePath } })
      };
    }
  }

  /**
   * Handle incremental file changes
   */
  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    if (this.processingQueue.has(event.path)) {
      return; // Already queued for processing
    }

    this.processingQueue.add(event.path);

    try {
      switch (event.type) {
        case 'add':
        case 'change':
          await this.handleFileUpdate(event.path);
          break;
        case 'unlink':
          await this.handleFileDelete(event.path);
          break;
      }
    } catch (error) {
      this.emit('error', {
        type: 'file_change_error',
        filePath: event.path,
        event: event.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.processingQueue.delete(event.path);
    }
  }

  /**
   * Handle file updates (add/change)
   */
  private async handleFileUpdate(filePath: string): Promise<void> {
    // Find dependent files that might be affected
    const dependentFiles = this.findDependentFiles(filePath);
    
    const impact: DependencyImpact = {
      changedFile: filePath,
      affectedFiles: dependentFiles,
      impactLevel: this.calculateImpactLevel(dependentFiles.length),
      reason: 'File content changed'
    };

    this.emit('dependency_impact', impact);

    // Re-analyze the changed file
    const result = await this.analyzeFile(filePath, true);
    
    if (result.success) {
      // Re-analyze dependent files if the public interface changed
      if (this.hasPublicInterfaceChanged(filePath, result.data)) {
        for (const depFile of dependentFiles) {
          await this.analyzeFile(depFile, true);
        }
      }
      
      // Update cross-file relationships
      await this.updateCrossFileRelationships([filePath, ...dependentFiles]);
    }
  }

  /**
   * Handle file deletion
   */
  private async handleFileDelete(filePath: string): Promise<void> {
    // Remove from caches
    this.fileHashes.delete(filePath);
    this.analysisCache.delete(filePath);
    this.dependencyGraph.delete(filePath);

    // Remove entities from memory
    await this.removeFileEntities(filePath);

    // Find and update dependent files
    const dependentFiles = this.findDependentFiles(filePath);
    for (const depFile of dependentFiles) {
      await this.analyzeFile(depFile, true);
    }

    this.emit('file_removed', {
      filePath,
      affectedFiles: dependentFiles
    });
  }

  /**
   * Resolve cross-file relationships for the entire project
   */
  private async resolveCrossFileRelationships(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await this.crossFileResolver.resolveAllRelationships();
      
      if (result.success) {
        // Store resolved relationships in memory
        for (const relationship of result.data.resolved) {
          await this.memory.graph.createEdge(
            relationship.sourceId,
            relationship.targetId,
            relationship.type as any,
            relationship.metadata
          );
        }

        this.emit('cross_file_resolution_complete', {
          resolved: result.data.resolved.length,
          unresolved: result.data.unresolved.length,
          crossFileRelationships: result.data.crossFileRelationships.length,
          processingTime: Date.now() - startTime
        });
      }
    } catch (error) {
      this.emit('error', {
        type: 'cross_file_resolution_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update cross-file relationships for specific files
   */
  private async updateCrossFileRelationships(filePaths: string[]): Promise<void> {
    // This is a simplified version that would re-resolve relationships
    // for the affected files only
    await this.resolveCrossFileRelationships();
  }

  /**
   * Find all source files in the project
   */
  private async findSourceFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    
    async function scanDirectory(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Skip common directories that don't contain source code
            if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    await scanDirectory(rootPath);
    return files;
  }

  private setupEventHandlers(): void {
    this.fileWatcher.on('changes_detected', (batch: BatchedChanges) => {
      for (const event of batch.files) {
        this.handleFileChange(event);
      }
    });

    this.fileWatcher.on('error', (error) => {
      this.emit('error', {
        type: 'file_watcher_error',
        error: error.message
      });
    });
  }

  private calculateHash(content: string): string {
    // Simple hash function - in production, use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private updateDependencyGraph(filePath: string, result: AnalysisResult): void {
    const dependencies = new Set<string>();
    
    // Extract dependencies from imports
    for (const entity of result.entities) {
      if (entity.type === 'Import' && entity.metadata.resolvedPath) {
        dependencies.add(entity.metadata.resolvedPath);
      }
    }
    
    this.dependencyGraph.set(filePath, dependencies);
  }

  private findDependentFiles(filePath: string): string[] {
    const dependents: string[] = [];
    
    for (const [file, deps] of this.dependencyGraph) {
      if (deps.has(filePath)) {
        dependents.push(file);
      }
    }
    
    return dependents;
  }

  private calculateImpactLevel(affectedCount: number): 'low' | 'medium' | 'high' {
    if (affectedCount === 0) return 'low';
    if (affectedCount <= 3) return 'medium';
    return 'high';
  }

  private hasPublicInterfaceChanged(filePath: string, currentResult: AnalysisResult): boolean {
    // Simple heuristic - check if exports have changed
    const cachedResult = this.analysisCache.get(filePath);
    if (!cachedResult) return true;

    const currentExports = currentResult.entities.filter(e => e.type === 'Export');
    const cachedExports = cachedResult.entities.filter(e => e.type === 'Export');

    return currentExports.length !== cachedExports.length ||
           !currentExports.every(exp => 
             cachedExports.some(cached => cached.name === exp.name)
           );
  }

  private async removeFileEntities(filePath: string): Promise<void> {
    // Remove entities associated with this file from the graph
    const query = `
      MATCH (n)
      WHERE n.file_path = $filePath
      DETACH DELETE n
    `;
    
    await this.memory.graph.query(query, { filePath });
  }

  private updateAverageTime(processingTime: number): void {
    if (this.metrics.averageFileTime === 0) {
      this.metrics.averageFileTime = processingTime;
    } else {
      // Exponential moving average
      this.metrics.averageFileTime = 
        this.metrics.averageFileTime * 0.9 + processingTime * 0.1;
    }
    
    this.metrics.totalAnalysisTime += processingTime;
  }

  private updateEstimatedCompletion(): void {
    if (this.progress.filesProcessed > 0 && this.metrics.averageFileTime > 0) {
      const remainingFiles = this.progress.totalFiles - this.progress.filesProcessed;
      const estimatedMs = remainingFiles * this.metrics.averageFileTime;
      this.progress.estimatedCompletion = new Date(Date.now() + estimatedMs);
    }
  }

  /**
   * Get current analysis progress
   */
  getProgress(): AnalysisProgress {
    return { ...this.progress };
  }

  /**
   * Get analysis metrics
   */
  getMetrics(): AnalysisMetrics {
    return { ...this.metrics };
  }

  /**
   * Force re-analysis of specific files
   */
  async reanalyzeFiles(filePaths: string[]): Promise<Result<void>> {
    try {
      for (const filePath of filePaths) {
        this.fileHashes.delete(filePath);
        this.analysisCache.delete(filePath);
        await this.analyzeFile(filePath, true);
      }
      
      await this.updateCrossFileRelationships(filePaths);
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'reanalyzeFiles' })
      };
    }
  }

  /**
   * Clear all caches and force full re-analysis
   */
  async clearCacheAndReanalyze(): Promise<Result<void>> {
    try {
      this.fileHashes.clear();
      this.analysisCache.clear();
      this.dependencyGraph.clear();
      
      await this.performInitialScan();
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'clearCacheAndReanalyze' })
      };
    }
  }

  /**
   * Shutdown the analyzer
   */
  async shutdown(): Promise<void> {
    if (this.options.enableWatching) {
      await this.fileWatcher.stopWatching();
    }
    
    this.removeAllListeners();
    this.emit('shutdown');
  }
}