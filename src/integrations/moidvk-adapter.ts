/**
 * MOIDVK Integration Adapter
 * Bridges KB-MCP's graph intelligence with MOIDVK's specialized development tools
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';
import { UnifiedMemory } from '../graph/unified-memory.js';

export interface MoidvkConfig {
  serverPath: string;
  toolTimeout?: number;
  maxConcurrentTools?: number;
  enableIntelligentRouting?: boolean;
  cacheResults?: boolean;
  preferredTools?: Partial<MoidvkToolPreferences>;
}

export interface MoidvkToolPreferences {
  codeAnalysis: 'moidvk' | 'kb-mcp' | 'hybrid';
  patternDetection: 'moidvk' | 'kb-mcp' | 'hybrid';
  securityScanning: 'moidvk' | 'kb-mcp' | 'hybrid';
  semanticSearch: 'moidvk' | 'kb-mcp' | 'hybrid';
  formatting: 'moidvk' | 'kb-mcp' | 'hybrid';
}

export interface MoidvkToolCall {
  tool: string;
  params: any;
  context?: {
    projectPath?: string;
    language?: string;
    analysisDepth?: 'quick' | 'standard' | 'comprehensive';
    priority?: 'low' | 'normal' | 'high';
  };
}

export interface MoidvkToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata: {
    tool: string;
    executionTime: number;
    memoryUsage?: number;
    cacheHit?: boolean;
    enhancedByKB?: boolean;
  };
}

export interface IntelligentRoutingDecision {
  selectedTool: 'moidvk' | 'kb-mcp' | 'hybrid';
  reasoning: string;
  confidence: number;
  fallbackStrategy?: string;
  enhancementStrategy?: string;
}

export interface WorkflowOptimization {
  taskSequence: string[];
  parallelizable: string[];
  dependencies: Record<string, string[]>;
  estimatedTime: number;
  optimizations: string[];
}

export class MoidvkAdapter extends EventEmitter {
  private config: Required<MoidvkConfig>;
  private memory: UnifiedMemory;
  private activeTasks = new Map<string, ChildProcess>();
  private resultCache = new Map<string, { result: any; timestamp: number }>();
  private toolUsageStats = new Map<string, { 
    calls: number; 
    successRate: number; 
    averageTime: number;
    preferredContext: string[];
  }>();

  constructor(config: MoidvkConfig, memory: UnifiedMemory) {
    super();

    this.config = {
      serverPath: config.serverPath,
      toolTimeout: config.toolTimeout || 60000,
      maxConcurrentTools: config.maxConcurrentTools || 5,
      enableIntelligentRouting: config.enableIntelligentRouting !== false,
      cacheResults: config.cacheResults !== false,
      preferredTools: {
        codeAnalysis: 'hybrid',
        patternDetection: 'hybrid',
        securityScanning: 'moidvk',
        semanticSearch: 'hybrid',
        formatting: 'moidvk',
        ...config.preferredTools
      }
    };

    this.memory = memory;
    this.setupEventHandlers();
  }

  /**
   * Execute MOIDVK tool with intelligent routing and enhancement
   */
  async executeTool(toolCall: MoidvkToolCall): Promise<Result<MoidvkToolResult>> {
    try {
      const startTime = Date.now();

      // Check cache first
      if (this.config.cacheResults) {
        const cached = this.getCachedResult(toolCall);
        if (cached) {
          return {
            success: true,
            data: {
              ...cached,
              metadata: {
                ...cached.metadata,
                cacheHit: true,
                executionTime: Date.now() - startTime
              }
            }
          };
        }
      }

      // Intelligent routing decision
      let routingDecision: IntelligentRoutingDecision | null = null;
      if (this.config.enableIntelligentRouting) {
        routingDecision = await this.makeRoutingDecision(toolCall);
      }

      // Execute based on routing decision
      let result: MoidvkToolResult;
      
      if (routingDecision?.selectedTool === 'hybrid') {
        result = await this.executeHybridTool(toolCall, routingDecision);
      } else if (routingDecision?.selectedTool === 'kb-mcp') {
        result = await this.executeKBTool(toolCall);
      } else {
        result = await this.executeMoidvkTool(toolCall);
      }

      // Enhance with KB-MCP intelligence if configured
      if (this.shouldEnhanceResult(toolCall, routingDecision)) {
        result = await this.enhanceWithKBIntelligence(result, toolCall);
      }

      // Cache result
      if (this.config.cacheResults && result.success) {
        this.cacheResult(toolCall, result);
      }

      // Update statistics
      this.updateToolStats(toolCall.tool, result);

      return { success: true, data: result };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'executeTool' }).message
      };
    }
  }

  /**
   * Optimize development workflow by analyzing task patterns
   */
  async optimizeWorkflow(
    tasks: MoidvkToolCall[], 
    context: { projectType?: string; teamSize?: number; deadline?: Date }
  ): Promise<Result<WorkflowOptimization>> {
    try {
      // Analyze task dependencies
      const dependencies = await this.analyzeDependencies(tasks);
      
      // Identify parallelizable tasks
      const parallelizable = await this.identifyParallelTasks(tasks, dependencies);
      
      // Optimize sequence based on KB insights
      const optimizedSequence = await this.optimizeTaskSequence(tasks, dependencies, context);
      
      // Estimate execution time
      const estimatedTime = await this.estimateWorkflowTime(optimizedSequence);
      
      // Generate optimization recommendations
      const optimizations = await this.generateOptimizations(tasks, context);

      const workflow: WorkflowOptimization = {
        taskSequence: optimizedSequence,
        parallelizable,
        dependencies,
        estimatedTime,
        optimizations
      };

      // Store workflow optimization in KB for future reference
      await this.storeWorkflowOptimization(workflow, context);

      return { success: true, data: workflow };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'optimizeWorkflow' }).message
      };
    }
  }

  /**
   * Get intelligent tool recommendations based on context and history
   */
  async getToolRecommendations(
    context: {
      task: string;
      codebase?: string;
      language?: string;
      previousTools?: string[];
      urgency?: 'low' | 'normal' | 'high';
    }
  ): Promise<Result<Array<{ tool: string; confidence: number; reasoning: string }>>> {
    try {
      // Query KB for similar scenarios
      const similarScenarios = await this.memory.graph.query(`
        MATCH (scenario:Scenario)-[:USES]->(tool:Tool)
        WHERE scenario.task CONTAINS "${context.task}"
        ${context.language ? `AND scenario.language = "${context.language}"` : ''}
        RETURN tool.name, scenario.successRate, scenario.averageTime
        ORDER BY scenario.successRate DESC, scenario.averageTime ASC
        LIMIT 10
      `);

      // Analyze current tool performance stats
      const toolPerformance = this.analyzeToolPerformance(context);
      
      // Combine KB insights with performance data
      const recommendations = await this.generateToolRecommendations(
        similarScenarios.success ? similarScenarios.data : [],
        toolPerformance,
        context
      );

      return { success: true, data: recommendations };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'getToolRecommendations' }).message
      };
    }
  }

  /**
   * Batch execute multiple tools with optimization
   */
  async executeBatch(
    toolCalls: MoidvkToolCall[],
    options: {
      maxParallel?: number;
      failFast?: boolean;
      optimizeOrder?: boolean;
    } = {}
  ): Promise<Result<MoidvkToolResult[]>> {
    try {
      const maxParallel = options.maxParallel || this.config.maxConcurrentTools;
      const results: MoidvkToolResult[] = [];
      const errors: string[] = [];

      // Optimize execution order if requested
      let executionOrder = toolCalls;
      if (options.optimizeOrder) {
        const optimization = await this.optimizeWorkflow(toolCalls, {});
        if (optimization.success) {
          executionOrder = optimization.data!.taskSequence.map(taskName => 
            toolCalls.find(tc => tc.tool === taskName)!
          ).filter(Boolean);
        }
      }

      // Execute in batches with concurrency control
      for (let i = 0; i < executionOrder.length; i += maxParallel) {
        const batch = executionOrder.slice(i, i + maxParallel);
        
        const batchPromises = batch.map(async (toolCall) => {
          const result = await this.executeTool(toolCall);
          if (result.success) {
            return result.data!;
          } else {
            errors.push(`${toolCall.tool}: ${result.error}`);
            if (options.failFast) {
              throw new Error(result.error);
            }
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean) as MoidvkToolResult[]);

        if (options.failFast && errors.length > 0) {
          break;
        }
      }

      if (errors.length > 0 && results.length === 0) {
        return {
          success: false,
          error: `All tools failed: ${errors.join(', ')}`
        };
      }

      return { success: true, data: results };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'executeBatch' }).message
      };
    }
  }

  /**
   * Make intelligent routing decision
   */
  private async makeRoutingDecision(toolCall: MoidvkToolCall): Promise<IntelligentRoutingDecision> {
    const contextScore = await this.analyzeContext(toolCall);
    const toolStats = this.toolUsageStats.get(toolCall.tool);
    const workload = this.getCurrentWorkload();

    let selectedTool: 'moidvk' | 'kb-mcp' | 'hybrid' = 'moidvk';
    let confidence = 0.7;
    let reasoning = 'Default MOIDVK routing';

    // Analyze context and make decision
    if (contextScore.complexityScore > 0.8) {
      selectedTool = 'hybrid';
      confidence = 0.9;
      reasoning = 'High complexity task benefits from hybrid approach';
    } else if (contextScore.semanticScore > 0.8) {
      selectedTool = 'kb-mcp';
      confidence = 0.85;
      reasoning = 'Task requires semantic understanding, KB-MCP preferred';
    } else if (workload.moidvkLoad > 0.9) {
      selectedTool = 'kb-mcp';
      confidence = 0.75;
      reasoning = 'MOIDVK heavily loaded, routing to KB-MCP';
    }

    // Check tool preferences
    const preference = this.getToolPreference(toolCall.tool);
    if (preference && preference !== 'hybrid') {
      selectedTool = preference;
      confidence *= 0.9;
      reasoning += ` (overridden by preference: ${preference})`;
    }

    return {
      selectedTool,
      reasoning,
      confidence,
      fallbackStrategy: selectedTool === 'moidvk' ? 'kb-mcp' : 'moidvk',
      enhancementStrategy: selectedTool !== 'hybrid' ? 'post-process with KB' : undefined
    };
  }

  /**
   * Execute hybrid tool combining MOIDVK and KB-MCP
   */
  private async executeHybridTool(
    toolCall: MoidvkToolCall,
    routing: IntelligentRoutingDecision
  ): Promise<MoidvkToolResult> {
    const startTime = Date.now();

    try {
      // Execute MOIDVK tool first for specialized analysis
      const moidvkResult = await this.executeMoidvkTool(toolCall);
      
      // Enhance with KB-MCP semantic intelligence
      const kbEnhancement = await this.executeKBTool({
        ...toolCall,
        tool: `enhance_${toolCall.tool}`
      });

      // Merge results intelligently
      const mergedResult = await this.mergeResults(moidvkResult, kbEnhancement);

      return {
        success: true,
        data: mergedResult,
        metadata: {
          tool: `hybrid_${toolCall.tool}`,
          executionTime: Date.now() - startTime,
          enhancedByKB: true
        }
      };

    } catch (error) {
      // Fallback to single tool if hybrid fails
      return await this.executeMoidvkTool(toolCall);
    }
  }

  /**
   * Execute MOIDVK tool directly
   */
  private async executeMoidvkTool(toolCall: MoidvkToolCall): Promise<MoidvkToolResult> {
    const startTime = Date.now();
    const taskId = `moidvk_${Date.now()}_${Math.random()}`;

    return new Promise((resolve, reject) => {
      const args = [
        'run',
        this.config.serverPath,
        toolCall.tool,
        JSON.stringify(toolCall.params)
      ];

      const child = spawn('node', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.toolTimeout
      });

      this.activeTasks.set(taskId, child);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        this.activeTasks.delete(taskId);

        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({
              success: true,
              data: result,
              metadata: {
                tool: toolCall.tool,
                executionTime: Date.now() - startTime
              }
            });
          } catch (error) {
            resolve({
              success: false,
              error: 'Failed to parse MOIDVK result',
              metadata: {
                tool: toolCall.tool,
                executionTime: Date.now() - startTime
              }
            });
          }
        } else {
          resolve({
            success: false,
            error: stderr || 'MOIDVK tool execution failed',
            metadata: {
              tool: toolCall.tool,
              executionTime: Date.now() - startTime
            }
          });
        }
      });

      child.on('error', (error) => {
        this.activeTasks.delete(taskId);
        resolve({
          success: false,
          error: error.message,
          metadata: {
            tool: toolCall.tool,
            executionTime: Date.now() - startTime
          }
        });
      });
    });
  }

  /**
   * Execute KB-MCP equivalent tool
   */
  private async executeKBTool(toolCall: MoidvkToolCall): Promise<MoidvkToolResult> {
    const startTime = Date.now();

    try {
      // Map MOIDVK tool to KB-MCP capability
      const kbResult = await this.mapToKBCapability(toolCall);

      return {
        success: true,
        data: kbResult,
        metadata: {
          tool: `kb_${toolCall.tool}`,
          executionTime: Date.now() - startTime,
          enhancedByKB: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          tool: `kb_${toolCall.tool}`,
          executionTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Map MOIDVK tool to KB-MCP capability
   */
  private async mapToKBCapability(toolCall: MoidvkToolCall): Promise<any> {
    switch (toolCall.tool) {
      case 'semantic_development_search':
        return await this.memory.vector.search(
          toolCall.params.query,
          { threshold: 0.7, limit: 10 }
        );
        
      case 'check_code_practices':
        // Use KB pattern detection
        return await this.analyzeCodePractices(toolCall.params);
        
      case 'intelligent_development_analysis':
        // Use KB project analysis
        return await this.performIntelligentAnalysis(toolCall.params);
        
      default:
        throw new Error(`No KB mapping for tool: ${toolCall.tool}`);
    }
  }

  /**
   * Helper methods for tool execution
   */
  private async analyzeCodePractices(params: any): Promise<any> {
    // Implement KB-MCP code practice analysis
    const query = `
      MATCH (file:File)-[:CONTAINS]->(pattern:Pattern)
      WHERE file.path = "${params.filePath}"
      RETURN pattern.type, pattern.severity, pattern.description
    `;
    
    return await this.memory.graph.query(query);
  }

  private async performIntelligentAnalysis(params: any): Promise<any> {
    // Implement KB-MCP intelligent analysis
    const insights = await this.memory.graph.query(`
      MATCH (project:Project)-[:CONTAINS]->(file:File)-[:HAS_ISSUE]->(issue:Issue)
      WHERE project.path = "${params.projectPath}"
      RETURN issue.type, COUNT(issue) as count
      ORDER BY count DESC
    `);
    
    return insights;
  }

  /**
   * Utility methods
   */
  private getCachedResult(toolCall: MoidvkToolCall): MoidvkToolResult | null {
    const key = this.generateCacheKey(toolCall);
    const cached = this.resultCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour TTL
      return cached.result;
    }
    
    return null;
  }

  private cacheResult(toolCall: MoidvkToolCall, result: MoidvkToolResult): void {
    const key = this.generateCacheKey(toolCall);
    this.resultCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  private generateCacheKey(toolCall: MoidvkToolCall): string {
    return `${toolCall.tool}_${JSON.stringify(toolCall.params)}_${JSON.stringify(toolCall.context)}`;
  }

  private shouldEnhanceResult(
    toolCall: MoidvkToolCall, 
    routing: IntelligentRoutingDecision | null
  ): boolean {
    return routing?.enhancementStrategy !== undefined ||
           this.config.preferredTools.codeAnalysis === 'hybrid';
  }

  private async enhanceWithKBIntelligence(
    result: MoidvkToolResult, 
    toolCall: MoidvkToolCall
  ): Promise<MoidvkToolResult> {
    // Add semantic context and cross-references
    const enhancement = await this.memory.vector.search(
      JSON.stringify(result.data),
      { threshold: 0.6, limit: 5 }
    );

    return {
      ...result,
      data: {
        ...result.data,
        kbEnhancements: enhancement.success ? enhancement.data : [],
        semanticContext: await this.generateSemanticContext(toolCall)
      },
      metadata: {
        ...result.metadata,
        enhancedByKB: true
      }
    };
  }

  private async generateSemanticContext(toolCall: MoidvkToolCall): Promise<any> {
    // Generate semantic context using KB intelligence
    return {
      relatedPatterns: [],
      crossReferences: [],
      recommendations: []
    };
  }

  private setupEventHandlers(): void {
    this.on('toolExecuted', (result) => {
      this.emit('toolExecuted', result);
    });

    this.on('workflowOptimized', (optimization) => {
      this.emit('workflowOptimized', optimization);
    });
  }

  // Additional helper methods would be implemented here...
  private async analyzeDependencies(tasks: MoidvkToolCall[]): Promise<Record<string, string[]>> {
    // Implement dependency analysis
    return {};
  }

  private async identifyParallelTasks(tasks: MoidvkToolCall[], dependencies: Record<string, string[]>): Promise<string[]> {
    // Implement parallel task identification
    return [];
  }

  private async optimizeTaskSequence(tasks: MoidvkToolCall[], dependencies: Record<string, string[]>, context: any): Promise<string[]> {
    // Implement task sequence optimization
    return tasks.map(t => t.tool);
  }

  private async estimateWorkflowTime(sequence: string[]): Promise<number> {
    // Implement time estimation
    return sequence.length * 5000; // 5 seconds per task estimate
  }

  private async generateOptimizations(tasks: MoidvkToolCall[], context: any): Promise<string[]> {
    // Implement optimization generation
    return ['Use parallel execution where possible', 'Cache intermediate results'];
  }

  private async storeWorkflowOptimization(workflow: WorkflowOptimization, context: any): Promise<void> {
    // Store optimization in KB for future reference
  }

  private analyzeToolPerformance(context: any): any {
    // Analyze current tool performance
    return {};
  }

  private async generateToolRecommendations(scenarios: any[], performance: any, context: any): Promise<Array<{ tool: string; confidence: number; reasoning: string }>> {
    // Generate tool recommendations
    return [];
  }

  private async analyzeContext(toolCall: MoidvkToolCall): Promise<{ complexityScore: number; semanticScore: number }> {
    // Analyze context for routing decisions
    return { complexityScore: 0.5, semanticScore: 0.5 };
  }

  private getCurrentWorkload(): { moidvkLoad: number; kbLoad: number } {
    // Get current system workload
    return { moidvkLoad: this.activeTasks.size / this.config.maxConcurrentTools, kbLoad: 0.3 };
  }

  private getToolPreference(tool: string): 'moidvk' | 'kb-mcp' | 'hybrid' | null {
    // Get tool preference from config
    return null;
  }

  private async mergeResults(moidvkResult: MoidvkToolResult, kbResult: MoidvkToolResult): Promise<any> {
    // Merge results from different tools
    return {
      moidvk: moidvkResult.data,
      kbEnhancement: kbResult.data,
      merged: true
    };
  }

  private updateToolStats(tool: string, result: MoidvkToolResult): void {
    const stats = this.toolUsageStats.get(tool) || {
      calls: 0,
      successRate: 0,
      averageTime: 0,
      preferredContext: []
    };

    stats.calls++;
    stats.successRate = (stats.successRate * (stats.calls - 1) + (result.success ? 1 : 0)) / stats.calls;
    stats.averageTime = (stats.averageTime * (stats.calls - 1) + result.metadata.executionTime) / stats.calls;

    this.toolUsageStats.set(tool, stats);
  }
}