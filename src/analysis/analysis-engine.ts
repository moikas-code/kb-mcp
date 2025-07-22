/**
 * Analysis Engine
 * Main orchestrator for all code analysis capabilities
 */

import { CodeAnalyzer, AnalysisResult, AnalysisOptions } from './code-analyzer.js';
import { PatternDetector, Pattern, PatternDetectionOptions } from './patterns/pattern-detector.js';
import { TechnicalDebtAnalyzer, TechnicalDebtReport, DebtAnalysisOptions } from './patterns/debt-analyzer.js';
import { InsightsGenerator, InsightsReport, InsightGenerationOptions } from './insights/insights-generator.js';
import { NaturalLanguageProcessor, QueryResult, NLQueryOptions } from './query/natural-language-processor.js';
import { IncrementalAnalyzer } from './incremental-analyzer.js';
import { UnifiedMemory } from '../graph/unified-memory.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface AnalysisEngineConfig {
  enableRealTimeAnalysis?: boolean;
  enablePatternDetection?: boolean;
  enableDebtAnalysis?: boolean;
  enableInsightsGeneration?: boolean;
  enableNaturalLanguageQueries?: boolean;
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
  batchSize?: number;
  maxConcurrentAnalysis?: number;
}

export interface ComprehensiveAnalysisResult {
  analysis: AnalysisResult;
  patterns: Pattern[];
  technicalDebt: TechnicalDebtReport;
  insights: InsightsReport;
  summary: {
    overallHealth: number;
    criticalIssues: number;
    recommendations: string[];
    metrics: Record<string, number>;
  };
}

export class AnalysisEngine {
  private memory: UnifiedMemory;
  private config: AnalysisEngineConfig;
  
  // Core analyzers
  private codeAnalyzer: CodeAnalyzer;
  private patternDetector: PatternDetector;
  private debtAnalyzer: TechnicalDebtAnalyzer;
  private insightsGenerator: InsightsGenerator;
  private nlProcessor: NaturalLanguageProcessor;
  private incrementalAnalyzer: IncrementalAnalyzer;
  
  // State management
  private analysisCache: Map<string, ComprehensiveAnalysisResult> = new Map();
  private analysisQueue: Set<string> = new Set();
  private isAnalyzing: boolean = false;

  constructor(memory: UnifiedMemory, config: AnalysisEngineConfig = {}) {
    this.memory = memory;
    this.config = {
      enableRealTimeAnalysis: true,
      enablePatternDetection: true,
      enableDebtAnalysis: true,
      enableInsightsGeneration: true,
      enableNaturalLanguageQueries: true,
      analysisDepth: 'detailed',
      batchSize: 10,
      maxConcurrentAnalysis: 3,
      ...config
    };

    this.initializeAnalyzers();
  }

  /**
   * Initialize all analysis components
   */
  private initializeAnalyzers(): void {
    this.codeAnalyzer = new CodeAnalyzer(this.memory);
    this.patternDetector = new PatternDetector(this.memory);
    this.debtAnalyzer = new TechnicalDebtAnalyzer(this.memory);
    this.insightsGenerator = new InsightsGenerator(this.memory);
    this.nlProcessor = new NaturalLanguageProcessor(this.memory);
    this.incrementalAnalyzer = new IncrementalAnalyzer(this.codeAnalyzer, this.memory);

    // Set up real-time analysis if enabled
    if (this.config.enableRealTimeAnalysis) {
      this.setupRealTimeAnalysis();
    }
  }

