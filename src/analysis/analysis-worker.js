/**
 * Analysis Worker for Parallel Processing
 * Runs analysis tasks in isolated worker threads
 */

import { parentPort, workerData } from 'worker_threads';
import { AnalysisEngine } from './analysis-engine.js';
import { UnifiedMemory } from '../graph/unified-memory.js';

class AnalysisWorker {
  constructor(workerId, options) {
    this.workerId = workerId;
    this.options = options;
    this.analysisEngine = null;
    this.isInitialized = false;
    
    this.setupMessageHandler();
    this.setupHeartbeat();
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize analysis engine for this worker
      const memory = new UnifiedMemory({
        enableGraph: true,
        enableVector: true,
        enableTemporal: true,
        enableWorking: true
      });

      await memory.initialize();

      this.analysisEngine = new AnalysisEngine(memory, {
        enableRealTimeAnalysis: false, // Disable for worker
        enablePatternDetection: true,
        enableDebtAnalysis: true,
        enableInsightsGeneration: true,
        enableNaturalLanguageQueries: true,
        analysisDepth: 'detailed'
      });

      this.isInitialized = true;
      this.sendMessage({
        type: 'initialized',
        workerId: this.workerId
      });

    } catch (error) {
      this.sendMessage({
        type: 'initializationError',
        workerId: this.workerId,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    }
  }

  setupMessageHandler() {
    if (parentPort) {
      parentPort.on('message', async (message) => {
        try {
          switch (message.type) {
            case 'analyzeTask':
              await this.handleAnalysisTask(message.task);
              break;
            case 'shutdown':
              await this.shutdown();
              break;
            default:
              console.warn(`Unknown message type: ${message.type}`);
          }
        } catch (error) {
          this.sendMessage({
            type: 'messageError',
            error: {
              message: error.message,
              stack: error.stack
            }
          });
        }
      });
    }
  }

  setupHeartbeat() {
    // Send heartbeat every 10 seconds
    setInterval(() => {
      this.sendMessage({
        type: 'heartbeat',
        workerId: this.workerId,
        timestamp: Date.now(),
        memoryUsage: process.memoryUsage().heapUsed
      });
    }, 10000);

    // Send memory usage updates
    setInterval(() => {
      this.sendMessage({
        type: 'memoryUsage',
        usage: process.memoryUsage().heapUsed
      });
    }, 5000);
  }

  async handleAnalysisTask(task) {
    if (!this.isInitialized) {
      this.sendMessage({
        type: 'taskError',
        taskId: task.id,
        error: {
          message: 'Worker not initialized'
        }
      });
      return;
    }

    const startMemory = process.memoryUsage().heapUsed;

    try {
      let result;

      switch (task.type) {
        case 'file':
          result = await this.analyzeFile(task.data);
          break;
        case 'project':
          result = await this.analyzeProject(task.data);
          break;
        case 'pattern':
          result = await this.detectPatterns(task.data);
          break;
        case 'debt':
          result = await this.analyzeTechnicalDebt(task.data);
          break;
        case 'nlq':
          result = await this.processNaturalLanguageQuery(task.data);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const endMemory = process.memoryUsage().heapUsed;

      this.sendMessage({
        type: 'taskComplete',
        taskId: task.id,
        result,
        memoryUsage: endMemory - startMemory
      });

    } catch (error) {
      this.sendMessage({
        type: 'taskError',
        taskId: task.id,
        error: {
          message: error.message,
          stack: error.stack
        },
        memoryUsage: process.memoryUsage().heapUsed - startMemory
      });
    }
  }

  async analyzeFile(data) {
    const { filePath, content, options = {} } = data;
    
    return await this.analysisEngine.analyzeFile(filePath, content, options);
  }

  async analyzeProject(data) {
    const { projectPath, options = {} } = data;
    
    return await this.analysisEngine.analyzeProject(projectPath, options);
  }

  async detectPatterns(data) {
    const { code, language, options = {} } = data;
    
    // Use the pattern detection engine
    const patterns = await this.analysisEngine.patternDetector.detectPatterns(
      code,
      language,
      options
    );

    return {
      patterns,
      metrics: {
        totalPatterns: patterns.length,
        antiPatterns: patterns.filter(p => p.type === 'anti_pattern').length,
        designPatterns: patterns.filter(p => p.type === 'design_pattern').length,
        codeSmells: patterns.filter(p => p.type === 'code_smell').length
      }
    };
  }

  async analyzeTechnicalDebt(data) {
    const { projectPath, options = {} } = data;
    
    const analysis = await this.analysisEngine.analyzeProject(projectPath, options);
    
    if (analysis.success) {
      return {
        technicalDebt: analysis.data.technicalDebt,
        debtMetrics: {
          totalDebt: analysis.data.technicalDebt?.totalDebt || 0,
          debtRatio: analysis.data.technicalDebt?.debtRatio || 0,
          highPriorityItems: analysis.data.technicalDebt?.items?.filter(
            item => item.priority === 'high'
          ).length || 0
        }
      };
    } else {
      throw new Error(analysis.error?.message || 'Technical debt analysis failed');
    }
  }

  async processNaturalLanguageQuery(data) {
    const { query, options = {} } = data;
    
    return await this.analysisEngine.processQuery(query, {
      includeContext: true,
      includeExplanations: true,
      includeSuggestions: true,
      maxResults: 10,
      ...options
    });
  }

  sendMessage(message) {
    if (parentPort) {
      parentPort.postMessage(message);
    }
  }

  async shutdown() {
    try {
      // Clean up resources
      if (this.analysisEngine && this.analysisEngine.memory) {
        await this.analysisEngine.memory.close();
      }
      
      this.sendMessage({
        type: 'shutdownComplete',
        workerId: this.workerId
      });
      
      process.exit(0);
    } catch (error) {
      console.error(`Worker ${this.workerId} shutdown error:`, error);
      process.exit(1);
    }
  }
}

// Initialize worker
if (workerData) {
  new AnalysisWorker(workerData.workerId, workerData.options);
} else {
  console.error('Worker data not provided');
  process.exit(1);
}