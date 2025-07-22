/**
 * Parallel Processing Engine for KB-MCP Analysis
 * High-performance concurrent analysis with worker pools and streaming
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import path from 'path';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface ParallelProcessingOptions {
  maxWorkers?: number;
  workerIdleTimeout?: number;
  maxQueueSize?: number;
  enableStreaming?: boolean;
  chunkSize?: number;
  priority?: 'speed' | 'memory' | 'balanced';
}

export interface AnalysisTask {
  id: string;
  type: 'file' | 'project' | 'pattern' | 'debt' | 'nlq';
  data: any;
  priority: number;
  estimatedDuration?: number;
  dependencies?: string[];
}

export interface AnalysisResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: string;
  metrics: {
    startTime: number;
    endTime: number;
    duration: number;
    workerIndex: number;
    memoryUsage: number;
  };
}

export interface WorkerPool {
  workers: AnalysisWorker[];
  activeJobs: Map<string, AnalysisTask>;
  queue: AnalysisTask[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageTaskTime: number;
    peakMemoryUsage: number;
  };
}

export interface AnalysisWorker {
  worker: Worker;
  id: number;
  busy: boolean;
  currentTask?: string;
  startTime?: number;
  completedTasks: number;
  failedTasks: number;
  lastHeartbeat: number;
}

export class ParallelProcessor extends EventEmitter {
  private workerPool: WorkerPool;
  private options: Required<ParallelProcessingOptions>;
  private isShuttingDown = false;
  private taskCounter = 0;

  constructor(options: ParallelProcessingOptions = {}) {
    super();

    this.options = {
      maxWorkers: options.maxWorkers || cpus().length,
      workerIdleTimeout: options.workerIdleTimeout || 60000, // 1 minute
      maxQueueSize: options.maxQueueSize || 1000,
      enableStreaming: options.enableStreaming !== false,
      chunkSize: options.chunkSize || 100,
      priority: options.priority || 'balanced'
    };

    this.workerPool = {
      workers: [],
      activeJobs: new Map(),
      queue: [],
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskTime: 0,
        peakMemoryUsage: 0
      }
    };

    this.initializeWorkers();
    this.setupHealthMonitoring();
  }

  /**
   * Initialize worker pool
   */
  private async initializeWorkers(): Promise<void> {
    const workerPath = path.join(process.cwd(), 'src/analysis/analysis-worker.js');

    for (let i = 0; i < this.options.maxWorkers; i++) {
      try {
        const worker = new Worker(workerPath, {
          workerData: {
            workerId: i,
            options: this.options
          }
        });

        const analysisWorker: AnalysisWorker = {
          worker,
          id: i,
          busy: false,
          completedTasks: 0,
          failedTasks: 0,
          lastHeartbeat: Date.now()
        };

        // Set up worker event handlers
        worker.on('message', (message) => {
          this.handleWorkerMessage(analysisWorker, message);
        });

        worker.on('error', (error) => {
          this.handleWorkerError(analysisWorker, error);
        });

        worker.on('exit', (code) => {
          this.handleWorkerExit(analysisWorker, code);
        });

        this.workerPool.workers.push(analysisWorker);
        this.emit('workerCreated', { workerId: i });

      } catch (error) {
        console.error(`Failed to create worker ${i}:`, error);
      }
    }

    console.log(`Initialized ${this.workerPool.workers.length} workers`);
  }

  /**
   * Submit analysis task for parallel processing
   */
  async submitTask(task: Omit<AnalysisTask, 'id'>): Promise<Result<string>> {
    try {
      if (this.isShuttingDown) {
        return {
          success: false,
          error: 'Parallel processor is shutting down'
        };
      }

      if (this.workerPool.queue.length >= this.options.maxQueueSize) {
        return {
          success: false,
          error: 'Task queue is full'
        };
      }

      const taskId = `task_${++this.taskCounter}_${Date.now()}`;
      const analysisTask: AnalysisTask = {
        ...task,
        id: taskId
      };

      // Add to queue with priority sorting
      this.workerPool.queue.push(analysisTask);
      this.workerPool.queue.sort((a, b) => b.priority - a.priority);

      this.workerPool.stats.totalTasks++;
      this.emit('taskQueued', { taskId, queueSize: this.workerPool.queue.length });

      // Try to assign task immediately
      this.tryAssignTasks();

      return { success: true, data: taskId };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'submitTask' }).message
      };
    }
  }

  /**
   * Submit multiple tasks for batch processing
   */
  async submitBatch(tasks: Omit<AnalysisTask, 'id'>[]): Promise<Result<string[]>> {
    try {
      const taskIds: string[] = [];
      const errors: string[] = [];

      for (const task of tasks) {
        const result = await this.submitTask(task);
        if (result.success) {
          taskIds.push(result.data!);
        } else {
          errors.push(result.error!);
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `Failed to submit ${errors.length} tasks: ${errors.join(', ')}`
        };
      }

      return { success: true, data: taskIds };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'submitBatch' }).message
      };
    }
  }

  /**
   * Stream results for large datasets
   */
  async *streamAnalysis(
    tasks: Omit<AnalysisTask, 'id'>[],
    options: { 
      chunkSize?: number;
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): AsyncGenerator<AnalysisResult[], void, unknown> {
    const chunkSize = options.chunkSize || this.options.chunkSize;
    const concurrency = options.concurrency || this.options.maxWorkers;
    
    let completed = 0;
    const total = tasks.length;

    // Process tasks in chunks
    for (let i = 0; i < tasks.length; i += chunkSize) {
      const chunk = tasks.slice(i, i + chunkSize);
      const chunkResults: AnalysisResult[] = [];

      // Submit chunk with concurrency limit
      const activeTasks = new Map<string, Promise<AnalysisResult>>();

      for (const task of chunk) {
        // Wait if we've hit concurrency limit
        while (activeTasks.size >= concurrency) {
          const finishedTaskId = await Promise.race(
            Array.from(activeTasks.keys()).map(async (taskId) => {
              await activeTasks.get(taskId);
              return taskId;
            })
          );
          
          const result = await activeTasks.get(finishedTaskId)!;
          chunkResults.push(result);
          activeTasks.delete(finishedTaskId);
          
          completed++;
          if (options.onProgress) {
            options.onProgress(completed, total);
          }
        }

        // Submit new task
        const submitResult = await this.submitTask(task);
        if (submitResult.success) {
          const taskPromise = this.waitForTask(submitResult.data!);
          activeTasks.set(submitResult.data!, taskPromise);
        }
      }

      // Wait for remaining tasks in chunk
      while (activeTasks.size > 0) {
        const finishedTaskId = await Promise.race(
          Array.from(activeTasks.keys()).map(async (taskId) => {
            await activeTasks.get(taskId);
            return taskId;
          })
        );
        
        const result = await activeTasks.get(finishedTaskId)!;
        chunkResults.push(result);
        activeTasks.delete(finishedTaskId);
        
        completed++;
        if (options.onProgress) {
          options.onProgress(completed, total);
        }
      }

      yield chunkResults;
    }
  }

  /**
   * Wait for specific task completion
   */
  private waitForTask(taskId: string): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task ${taskId} timed out`));
      }, 300000); // 5 minute timeout

      const onTaskComplete = (result: AnalysisResult) => {
        if (result.taskId === taskId) {
          clearTimeout(timeout);
          this.off('taskComplete', onTaskComplete);
          resolve(result);
        }
      };

      this.on('taskComplete', onTaskComplete);
    });
  }

  /**
   * Try to assign queued tasks to available workers
   */
  private tryAssignTasks(): void {
    while (this.workerPool.queue.length > 0) {
      const availableWorker = this.workerPool.workers.find(w => !w.busy);
      if (!availableWorker) {
        break;
      }

      const task = this.workerPool.queue.shift()!;
      this.assignTaskToWorker(availableWorker, task);
    }
  }

  /**
   * Assign task to specific worker
   */
  private assignTaskToWorker(worker: AnalysisWorker, task: AnalysisTask): void {
    worker.busy = true;
    worker.currentTask = task.id;
    worker.startTime = performance.now();

    this.workerPool.activeJobs.set(task.id, task);

    worker.worker.postMessage({
      type: 'analyzeTask',
      task
    });

    this.emit('taskStarted', { 
      taskId: task.id, 
      workerId: worker.id,
      activeJobs: this.workerPool.activeJobs.size
    });
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(worker: AnalysisWorker, message: any): void {
    switch (message.type) {
      case 'taskComplete':
        this.handleTaskComplete(worker, message);
        break;
      case 'taskError':
        this.handleTaskError(worker, message);
        break;
      case 'heartbeat':
        worker.lastHeartbeat = Date.now();
        break;
      case 'memoryUsage':
        this.updateMemoryStats(message.usage);
        break;
    }
  }

  /**
   * Handle task completion
   */
  private handleTaskComplete(worker: AnalysisWorker, message: any): void {
    const { taskId, result } = message;
    const task = this.workerPool.activeJobs.get(taskId);

    if (task) {
      const endTime = performance.now();
      const duration = endTime - (worker.startTime || endTime);

      const analysisResult: AnalysisResult = {
        taskId,
        success: true,
        data: result,
        metrics: {
          startTime: worker.startTime || endTime,
          endTime,
          duration,
          workerIndex: worker.id,
          memoryUsage: message.memoryUsage || 0
        }
      };

      // Update stats
      worker.completedTasks++;
      this.workerPool.stats.completedTasks++;
      this.updateAverageTaskTime(duration);

      // Clean up
      this.workerPool.activeJobs.delete(taskId);
      worker.busy = false;
      worker.currentTask = undefined;
      worker.startTime = undefined;

      this.emit('taskComplete', analysisResult);

      // Try to assign next task
      this.tryAssignTasks();
    }
  }

  /**
   * Handle task error
   */
  private handleTaskError(worker: AnalysisWorker, message: any): void {
    const { taskId, error } = message;
    const task = this.workerPool.activeJobs.get(taskId);

    if (task) {
      const endTime = performance.now();
      const duration = endTime - (worker.startTime || endTime);

      const analysisResult: AnalysisResult = {
        taskId,
        success: false,
        error: error.message || 'Unknown worker error',
        metrics: {
          startTime: worker.startTime || endTime,
          endTime,
          duration,
          workerIndex: worker.id,
          memoryUsage: message.memoryUsage || 0
        }
      };

      // Update stats
      worker.failedTasks++;
      this.workerPool.stats.failedTasks++;

      // Clean up
      this.workerPool.activeJobs.delete(taskId);
      worker.busy = false;
      worker.currentTask = undefined;
      worker.startTime = undefined;

      this.emit('taskComplete', analysisResult);

      // Try to assign next task
      this.tryAssignTasks();
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(worker: AnalysisWorker, error: Error): void {
    console.error(`Worker ${worker.id} error:`, error);
    this.emit('workerError', { workerId: worker.id, error });

    // If worker was processing a task, mark it as failed
    if (worker.currentTask) {
      this.handleTaskError(worker, {
        taskId: worker.currentTask,
        error: { message: `Worker crashed: ${error.message}` }
      });
    }

    // Restart worker
    this.restartWorker(worker);
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(worker: AnalysisWorker, code: number): void {
    if (!this.isShuttingDown && code !== 0) {
      console.warn(`Worker ${worker.id} exited with code ${code}`);
      this.restartWorker(worker);
    }
  }

  /**
   * Restart failed worker
   */
  private async restartWorker(worker: AnalysisWorker): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      // Terminate old worker
      await worker.worker.terminate();

      // Remove from pool
      const index = this.workerPool.workers.indexOf(worker);
      if (index > -1) {
        this.workerPool.workers.splice(index, 1);
      }

      // Create new worker
      await this.createWorker(worker.id);

    } catch (error) {
      console.error(`Failed to restart worker ${worker.id}:`, error);
    }
  }

  /**
   * Create individual worker
   */
  private async createWorker(workerId: number): Promise<void> {
    const workerPath = path.join(process.cwd(), 'src/analysis/analysis-worker.js');

    try {
      const worker = new Worker(workerPath, {
        workerData: {
          workerId,
          options: this.options
        }
      });

      const analysisWorker: AnalysisWorker = {
        worker,
        id: workerId,
        busy: false,
        completedTasks: 0,
        failedTasks: 0,
        lastHeartbeat: Date.now()
      };

      // Set up event handlers
      worker.on('message', (message) => {
        this.handleWorkerMessage(analysisWorker, message);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(analysisWorker, error);
      });

      worker.on('exit', (code) => {
        this.handleWorkerExit(analysisWorker, code);
      });

      this.workerPool.workers.push(analysisWorker);
      this.emit('workerRestarted', { workerId });

    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
    }
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring(): void {
    setInterval(() => {
      this.checkWorkerHealth();
      this.cleanupIdleWorkers();
      this.emitStats();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check worker health
   */
  private checkWorkerHealth(): void {
    const now = Date.now();
    
    for (const worker of this.workerPool.workers) {
      if (worker.busy && now - worker.lastHeartbeat > 60000) {
        console.warn(`Worker ${worker.id} appears unresponsive`);
        this.emit('workerUnresponsive', { workerId: worker.id });
        
        // Force restart unresponsive worker
        this.restartWorker(worker);
      }
    }
  }

  /**
   * Cleanup idle workers
   */
  private cleanupIdleWorkers(): void {
    // This could implement worker scaling down during low load
    // For now, we maintain fixed pool size
  }

  /**
   * Update memory statistics
   */
  private updateMemoryStats(usage: number): void {
    this.workerPool.stats.peakMemoryUsage = Math.max(
      this.workerPool.stats.peakMemoryUsage,
      usage
    );
  }

  /**
   * Update average task time
   */
  private updateAverageTaskTime(duration: number): void {
    const completed = this.workerPool.stats.completedTasks;
    const current = this.workerPool.stats.averageTaskTime;
    
    this.workerPool.stats.averageTaskTime = 
      (current * (completed - 1) + duration) / completed;
  }

  /**
   * Emit performance statistics
   */
  private emitStats(): void {
    this.emit('stats', {
      ...this.workerPool.stats,
      activeWorkers: this.workerPool.workers.filter(w => w.busy).length,
      queueSize: this.workerPool.queue.length,
      activeJobs: this.workerPool.activeJobs.size
    });
  }

  /**
   * Get current status
   */
  getStatus(): {
    workers: number;
    activeJobs: number;
    queueSize: number;
    stats: typeof this.workerPool.stats;
  } {
    return {
      workers: this.workerPool.workers.length,
      activeJobs: this.workerPool.activeJobs.size,
      queueSize: this.workerPool.queue.length,
      stats: { ...this.workerPool.stats }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Wait for active jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.workerPool.activeJobs.size > 0 && 
           Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Terminate all workers
    await Promise.all(
      this.workerPool.workers.map(worker => worker.worker.terminate())
    );

    this.emit('shutdown');
  }
}