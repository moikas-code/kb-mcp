/**
 * Unified Analysis Orchestrator
 * Coordinates all analysis components for optimal performance and results
 */

import { EventEmitter } from 'events';
import { AnalysisEngine } from './analysis-engine.js';
import { ParallelProcessor } from './parallel-processor.js';
import { BatchProcessor } from './batch-processor.js';
import { AnalysisCache } from './analysis-cache.js';
import { MoidvkAdapter } from '../integrations/moidvk-adapter.js';
import { UnifiedMemory } from '../graph/unified-memory.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface OrchestratorConfig {
  enableParallelProcessing?: boolean;
  enableCaching?: boolean;
  enableMoidvkIntegration?: boolean;
  enableIntelligentRouting?: boolean;
  maxConcurrency?: number;
  analysisDepth?: 'quick' | 'standard' | 'comprehensive';
  moidvkPath?: string;
}

export interface AnalysisRequest {
  type: 'file' | 'project' | 'query' | 'pattern' | 'debt' | 'workflow';
  target: string;
  options?: any;
  context?: {
    previousAnalyses?: string[];
    userGoals?: string[];
    urgency?: 'low' | 'normal' | 'high';
    teamSize?: number;
  };
}

export interface OrchestratedResult {
  request: AnalysisRequest;
  results: {
    primary: any;
    enhancements?: any;
    insights?: any;
    recommendations?: any;
  };
  metadata: {
    executionTime: number;
    toolsUsed: string[];
    cacheHits: number;
    parallelTasks: number;
    confidence: number;
  };
  workflow?: {
    nextSteps: string[];
    automations: any[];
    optimizations: string[];
  };
}

export interface AnalysisPipeline {
  stages: PipelineStage[];
  dependencies: Map<string, string[]>;
  parallelizable: Set<string>;
}

export interface PipelineStage {
  id: string;
  name: string;
  tool: 'kb-mcp' | 'moidvk' | 'hybrid';
  operation: (input: any) => Promise<any>;
  required: boolean;
  weight: number;
}

export class UnifiedOrchestrator extends EventEmitter {
  private config: Required<OrchestratorConfig>;
  private memory: UnifiedMemory;
  private analysisEngine: AnalysisEngine;
  private parallelProcessor: ParallelProcessor;
  private batchProcessor: BatchProcessor;
  private cache: AnalysisCache;
  private moidvkAdapter?: MoidvkAdapter;
  private activeRequests = new Map<string, AnalysisRequest>();
  private executionHistory: OrchestratedResult[] = [];

  constructor(memory: UnifiedMemory, config: OrchestratorConfig = {}) {
    super();

    this.memory = memory;
    this.config = {
      enableParallelProcessing: config.enableParallelProcessing !== false,
      enableCaching: config.enableCaching !== false,
      enableMoidvkIntegration: config.enableMoidvkIntegration !== false,
      enableIntelligentRouting: config.enableIntelligentRouting !== false,
      maxConcurrency: config.maxConcurrency || 8,
      analysisDepth: config.analysisDepth || 'standard',
      moidvkPath: config.moidvkPath || ''
    };

    // Initialize components
    this.analysisEngine = new AnalysisEngine(memory, {
      enableRealTimeAnalysis: false,
      enablePatternDetection: true,
      enableDebtAnalysis: true,
      enableInsightsGeneration: true,
      enableNaturalLanguageQueries: true,
      analysisDepth: this.config.analysisDepth
    });

    this.parallelProcessor = new ParallelProcessor({
      maxWorkers: this.config.maxConcurrency,
      enableStreaming: true,
      priority: 'balanced'
    });

    this.batchProcessor = new BatchProcessor({
      concurrency: this.config.maxConcurrency,
      enableCaching: this.config.enableCaching
    });

    this.cache = new AnalysisCache({
      enableMetrics: true,
      enableDiskCache: true
    });

    // Initialize MOIDVK if configured
    if (this.config.enableMoidvkIntegration && this.config.moidvkPath) {
      this.moidvkAdapter = new MoidvkAdapter(
        { 
          serverPath: this.config.moidvkPath,
          enableIntelligentRouting: this.config.enableIntelligentRouting
        },
        memory
      );
    }

    this.setupEventHandlers();
  }

