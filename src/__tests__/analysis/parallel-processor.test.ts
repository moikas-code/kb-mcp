/**
 * Test Suite for Parallel Processing Engine
 * Tests worker management, task distribution, and performance
 */

import { jest } from '@jest/globals';
import { ParallelProcessor, AnalysisTask } from '../../analysis/parallel-processor.js';
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

// Mock worker_threads
jest.mock('worker_threads', () => ({
  Worker: jest.fn()
}));

describe('ParallelProcessor', () => {
  let processor: ParallelProcessor;
  let mockWorkers: any[] = [];

  beforeEach(() => {
    // Reset mocks
    mockWorkers = [];
    
    // Mock Worker constructor
    (Worker as jest.MockedClass<typeof Worker>).mockImplementation((workerPath: any, options: any) => {
      const mockWorker = new EventEmitter() as any;
      mockWorker.terminate = jest.fn().mockResolvedValue(undefined);
      mockWorker.postMessage = jest.fn();
      mockWorker.workerId = options.workerData.workerId;
      
      mockWorkers.push(mockWorker);
      
      // Simulate worker initialization
      setTimeout(() => {
        mockWorker.emit('message', { type: 'initialized' });
      }, 10);
      
      return mockWorker;
    });

    processor = new ParallelProcessor({
      maxWorkers: 4,
      enableStreaming: true,
      chunkSize: 10
    });
  });

  afterEach(async () => {
    await processor.shutdown();
    jest.clearAllMocks();
  });

  describe('Worker Pool Management', () => {
    test('should initialize worker pool', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(Worker).toHaveBeenCalledTimes(4);
      expect(mockWorkers).toHaveLength(4);
    });

    test('should handle worker errors', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const workerErrorSpy = jest.fn();
      processor.on('workerError', workerErrorSpy);
      
      // Simulate worker error
      mockWorkers[0].emit('error', new Error('Worker crashed'));
      
      expect(workerErrorSpy).toHaveBeenCalledWith({
        workerId: 0,
        error: expect.any(Error)
      });
    });

    test('should restart failed workers', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const initialWorkerCount = mockWorkers.length;
      
      // Simulate worker crash
      mockWorkers[0].emit('exit', 1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should create a replacement worker
      expect(Worker).toHaveBeenCalledTimes(initialWorkerCount + 1);
    });

    test('should track worker health', async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Simulate heartbeat
      mockWorkers[0].emit('message', {
        type: 'heartbeat',
        workerId: 0,
        timestamp: Date.now()
      });
      
      const status = processor.getStatus();
      expect(status.workers).toBe(4);
    });
  });

  describe('Task Submission', () => {
    beforeEach(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should submit single task', async () => {
      const task: Omit<AnalysisTask, 'id'> = {
        type: 'file',
        data: { filePath: 'test.ts', content: 'test' },
        priority: 5
      };

      const result = await processor.submitTask(task);

      expect(result.success).toBe(true);
      expect(result.data).toMatch(/^task_\d+_\d+$/);
    });

    test('should handle task priority', async () => {
      const highPriorityTask = {
        type: 'file' as const,
        data: { filePath: 'important.ts' },
        priority: 10
      };

      const lowPriorityTask = {
        type: 'file' as const,
        data: { filePath: 'regular.ts' },
        priority: 1
      };

      await processor.submitTask(lowPriorityTask);
      await processor.submitTask(highPriorityTask);

      // High priority task should be processed first
      const workerMessage = mockWorkers[0].postMessage.mock.calls[0][0];
      expect(workerMessage.task.priority).toBe(10);
    });

    test('should reject tasks when queue is full', async () => {
      const smallProcessor = new ParallelProcessor({
        maxWorkers: 1,
        maxQueueSize: 2
      });

      // Fill the queue
      const tasks = Array(3).fill(0).map(() => ({
        type: 'file' as const,
        data: { filePath: 'test.ts' },
        priority: 5
      }));

      const results = await Promise.all(
        tasks.map(task => smallProcessor.submitTask(task))
      );

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
      expect(results[2].error).toContain('queue is full');

      await smallProcessor.shutdown();
    });
  });

  describe('Batch Processing', () => {
    beforeEach(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Setup worker responses
      mockWorkers.forEach((worker, index) => {
        worker.postMessage.mockImplementation((message: any) => {
          if (message.type === 'analyzeTask') {
            setTimeout(() => {
              worker.emit('message', {
                type: 'taskComplete',
                taskId: message.task.id,
                result: { processed: true, workerId: index }
              });
            }, 10);
          }
        });
      });
    });

    test('should submit batch of tasks', async () => {
      const tasks = Array(5).fill(0).map((_, i) => ({
        type: 'file' as const,
        data: { filePath: `file${i}.ts` },
        priority: 5
      }));

      const result = await processor.submitBatch(tasks);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
    });

    test('should handle partial batch failures', async () => {
      // Make one worker fail
      mockWorkers[0].postMessage.mockImplementation((message: any) => {
        if (message.type === 'analyzeTask') {
          setTimeout(() => {
            worker.emit('message', {
              type: 'taskError',
              taskId: message.task.id,
              error: { message: 'Processing failed' }
            });
          }, 10);
        }
      });

      const tasks = Array(3).fill(0).map((_, i) => ({
        type: 'file' as const,
        data: { filePath: `file${i}.ts` },
        priority: 5
      }));

      const result = await processor.submitBatch(tasks);

      // Should succeed even with some failures
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });
  });

  describe('Streaming Analysis', () => {
    beforeEach(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Setup instant worker responses
      mockWorkers.forEach((worker, index) => {
        worker.postMessage.mockImplementation((message: any) => {
          if (message.type === 'analyzeTask') {
            setImmediate(() => {
              worker.emit('message', {
                type: 'taskComplete',
                taskId: message.task.id,
                result: { 
                  processed: true, 
                  workerId: index,
                  data: `Result for ${message.task.data.filePath}`
                }
              });
            });
          }
        });
      });
    });

    test('should stream analysis results', async () => {
      const tasks = Array(25).fill(0).map((_, i) => ({
        type: 'file' as const,
        data: { filePath: `file${i}.ts` },
        priority: 5
      }));

      const chunks: any[] = [];
      let progressUpdates = 0;

      for await (const chunk of processor.streamAnalysis(tasks, {
        chunkSize: 10,
        onProgress: () => progressUpdates++
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3); // 25 tasks / 10 chunk size = 3 chunks
      expect(chunks[0]).toHaveLength(10);
      expect(chunks[1]).toHaveLength(10);
      expect(chunks[2]).toHaveLength(5);
      expect(progressUpdates).toBeGreaterThan(0);
    });

    test('should respect concurrency limits', async () => {
      const tasks = Array(20).fill(0).map((_, i) => ({
        type: 'file' as const,
        data: { filePath: `file${i}.ts` },
        priority: 5
      }));

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      // Track concurrent executions
      mockWorkers.forEach((worker) => {
        const originalPostMessage = worker.postMessage;
        worker.postMessage = jest.fn((message: any) => {
          if (message.type === 'analyzeTask') {
            currentConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
            
            setTimeout(() => {
              currentConcurrent--;
              worker.emit('message', {
                type: 'taskComplete',
                taskId: message.task.id,
                result: { processed: true }
              });
            }, 50);
          }
          return originalPostMessage.call(worker, message);
        });
      });

      const results: any[] = [];
      for await (const chunk of processor.streamAnalysis(tasks, {
        concurrency: 3
      })) {
        results.push(...chunk);
      }

      expect(results).toHaveLength(20);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should emit performance statistics', async () => {
      const statsSpy = jest.fn();
      processor.on('stats', statsSpy);

      // Trigger stats emission
      await new Promise(resolve => setTimeout(resolve, 30100)); // Wait for stats interval

      expect(statsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          totalTasks: expect.any(Number),
          completedTasks: expect.any(Number),
          activeWorkers: expect.any(Number),
          queueSize: expect.any(Number)
        })
      );
    });

    test('should track memory usage', async () => {
      // Simulate memory usage update
      mockWorkers[0].emit('message', {
        type: 'memoryUsage',
        usage: 100 * 1024 * 1024 // 100MB
      });

      const status = processor.getStatus();
      expect(status.stats.peakMemoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should shutdown gracefully', async () => {
      const shutdownSpy = jest.fn();
      processor.on('shutdown', shutdownSpy);

      await processor.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
      mockWorkers.forEach(worker => {
        expect(worker.terminate).toHaveBeenCalled();
      });
    });

    test('should wait for active tasks before shutdown', async () => {
      // Submit a task
      const task = {
        type: 'file' as const,
        data: { filePath: 'test.ts' },
        priority: 5
      };

      await processor.submitTask(task);

      // Start shutdown
      const shutdownPromise = processor.shutdown();

      // Complete the task
      mockWorkers[0].emit('message', {
        type: 'taskComplete',
        taskId: 'task_1',
        result: { processed: true }
      });

      await shutdownPromise;

      expect(processor.getStatus().activeJobs).toBe(0);
    });

    test('should reject new tasks after shutdown', async () => {
      await processor.shutdown();

      const result = await processor.submitTask({
        type: 'file',
        data: { filePath: 'test.ts' },
        priority: 5
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('shutting down');
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    test('should handle worker timeout', async () => {
      const timeoutProcessor = new ParallelProcessor({
        maxWorkers: 1,
        workerIdleTimeout: 100
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Submit task but don't complete it
      await timeoutProcessor.submitTask({
        type: 'file',
        data: { filePath: 'test.ts' },
        priority: 5
      });

      // Wait for timeout and health check
      await new Promise(resolve => setTimeout(resolve, 61000));

      // Worker should be restarted
      expect(Worker).toHaveBeenCalledTimes(2); // Initial + restart

      await timeoutProcessor.shutdown();
    }, 70000);

    test('should handle corrupted worker messages', async () => {
      // Send invalid message
      mockWorkers[0].emit('message', { 
        type: 'unknown', 
        data: 'corrupted' 
      });

      // Should not crash
      expect(() => processor.getStatus()).not.toThrow();
    });
  });
});