  /**
   * Start the analysis engine
   */
  async start(): Promise<Result<void>> {
    try {
      if (this.config.enableRealTimeAnalysis) {
        const result = await this.incrementalAnalyzer.initialize();
        if (!result.success) {
          return result;
        }

        // Set up event handlers
        this.incrementalAnalyzer.on('fileAnalyzed', this.handleFileAnalyzed.bind(this));
        this.incrementalAnalyzer.on('analysisComplete', this.handleAnalysisComplete.bind(this));
        this.incrementalAnalyzer.on('error', this.handleAnalysisError.bind(this));
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'start' })
      };
    }
  }

  /**
   * Stop the analysis engine
   */
  async stop(): Promise<Result<void>> {
    try {
      if (this.incrementalAnalyzer) {
        this.incrementalAnalyzer.removeAllListeners();
      }
      
      this.analysisCache.clear();
      this.analysisQueue.clear();
      this.isAnalyzing = false;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'stop' })
      };
    }
  }

  /**
   * Perform comprehensive analysis of a project
   */
  async analyzeProject(
    projectPath: string,
    options: Partial<AnalysisOptions & PatternDetectionOptions & DebtAnalysisOptions & InsightGenerationOptions> = {}
  ): Promise<Result<ComprehensiveAnalysisResult>> {
    try {
      // Check cache first
      const cacheKey = `project_${projectPath}_${JSON.stringify(options)}`;
      if (this.analysisCache.has(cacheKey)) {
        return {
          success: true,
          data: this.analysisCache.get(cacheKey)!
        };
      }

      // Prevent concurrent analysis of the same project
      if (this.analysisQueue.has(projectPath)) {
        return {
          success: false,
          error: toKBError(new Error('Analysis already in progress for this project'), { operation: 'analyzeProject' })
        };
      }

      this.analysisQueue.add(projectPath);
      this.isAnalyzing = true;

      try {
        // Step 1: Code Analysis
        const analysisResult = await this.codeAnalyzer.analyzeProject(projectPath, {
          includeTests: options.includeTests || false,
          maxDepth: options.maxDepth || 10,
          languages: options.languages || ['typescript', 'javascript'],
          ...options
        });

        if (!analysisResult.success) {
          return analysisResult as any;
        }

        const analysis = analysisResult.data;

        // Step 2: Pattern Detection (if enabled)
        let patterns: Pattern[] = [];
        if (this.config.enablePatternDetection) {
          const patternResult = await this.patternDetector.detectPatterns(
            analysis.entities,
            analysis.relationships,
            {
              includeDesignPatterns: true,
              includeAntiPatterns: true,
              includeCodeSmells: true,
              ...options
            }
          );

          if (patternResult.success) {
            patterns = patternResult.data;
          }
        }

        // Step 3: Technical Debt Analysis (if enabled)
        let technicalDebt: TechnicalDebtReport = {
          summary: {
            totalItems: 0,
            totalEstimatedHours: 0,
            averagePriority: 0,
            debtRatio: 0,
            trends: { improving: false, changeRate: 0 }
          },
          byType: {},
          bySeverity: {},
          topPriorities: [],
          recommendations: { quickWins: [], majorRefactoring: [], longTermGoals: [] },
          metrics: {
            codeComplexity: 100,
            duplicatedCode: 100,
            testCoverage: 75,
            documentationCoverage: 100,
            dependencyHealth: 100
          }
        };

        if (this.config.enableDebtAnalysis) {
          const debtResult = await this.debtAnalyzer.analyzeTechnicalDebt(
            analysis.entities,
            analysis.relationships,
            {
              includeEstimates: true,
              includeTrends: true,
              ...options
            }
          );

          if (debtResult.success) {
            technicalDebt = debtResult.data;
          }
        }

        // Step 4: Insights Generation (if enabled)
        let insights: InsightsReport = {
          summary: {
            totalInsights: 0,
            criticalInsights: 0,
            architecturalConcerns: 0,
            quickWins: 0,
            overallHealth: 100
          },
          byType: {},
          byCategory: {},
          prioritizedInsights: [],
          actionPlan: { immediate: [], shortTerm: [], longTerm: [] },
          trends: {
            codeGrowth: 'stable',
            complexityTrend: 'stable',
            qualityTrend: 'stable',
            recommendations: []
          }
        };

        if (this.config.enableInsightsGeneration) {
          const insightsResult = await this.insightsGenerator.generateInsights(
            analysis,
            patterns,
            technicalDebt,
            {
              includeCodeExamples: true,
              analysisDepth: this.config.analysisDepth,
              ...options
            }
          );

          if (insightsResult.success) {
            insights = insightsResult.data;
          }
        }

        // Step 5: Generate Summary
        const summary = this.generateSummary(analysis, patterns, technicalDebt, insights);

        const result: ComprehensiveAnalysisResult = {
          analysis,
          patterns,
          technicalDebt,
          insights,
          summary
        };

        // Cache the result
        this.analysisCache.set(cacheKey, result);

        return {
          success: true,
          data: result
        };
      } finally {
        this.analysisQueue.delete(projectPath);
        this.isAnalyzing = false;
      }
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'analyzeProject' })
      };
    }
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(
    filePath: string,
    content: string,
    options: Partial<PatternDetectionOptions & DebtAnalysisOptions> = {}
  ): Promise<Result<ComprehensiveAnalysisResult>> {
    try {
      // Code analysis
      const analysisResult = await this.codeAnalyzer.analyzeFile(filePath, content);
      if (!analysisResult.success) {
        return analysisResult as any;
      }

      const analysis = analysisResult.data;

      // Pattern detection
      let patterns: Pattern[] = [];
      if (this.config.enablePatternDetection) {
        const patternResult = await this.patternDetector.detectPatternsInFile(
          filePath,
          analysis.entities,
          analysis.relationships,
          options
        );

        if (patternResult.success) {
          patterns = patternResult.data;
        }
      }

      // Technical debt analysis
      let technicalDebt: TechnicalDebtReport = this.createEmptyDebtReport();
      if (this.config.enableDebtAnalysis) {
        const debtResult = await this.debtAnalyzer.analyzeTechnicalDebt(
          analysis.entities,
          analysis.relationships,
          options
        );

        if (debtResult.success) {
          technicalDebt = debtResult.data;
        }
      }

      // Generate basic insights
      let insights: InsightsReport = this.createEmptyInsightsReport();
      if (this.config.enableInsightsGeneration) {
        const insightsResult = await this.insightsGenerator.generateInsights(
          analysis,
          patterns,
          technicalDebt
        );

        if (insightsResult.success) {
          insights = insightsResult.data;
        }
      }

      const summary = this.generateSummary(analysis, patterns, technicalDebt, insights);

      return {
        success: true,
        data: {
          analysis,
          patterns,
          technicalDebt,
          insights,
          summary
        }
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'analyzeFile' })
      };
    }
  }

  /**
   * Process natural language query
   */
  async processQuery(query: string, options: NLQueryOptions = {}): Promise<Result<QueryResult>> {
    if (!this.config.enableNaturalLanguageQueries) {
      return {
        success: false,
        error: toKBError(new Error('Natural language queries are disabled'), { operation: 'processQuery' })
      };
    }

    return this.nlProcessor.processQuery(query, options);
  }

  /**
   * Get query suggestions
   */
  async getQuerySuggestions(context?: string): Promise<Result<string[]>> {
    if (!this.config.enableNaturalLanguageQueries) {
      return {
        success: false,
        error: toKBError(new Error('Natural language queries are disabled'), { operation: 'getQuerySuggestions' })
      };
    }

    return this.nlProcessor.getQuerySuggestions(context);
  }

  /**
   * Get analysis status
   */
  getAnalysisStatus(): {
    isAnalyzing: boolean;
    queueSize: number;
    cacheSize: number;
    config: AnalysisEngineConfig;
  } {
    return {
      isAnalyzing: this.isAnalyzing,
      queueSize: this.analysisQueue.size,
      cacheSize: this.analysisCache.size,
      config: this.config
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AnalysisEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if real-time analysis setting changed
    if (newConfig.enableRealTimeAnalysis !== undefined) {
      this.setupRealTimeAnalysis();
    }
  }

  /**
   * Set up real-time analysis
   */
  private setupRealTimeAnalysis(): void {
    if (this.config.enableRealTimeAnalysis && this.incrementalAnalyzer) {
      // Start watching for file changes
      this.incrementalAnalyzer.start();
    } else if (this.incrementalAnalyzer) {
      // Stop watching
      this.incrementalAnalyzer.stop();
    }
  }

  /**
   * Handle file analysis completion
   */
  private handleFileAnalyzed(event: { filePath: string; result: any }): void {
    // Invalidate cache for files that might be affected
    this.invalidateRelatedCache(event.filePath);
  }

  /**
   * Handle analysis completion
   */
  private handleAnalysisComplete(event: { projectPath: string; result: any }): void {
    // Update cache or trigger notifications
    console.log(`Analysis completed for ${event.projectPath}`);
  }

  /**
   * Handle analysis errors
   */
  private handleAnalysisError(error: Error): void {
    console.error('Analysis error:', error);
    this.isAnalyzing = false;
  }

  /**
   * Invalidate cache entries related to a file
   */
  private invalidateRelatedCache(filePath: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.analysisCache) {
      if (key.includes(filePath) || key.startsWith('project_')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.analysisCache.delete(key));
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(
    analysis: AnalysisResult,
    patterns: Pattern[],
    technicalDebt: TechnicalDebtReport,
    insights: InsightsReport
  ): ComprehensiveAnalysisResult['summary'] {
    const criticalPatterns = patterns.filter(p => p.severity === 'critical').length;
    const criticalDebt = technicalDebt.topPriorities.filter(d => d.severity === 'critical').length;
    const criticalInsights = insights.summary.criticalInsights;

    const criticalIssues = criticalPatterns + criticalDebt + criticalInsights;

    // Calculate overall health (0-100)
    const healthFactors = {
      complexity: Math.max(0, 100 - (analysis.metrics.complexity / analysis.metrics.functions) * 5),
      patterns: Math.max(0, 100 - criticalPatterns * 20),
      debt: Math.max(0, 100 - technicalDebt.summary.debtRatio * 100),
      insights: insights.summary.overallHealth
    };

    const overallHealth = Math.round(
      Object.values(healthFactors).reduce((sum, score) => sum + score, 0) / Object.keys(healthFactors).length
    );

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (criticalIssues > 0) {
      recommendations.push(`Address ${criticalIssues} critical issues immediately`);
    }
    
    if (technicalDebt.recommendations.quickWins.length > 0) {
      recommendations.push(`Consider ${technicalDebt.recommendations.quickWins.length} quick wins for immediate improvement`);
    }
    
    if (analysis.metrics.complexity / analysis.metrics.functions > 10) {
      recommendations.push('Focus on reducing code complexity in high-complexity functions');
    }

    if (recommendations.length === 0) {
      recommendations.push('Code quality is good, continue current practices');
    }

    return {
      overallHealth,
      criticalIssues,
      recommendations,
      metrics: {
        totalFunctions: analysis.metrics.functions,
        totalClasses: analysis.metrics.classes,
        averageComplexity: analysis.metrics.complexity / analysis.metrics.functions,
        totalPatterns: patterns.length,
        technicalDebtItems: technicalDebt.summary.totalItems,
        totalInsights: insights.summary.totalInsights
      }
    };
  }

  /**
   * Create empty debt report
   */
  private createEmptyDebtReport(): TechnicalDebtReport {
    return {
      summary: {
        totalItems: 0,
        totalEstimatedHours: 0,
        averagePriority: 0,
        debtRatio: 0,
        trends: { improving: false, changeRate: 0 }
      },
      byType: {},
      bySeverity: {},
      topPriorities: [],
      recommendations: { quickWins: [], majorRefactoring: [], longTermGoals: [] },
      metrics: {
        codeComplexity: 100,
        duplicatedCode: 100,
        testCoverage: 75,
        documentationCoverage: 100,
        dependencyHealth: 100
      }
    };
  }

  /**
   * Create empty insights report
   */
  private createEmptyInsightsReport(): InsightsReport {
    return {
      summary: {
        totalInsights: 0,
        criticalInsights: 0,
        architecturalConcerns: 0,
        quickWins: 0,
        overallHealth: 100
      },
      byType: {},
      byCategory: {},
      prioritizedInsights: [],
      actionPlan: { immediate: [], shortTerm: [], longTerm: [] },
      trends: {
        codeGrowth: 'stable',
        complexityTrend: 'stable',
        qualityTrend: 'stable',
        recommendations: []
      }
    };
  }
}