  /**
   * Execute orchestrated analysis
   */
  async analyze(request: AnalysisRequest): Promise<Result<OrchestratedResult>> {
    const startTime = Date.now();
    const requestId = this.generateRequestId(request);

    try {
      this.activeRequests.set(requestId, request);
      this.emit('analysisStarted', { requestId, request });

      // Check cache first
      if (this.config.enableCaching) {
        const cached = await this.checkCache(request);
        if (cached) {
          return {
            success: true,
            data: this.createResult(request, cached, {
              executionTime: Date.now() - startTime,
              toolsUsed: ['cache'],
              cacheHits: 1,
              parallelTasks: 0,
              confidence: cached.confidence || 0.95
            })
          };
        }
      }

      // Build analysis pipeline
      const pipeline = await this.buildPipeline(request);
      
      // Execute pipeline stages
      const results = await this.executePipeline(pipeline, request);

      // Generate insights and recommendations
      const insights = await this.generateInsights(results, request);
      const recommendations = await this.generateRecommendations(results, request);

      // Create workflow suggestions
      const workflow = await this.createWorkflowSuggestions(results, request);

      // Cache results
      if (this.config.enableCaching) {
        await this.cacheResults(request, results);
      }

      const orchestratedResult = this.createResult(
        request,
        {
          primary: results.primary,
          enhancements: results.enhancements,
          insights,
          recommendations
        },
        {
          executionTime: Date.now() - startTime,
          toolsUsed: results.toolsUsed || [],
          cacheHits: 0,
          parallelTasks: results.parallelTasks || 0,
          confidence: this.calculateConfidence(results)
        },
        workflow
      );

      this.executionHistory.push(orchestratedResult);
      this.activeRequests.delete(requestId);
      this.emit('analysisCompleted', orchestratedResult);

      return { success: true, data: orchestratedResult };

    } catch (error) {
      this.activeRequests.delete(requestId);
      this.emit('analysisError', { requestId, error });
      
      return {
        success: false,
        error: toKBError(error, { operation: 'orchestrate' }).message
      };
    }
  }

