/**
 * File Watcher System
 * Real-time monitoring of code files for incremental analysis
 */

import chokidar from 'chokidar';
import path from 'path';
import { EventEmitter } from 'events';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface FileWatcherOptions {
  ignored?: string[];
  includeExtensions?: string[];
  debounceMs?: number;
  maxConcurrentAnalysis?: number;
  followSymlinks?: boolean;
  ignoreInitial?: boolean;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  timestamp: Date;
  stats?: import('fs').Stats;
}

export interface BatchedChanges {
  files: FileChangeEvent[];
  directories: FileChangeEvent[];
  timestamp: Date;
  batchId: string;
}

export interface WatcherStats {
  watchedFiles: number;
  watchedDirectories: number;
  totalEvents: number;
  eventsToday: number;
  averageProcessingTime: number;
  pendingAnalysis: number;
  errors: number;
  lastError?: string;
}

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private options: Required<FileWatcherOptions>;
  private watchedPaths: Set<string> = new Set();
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private stats: WatcherStats;
  private isWatching = false;
  private processingQueue: FileChangeEvent[] = [];
  private processingInProgress = 0;

  constructor(options: FileWatcherOptions = {}) {
    super();
    
    this.options = {
      ignored: options.ignored || [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '**/*.log',
        '**/*.tmp',
        '**/.DS_Store',
        '**/Thumbs.db'
      ],
      includeExtensions: options.includeExtensions || [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.py', '.java', '.cpp', '.c', '.rs', '.go',
        '.php', '.rb', '.swift', '.kt', '.cs', '.dart'
      ],
      debounceMs: options.debounceMs || 300,
      maxConcurrentAnalysis: options.maxConcurrentAnalysis || 3,
      followSymlinks: options.followSymlinks || false,
      ignoreInitial: options.ignoreInitial || true
    };

    this.stats = {
      watchedFiles: 0,
      watchedDirectories: 0,
      totalEvents: 0,
      eventsToday: 0,
      averageProcessingTime: 0,
      pendingAnalysis: 0,
      errors: 0
    };

    // Reset daily stats at midnight
    this.scheduleDailyReset();
  }

  /**
   * Start watching the specified paths
   */
  async startWatching(paths: string | string[]): Promise<Result<void>> {
    try {
      if (this.isWatching) {
        await this.stopWatching();
      }

      const pathsArray = Array.isArray(paths) ? paths : [paths];
      
      // Validate paths
      for (const p of pathsArray) {
        if (!this.isValidPath(p)) {
          return {
            success: false,
            error: toKBError(new Error(`Invalid path: ${p}`), { operation: 'startWatching' })
          };
        }
      }

      // Create chokidar watcher
      this.watcher = chokidar.watch(pathsArray, {
        ignored: this.createIgnorePatterns(),
        persistent: true,
        ignoreInitial: this.options.ignoreInitial,
        followSymlinks: this.options.followSymlinks,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        },
        ignorePermissionErrors: true
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for initial scan to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Watcher initialization timeout'));
        }, 30000);

        this.watcher!.on('ready', () => {
          clearTimeout(timeout);
          this.isWatching = true;
          this.updateWatchedStats();
          resolve();
        });

        this.watcher!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      this.emit('watching_started', {
        paths: pathsArray,
        stats: this.stats
      });

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'startWatching' })
      };
    }
  }

  /**
   * Stop watching files
   */
  async stopWatching(): Promise<Result<void>> {
    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.isWatching = false;
      this.clearPendingChanges();
      
      this.emit('watching_stopped', {
        finalStats: this.stats
      });

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'stopWatching' })
      };
    }
  }

  /**
   * Add additional paths to watch
   */
  async addPaths(paths: string | string[]): Promise<Result<void>> {
    try {
      if (!this.watcher) {
        return {
          success: false,
          error: toKBError(new Error('Watcher not initialized'), { operation: 'addPaths' })
        };
      }

      const pathsArray = Array.isArray(paths) ? paths : [paths];
      
      for (const p of pathsArray) {
        if (this.isValidPath(p) && !this.watchedPaths.has(p)) {
          this.watcher.add(p);
          this.watchedPaths.add(p);
        }
      }

      this.updateWatchedStats();
      this.emit('paths_added', pathsArray);

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'addPaths' })
      };
    }
  }

  /**
   * Remove paths from watching
   */
  async removePaths(paths: string | string[]): Promise<Result<void>> {
    try {
      if (!this.watcher) {
        return {
          success: false,
          error: toKBError(new Error('Watcher not initialized'), { operation: 'removePaths' })
        };
      }

      const pathsArray = Array.isArray(paths) ? paths : [paths];
      
      for (const p of pathsArray) {
        this.watcher.unwatch(p);
        this.watchedPaths.delete(p);
      }

      this.updateWatchedStats();
      this.emit('paths_removed', pathsArray);

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'removePaths' })
      };
    }
  }

  /**
   * Get current watcher statistics
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Get list of watched paths
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchedPaths);
  }

  /**
   * Check if currently watching
   */
  isCurrentlyWatching(): boolean {
    return this.isWatching;
  }

  /**
   * Force process pending changes immediately
   */
  async flushPendingChanges(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    await this.processPendingChanges();
  }

  // Private methods

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher.on('add', (filePath, stats) => {
      this.handleFileEvent('add', filePath, stats);
    });

    this.watcher.on('change', (filePath, stats) => {
      this.handleFileEvent('change', filePath, stats);
    });

    this.watcher.on('unlink', (filePath) => {
      this.handleFileEvent('unlink', filePath);
    });

    this.watcher.on('addDir', (dirPath, stats) => {
      this.handleFileEvent('addDir', dirPath, stats);
    });

    this.watcher.on('unlinkDir', (dirPath) => {
      this.handleFileEvent('unlinkDir', dirPath);
    });

    this.watcher.on('error', (error) => {
      this.stats.errors++;
      this.stats.lastError = error.message;
      this.emit('error', error);
    });
  }

  private handleFileEvent(
    type: FileChangeEvent['type'], 
    filePath: string, 
    stats?: import('fs').Stats
  ): void {
    // Filter by file extension for file events
    if ((type === 'add' || type === 'change' || type === 'unlink') && 
        !this.isWatchableFile(filePath)) {
      return;
    }

    const event: FileChangeEvent = {
      type,
      path: filePath,
      timestamp: new Date(),
      stats
    };

    // Add to pending changes (this handles debouncing)
    this.pendingChanges.set(filePath, event);
    this.stats.totalEvents++;
    this.stats.eventsToday++;

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.options.debounceMs);

    this.emit('file_event', event);
  }

  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    // Separate files and directories
    const files = changes.filter(c => 
      c.type === 'add' || c.type === 'change' || c.type === 'unlink'
    );
    const directories = changes.filter(c => 
      c.type === 'addDir' || c.type === 'unlinkDir'
    );

    const batch: BatchedChanges = {
      files,
      directories,
      timestamp: new Date(),
      batchId: this.generateBatchId()
    };

    this.stats.pendingAnalysis = files.length;

    // Emit batched changes
    this.emit('changes_detected', batch);

    // Process files in queue with concurrency limit
    this.processingQueue.push(...files);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.processingQueue.length > 0 && 
           this.processingInProgress < this.options.maxConcurrentAnalysis) {
      
      const event = this.processingQueue.shift();
      if (!event) continue;

      this.processingInProgress++;
      
      const startTime = Date.now();
      
      try {
        await this.processFileEvent(event);
        
        // Update processing time stats
        const processingTime = Date.now() - startTime;
        this.updateProcessingTime(processingTime);
        
        this.emit('file_processed', {
          event,
          processingTime,
          success: true
        });
      } catch (error) {
        this.stats.errors++;
        this.stats.lastError = error instanceof Error ? error.message : 'Unknown error';
        
        this.emit('file_processed', {
          event,
          processingTime: Date.now() - startTime,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        this.processingInProgress--;
        this.stats.pendingAnalysis = Math.max(0, this.stats.pendingAnalysis - 1);
      }
    }
  }

  private async processFileEvent(event: FileChangeEvent): Promise<void> {
    // This will be called by the incremental analyzer
    // For now, just emit the event for other components to handle
    this.emit('file_ready_for_analysis', event);
  }

  private isValidPath(filePath: string): boolean {
    try {
      const normalized = path.resolve(filePath);
      return normalized.length > 0;
    } catch {
      return false;
    }
  }

  private isWatchableFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return this.options.includeExtensions.includes(ext);
  }

  private createIgnorePatterns(): (string | RegExp)[] {
    return this.options.ignored.map(pattern => {
      // Convert glob patterns to regex if needed
      if (pattern.includes('*') || pattern.includes('?')) {
        return new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      }
      return pattern;
    });
  }

  private updateWatchedStats(): void {
    if (!this.watcher) return;

    const watched = this.watcher.getWatched();
    this.stats.watchedDirectories = Object.keys(watched).length;
    this.stats.watchedFiles = Object.values(watched)
      .flat()
      .filter(file => this.isWatchableFile(file))
      .length;
  }

  private updateProcessingTime(time: number): void {
    if (this.stats.averageProcessingTime === 0) {
      this.stats.averageProcessingTime = time;
    } else {
      // Exponential moving average
      this.stats.averageProcessingTime = 
        this.stats.averageProcessingTime * 0.8 + time * 0.2;
    }
  }

  private clearPendingChanges(): void {
    this.pendingChanges.clear();
    this.processingQueue.length = 0;
    this.processingInProgress = 0;
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.stats.eventsToday = 0;
      this.scheduleDailyReset(); // Schedule next reset
    }, msUntilMidnight);
  }

  /**
   * Pause file watching temporarily
   */
  pauseWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.isWatching = false;
      this.emit('watching_paused');
    }
  }

  /**
   * Resume file watching
   */
  async resumeWatching(): Promise<Result<void>> {
    if (!this.isWatching && this.watchedPaths.size > 0) {
      return this.startWatching(Array.from(this.watchedPaths));
    }
    
    return { success: true, data: undefined };
  }

  /**
   * Get detailed status for monitoring
   */
  getDetailedStatus(): {
    isWatching: boolean;
    stats: WatcherStats;
    watchedPaths: string[];
    pendingChanges: number;
    processingQueue: number;
    processingInProgress: number;
    options: FileWatcherOptions;
  } {
    return {
      isWatching: this.isWatching,
      stats: this.getStats(),
      watchedPaths: this.getWatchedPaths(),
      pendingChanges: this.pendingChanges.size,
      processingQueue: this.processingQueue.length,
      processingInProgress: this.processingInProgress,
      options: this.options
    };
  }
}