  /**
   * Execute batch analysis with optimization
   */
  async analyzeBatch(requests: AnalysisRequest[]): Promise<Result<OrchestratedResult[]>> {
    try {
      this.emit('batchStarted', { count: requests.length });

      // Optimize request order
      const optimizedRequests = await this.optimizeRequestOrder(requests);

      // Group similar requests
      const groups = this.groupSimilarRequests(optimizedRequests);

      // Execute groups in parallel where possible
      const results: OrchestratedResult[] = [];
      
      for (const group of groups) {
        if (group.parallelizable) {
          const groupResults = await Promise.all(
            group.requests.map(req => this.analyze(req))
          );
          results.push(...groupResults.filter(r => r.success).map(r => r.data!));
        } else {
          for (const req of group.requests) {
            const result = await this.analyze(req);
            if (result.success) {
              results.push(result.data!);
            }
          }
        }
      }

      this.emit('batchCompleted', { count: results.length });

      return { success: true, data: results };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'analyzeBatch' }).message
      };
    }
  }

  /**
   * Build analysis pipeline based on request
   */
  private async buildPipeline(request: AnalysisRequest): Promise<AnalysisPipeline> {
    const stages: PipelineStage[] = [];
    const dependencies = new Map<string, string[]>();
    const parallelizable = new Set<string>();

    switch (request.type) {
      case 'file':
        stages.push(
          this.createStage('parse', 'Parse File', 'kb-mcp', async (input) => {
            return await this.analysisEngine.analyzeFile(input.path, input.content);
          }, true, 1.0),
          
          this.createStage('patterns', 'Detect Patterns', 'hybrid', async (input) => {
            if (this.moidvkAdapter) {
              return await this.executeMoidvkHybrid('check_code_practices', input);
            }
            return await this.analysisEngine['patternDetector'].detectPatterns(
              input.content, input.language
            );
          }, false, 0.8),
          
          this.createStage('debt', 'Analyze Debt', 'kb-mcp', async (input) => {
            return await this.analysisEngine['debtAnalyzer'].analyzeTechnicalDebt(
              input.content, input.language
            );
          }, false, 0.6)
        );
        
        parallelizable.add('patterns');
        parallelizable.add('debt');
        break;

      case 'project':
        stages.push(
          this.createStage('discover', 'Discover Files', 'kb-mcp', async (input) => {
            return await this.discoverProjectFiles(input.path);
          }, true, 1.0),
          
          this.createStage('batch-analysis', 'Batch Analysis', 'kb-mcp', async (input) => {
            return await this.batchProcessor.processBatch({
              projectPath: input.path,
              analysisTypes: ['file', 'pattern', 'debt']
            });
          }, true, 0.9),
          
          this.createStage('aggregate', 'Aggregate Results', 'kb-mcp', async (input) => {
            return this.aggregateProjectResults(input);
          }, true, 0.8)
        );
        
        dependencies.set('batch-analysis', ['discover']);
        dependencies.set('aggregate', ['batch-analysis']);
        break;

      case 'query':
        stages.push(
          this.createStage('nlp', 'Process Query', 'kb-mcp', async (input) => {
            return await this.analysisEngine.processQuery(input.query, input.options);
          }, true, 1.0),
          
          this.createStage('semantic', 'Semantic Search', 'hybrid', async (input) => {
            if (this.moidvkAdapter) {
              return await this.executeMoidvkHybrid('semantic_development_search', {
                query: input.query
              });
            }
            return await this.memory.vector.search(input.query);
          }, false, 0.7)
        );
        
        parallelizable.add('semantic');
        break;

      case 'workflow':
        stages.push(
          this.createStage('analyze-workflow', 'Analyze Workflow', 'moidvk', async (input) => {
            if (this.moidvkAdapter) {
              return await this.moidvkAdapter.optimizeWorkflow(
                input.tasks,
                input.context
              );
            }
            return this.analyzeWorkflowLocal(input);
          }, true, 1.0)
        );
        break;
    }

    return { stages, dependencies, parallelizable };
  }

  /**
   * Execute pipeline stages
   */
  private async executePipeline(
    pipeline: AnalysisPipeline, 
    request: AnalysisRequest
  ): Promise<any> {
    const results: any = {
      primary: {},
      enhancements: {},
      toolsUsed: [],
      parallelTasks: 0
    };

    const stageResults = new Map<string, any>();

    for (const stage of pipeline.stages) {
      // Check dependencies
      const deps = pipeline.dependencies.get(stage.id) || [];
      const depResults: any = {};
      for (const dep of deps) {
        depResults[dep] = stageResults.get(dep);
      }

      // Execute stage
      try {
        const input = {
          ...request,
          ...depResults,
          path: request.target,
          content: await this.getContent(request.target)
        };

        const stageResult = await stage.operation(input);
        stageResults.set(stage.id, stageResult);

        // Store results
        if (stage.required) {
          results.primary[stage.id] = stageResult;
        } else {
          results.enhancements[stage.id] = stageResult;
        }

        results.toolsUsed.push(stage.tool);

        if (pipeline.parallelizable.has(stage.id)) {
          results.parallelTasks++;
        }

      } catch (error) {
        if (stage.required) {
          throw error;
        }
        // Log non-critical stage failure
        this.emit('stageError', { stage: stage.id, error });
      }
    }

    return results;
  }

  /**
   * Generate insights from results
   */
  private async generateInsights(results: any, request: AnalysisRequest): Promise<any> {
    const insights = {
      summary: '',
      keyFindings: [],
      trends: [],
      anomalies: []
    };

    // Analyze patterns across results
    if (results.primary.patterns || results.enhancements.patterns) {
      const patterns = [
        ...(results.primary.patterns || []),
        ...(results.enhancements.patterns || [])
      ];

      const patternCounts = this.countPatterns(patterns);
      insights.keyFindings.push({
        type: 'pattern_distribution',
        data: patternCounts,
        significance: 'high'
      });
    }

    // Analyze technical debt trends
    if (results.primary.debt) {
      insights.trends.push({
        type: 'technical_debt',
        direction: this.analyzeTrend('debt', results.primary.debt),
        recommendation: 'Address high-priority debt items'
      });
    }

    // Use ML insights if available
    if (this.executionHistory.length > 10) {
      const historicalInsights = await this.analyzeHistoricalTrends();
      insights.trends.push(...historicalInsights);
    }

    insights.summary = this.generateInsightSummary(insights);

    return insights;
  }

  /**
   * Generate recommendations
   */
  private async generateRecommendations(
    results: any, 
    request: AnalysisRequest
  ): Promise<any> {
    const recommendations = [];

    // Tool recommendations
    if (this.moidvkAdapter && request.context?.userGoals) {
      const toolRecs = await this.moidvkAdapter.getToolRecommendations({
        task: request.context.userGoals.join(', '),
        urgency: request.context.urgency
      });

      if (toolRecs.success) {
        recommendations.push(...toolRecs.data!.map(rec => ({
          type: 'tool',
          ...rec
        })));
      }
    }

    // Code improvement recommendations
    if (results.primary.patterns) {
      const improvements = this.generateImprovementRecommendations(
        results.primary.patterns
      );
      recommendations.push(...improvements);
    }

    // Workflow recommendations
    if (request.type === 'project') {
      const workflowRecs = await this.generateWorkflowRecommendations(results);
      recommendations.push(...workflowRecs);
    }

    return recommendations;
  }

  /**
   * Create workflow suggestions
   */
  private async createWorkflowSuggestions(
    results: any, 
    request: AnalysisRequest
  ): Promise<any> {
    const workflow = {
      nextSteps: [],
      automations: [],
      optimizations: []
    };

    // Determine next steps based on results
    if (results.primary.debt?.totalDebt > 100) {
      workflow.nextSteps.push('Run technical debt reduction sprint');
      workflow.automations.push({
        type: 'debt-tracking',
        description: 'Setup automated debt tracking in CI/CD'
      });
    }

    if (results.primary.patterns?.some((p: any) => p.type === 'anti_pattern')) {
      workflow.nextSteps.push('Refactor anti-pattern occurrences');
      workflow.optimizations.push('Enable pre-commit pattern checking');
    }

    // Add context-aware suggestions
    if (request.context?.urgency === 'high') {
      workflow.nextSteps = workflow.nextSteps.slice(0, 3); // Prioritize top 3
      workflow.optimizations.push('Focus on critical path optimizations');
    }

    return workflow;
  }

  /**
   * Helper methods
   */

  private createStage(
    id: string,
    name: string,
    tool: 'kb-mcp' | 'moidvk' | 'hybrid',
    operation: (input: any) => Promise<any>,
    required: boolean,
    weight: number
  ): PipelineStage {
    return { id, name, tool, operation, required, weight };
  }

  private async executeMoidvkHybrid(tool: string, params: any): Promise<any> {
    if (!this.moidvkAdapter) {
      throw new Error('MOIDVK adapter not configured');
    }

    const result = await this.moidvkAdapter.executeTool({
      tool,
      params,
      context: {
        analysisDepth: this.config.analysisDepth
      }
    });

    return result.success ? result.data : null;
  }

  private async checkCache(request: AnalysisRequest): Promise<any | null> {
    const cacheKey = {
      type: request.type as any,
      identifier: request.target,
      options: request.options
    };

    return await this.cache.get(cacheKey);
  }

  private async cacheResults(request: AnalysisRequest, results: any): Promise<void> {
    const cacheKey = {
      type: request.type as any,
      identifier: request.target,
      options: request.options
    };

    await this.cache.set(cacheKey, results);
  }

  private async getContent(target: string): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      return await fs.readFile(target, 'utf-8');
    } catch {
      return null;
    }
  }

  private generateRequestId(request: AnalysisRequest): string {
    return `${request.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createResult(
    request: AnalysisRequest,
    results: any,
    metadata: any,
    workflow?: any
  ): OrchestratedResult {
    return {
      request,
      results,
      metadata,
      workflow
    };
  }

  private calculateConfidence(results: any): number {
    // Calculate confidence based on multiple factors
    let confidence = 0.5;

    if (results.primary && Object.keys(results.primary).length > 0) {
      confidence += 0.3;
    }

    if (results.enhancements && Object.keys(results.enhancements).length > 0) {
      confidence += 0.15;
    }

    if (results.toolsUsed?.includes('hybrid')) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  private async optimizeRequestOrder(requests: AnalysisRequest[]): Promise<AnalysisRequest[]> {
    // Sort by priority and dependencies
    return requests.sort((a, b) => {
      const priorityA = a.context?.urgency === 'high' ? 3 : 
                       a.context?.urgency === 'normal' ? 2 : 1;
      const priorityB = b.context?.urgency === 'high' ? 3 : 
                       b.context?.urgency === 'normal' ? 2 : 1;
      return priorityB - priorityA;
    });
  }

  private groupSimilarRequests(requests: AnalysisRequest[]): any[] {
    const groups: any[] = [];
    const grouped = new Map<string, AnalysisRequest[]>();

    // Group by type
    for (const req of requests) {
      const key = `${req.type}_${req.context?.urgency || 'normal'}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(req);
    }

    // Create group objects
    for (const [key, reqs] of grouped) {
      groups.push({
        key,
        requests: reqs,
        parallelizable: reqs[0].type !== 'workflow' && reqs.length > 1
      });
    }

    return groups;
  }

  private async discoverProjectFiles(projectPath: string): Promise<any> {
    const glob = (await import('glob')).glob;
    const files = await glob(`${projectPath}/**/*.{ts,js,tsx,jsx,py,rs}`, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**']
    });
    return { files, count: files.length };
  }

  private aggregateProjectResults(input: any): any {
    // Aggregate batch processing results
    return {
      summary: {
        totalFiles: input.files?.length || 0,
        patterns: [],
        debt: {},
        insights: []
      }
    };
  }

  private analyzeWorkflowLocal(input: any): any {
    // Local workflow analysis fallback
    return {
      efficiency: 0.7,
      bottlenecks: ['manual processes'],
      recommendations: ['Automate repetitive tasks']
    };
  }

  private countPatterns(patterns: any[]): any {
    const counts = new Map<string, number>();
    for (const pattern of patterns) {
      const key = `${pattern.type}:${pattern.name}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Object.fromEntries(counts);
  }

  private analyzeTrend(metric: string, data: any): string {
    // Simple trend analysis
    if (this.executionHistory.length < 2) {
      return 'stable';
    }

    // Compare with previous execution
    const previous = this.executionHistory[this.executionHistory.length - 1];
    if (previous.results.primary?.[metric]) {
      const prevValue = previous.results.primary[metric].totalDebt || 0;
      const currValue = data.totalDebt || 0;
      
      if (currValue > prevValue * 1.1) return 'increasing';
      if (currValue < prevValue * 0.9) return 'decreasing';
    }

    return 'stable';
  }

  private async analyzeHistoricalTrends(): Promise<any[]> {
    // Analyze execution history for trends
    return [];
  }

  private generateInsightSummary(insights: any): string {
    const findings = insights.keyFindings.length;
    const trends = insights.trends.length;
    
    return `Analysis revealed ${findings} key findings and ${trends} trends. ` +
           `Focus on ${insights.keyFindings[0]?.type || 'code quality'} improvements.`;
  }

  private generateImprovementRecommendations(patterns: any[]): any[] {
    const recommendations = [];

    const antiPatterns = patterns.filter(p => p.type === 'anti_pattern');
    if (antiPatterns.length > 0) {
      recommendations.push({
        type: 'refactoring',
        priority: 'high',
        description: `Refactor ${antiPatterns.length} anti-patterns`,
        patterns: antiPatterns.map(p => p.name)
      });
    }

    return recommendations;
  }

  private async generateWorkflowRecommendations(results: any): Promise<any[]> {
    return [
      {
        type: 'workflow',
        tool: 'kb analyze watch',
        description: 'Enable real-time analysis for immediate feedback'
      },
      {
        type: 'workflow',
        tool: 'pre-commit hooks',
        description: 'Prevent issues before they reach the repository'
      }
    ];
  }

  private setupEventHandlers(): void {
    // Forward events from components
    this.parallelProcessor.on('taskComplete', (result) => {
      this.emit('taskComplete', result);
    });

    this.batchProcessor.on('progress', (progress) => {
      this.emit('batchProgress', progress);
    });

    if (this.moidvkAdapter) {
      this.moidvkAdapter.on('toolExecuted', (result) => {
        this.emit('moidvkToolExecuted', result);
      });
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus(): any {
    return {
      activeRequests: this.activeRequests.size,
      executionHistory: this.executionHistory.length,
      cacheMetrics: this.cache.getMetrics(),
      parallelProcessorStatus: this.parallelProcessor.getStatus(),
      moidvkIntegration: this.moidvkAdapter ? 'active' : 'disabled'
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.parallelProcessor.shutdown();
    await this.batchProcessor.cleanup();
    await this.cache.clear();
  }
}