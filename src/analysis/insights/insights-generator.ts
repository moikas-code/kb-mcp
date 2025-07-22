/**
 * Insights Generator
 * Generates intelligent insights and recommendations from code analysis
 */

import { CodeEntity, CodeRelationship, AnalysisResult } from '../code-analyzer.js';
import { Pattern } from '../patterns/pattern-detector.js';
import { TechnicalDebtItem, TechnicalDebtReport } from '../patterns/debt-analyzer.js';
import { UnifiedMemory } from '../../graph/unified-memory.js';
import { Result } from '../../types/index.js';
import { toKBError } from '../../types/error-utils.js';

export interface Insight {
  id: string;
  type: 'architecture' | 'quality' | 'performance' | 'security' | 'maintainability' | 'best_practice';
  category: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number; // 0-1
  impact: {
    scope: 'file' | 'module' | 'project';
    magnitude: 'low' | 'medium' | 'high';
    areas: string[];
  };
  evidence: {
    entities: string[];
    patterns: string[];
    metrics: Record<string, number>;
    codeExamples?: Array<{
      filePath: string;
      startLine: number;
      endLine: number;
      description: string;
    }>;
  };
  recommendations: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    effort: 'minimal' | 'moderate' | 'significant';
    benefit: string;
    steps?: string[];
  }>;
  relatedInsights: string[];
  metadata: Record<string, any>;
}

export interface InsightsReport {
  summary: {
    totalInsights: number;
    criticalInsights: number;
    architecturalConcerns: number;
    quickWins: number;
    overallHealth: number; // 0-100
  };
  byType: Record<string, Insight[]>;
  byCategory: Record<string, Insight[]>;
  prioritizedInsights: Insight[];
  actionPlan: {
    immediate: Insight[];
    shortTerm: Insight[];
    longTerm: Insight[];
  };
  trends: {
    codeGrowth: string;
    complexityTrend: string;
    qualityTrend: string;
    recommendations: string[];
  };
}

export interface InsightGenerationOptions {
  includeTypes?: Insight['type'][];
  minConfidence?: number;
  includeCodeExamples?: boolean;
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
  focusAreas?: string[];
}

export class InsightsGenerator {
  private memory: UnifiedMemory;
  private insightRules: Map<string, InsightRule> = new Map();

  constructor(memory: UnifiedMemory) {
    this.memory = memory;
    this.initializeInsightRules();
  }

  /**
   * Generate insights from analysis results
   */
  async generateInsights(
    analysisResult: AnalysisResult,
    patterns: Pattern[],
    technicalDebt: TechnicalDebtReport,
    options: InsightGenerationOptions = {}
  ): Promise<Result<InsightsReport>> {
    try {
      const insights: Insight[] = [];

      // Apply each insight rule
      for (const [ruleId, rule] of this.insightRules) {
        if (this.shouldApplyRule(rule, options)) {
          const ruleInsights = await rule.generate(analysisResult, patterns, technicalDebt);
          insights.push(...ruleInsights);
        }
      }

      // Filter and enhance insights
      const filteredInsights = this.filterInsights(insights, options);
      const enhancedInsights = await this.enhanceInsights(filteredInsights, analysisResult);
      const prioritizedInsights = this.prioritizeInsights(enhancedInsights);

      // Generate comprehensive report
      const report = this.generateReport(prioritizedInsights, analysisResult, patterns, technicalDebt);

      return {
        success: true,
        data: report
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'generateInsights' })
      };
    }
  }

  /**
   * Generate architectural insights
   */
  async generateArchitecturalInsights(
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): Promise<Result<Insight[]>> {
    try {
      const insights: Insight[] = [];
      
      // Analyze module structure
      const modules = entities.filter(e => e.type === 'Module');
      const moduleInsights = await this.analyzeModuleStructure(modules, relationships);
      insights.push(...moduleInsights);

      // Analyze dependency patterns
      const dependencyInsights = await this.analyzeDependencyPatterns(entities, relationships);
      insights.push(...dependencyInsights);

      // Analyze layering
      const layeringInsights = await this.analyzeLayering(entities, relationships);
      insights.push(...layeringInsights);

      return {
        success: true,
        data: insights
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'generateArchitecturalInsights' })
      };
    }
  }

  /**
   * Generate performance insights
   */
  async generatePerformanceInsights(
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): Promise<Result<Insight[]>> {
    try {
      const insights: Insight[] = [];

      // Analyze complexity hotspots
      const complexityInsights = await this.analyzeComplexityHotspots(entities);
      insights.push(...complexityInsights);

      // Analyze potential bottlenecks
      const bottleneckInsights = await this.analyzeBottlenecks(entities, relationships);
      insights.push(...bottleneckInsights);

      // Analyze memory usage patterns
      const memoryInsights = await this.analyzeMemoryPatterns(entities, relationships);
      insights.push(...memoryInsights);

      return {
        success: true,
        data: insights
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'generatePerformanceInsights' })
      };
    }
  }

  /**
   * Initialize insight generation rules
   */
  private initializeInsightRules(): void {
    this.insightRules.set('architecture', new ArchitecturalInsightRule());
    this.insightRules.set('complexity', new ComplexityInsightRule());
    this.insightRules.set('patterns', new PatternInsightRule());
    this.insightRules.set('testing', new TestingInsightRule());
    this.insightRules.set('security', new SecurityInsightRule());
    this.insightRules.set('performance', new PerformanceInsightRule());
    this.insightRules.set('maintainability', new MaintainabilityInsightRule());
    this.insightRules.set('documentation', new DocumentationInsightRule());
  }

  /**
   * Check if a rule should be applied
   */
  private shouldApplyRule(rule: InsightRule, options: InsightGenerationOptions): boolean {
    if (options.includeTypes && !options.includeTypes.includes(rule.getType())) {
      return false;
    }

    if (options.focusAreas && !options.focusAreas.some(area => rule.getCategories().includes(area))) {
      return false;
    }

    return true;
  }

  /**
   * Filter insights based on options
   */
  private filterInsights(insights: Insight[], options: InsightGenerationOptions): Insight[] {
    let filtered = insights;

    if (options.minConfidence !== undefined) {
      filtered = filtered.filter(insight => insight.confidence >= options.minConfidence!);
    }

    if (options.includeTypes) {
      filtered = filtered.filter(insight => options.includeTypes!.includes(insight.type));
    }

    return filtered;
  }

  /**
   * Enhance insights with additional context
   */
  private async enhanceInsights(insights: Insight[], analysisResult: AnalysisResult): Promise<Insight[]> {
    for (const insight of insights) {
      // Add code examples if requested
      if (insight.evidence.entities.length > 0) {
        const examples = await this.generateCodeExamples(insight, analysisResult.entities);
        insight.evidence.codeExamples = examples;
      }

      // Find related insights
      insight.relatedInsights = this.findRelatedInsights(insight, insights);
    }

    return insights;
  }

  /**
   * Prioritize insights by importance and impact
   */
  private prioritizeInsights(insights: Insight[]): Insight[] {
    return insights.sort((a, b) => {
      // Priority: severity > confidence > impact magnitude
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      const magnitudeOrder = { high: 3, medium: 2, low: 1 };

      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;

      const confidenceDiff = b.confidence - a.confidence;
      if (confidenceDiff !== 0) return confidenceDiff;

      return magnitudeOrder[b.impact.magnitude] - magnitudeOrder[a.impact.magnitude];
    });
  }

  /**
   * Generate comprehensive insights report
   */
  private generateReport(
    insights: Insight[],
    analysisResult: AnalysisResult,
    patterns: Pattern[],
    technicalDebt: TechnicalDebtReport
  ): InsightsReport {
    const criticalInsights = insights.filter(i => i.severity === 'critical');
    const architecturalInsights = insights.filter(i => i.type === 'architecture');
    const quickWins = insights.filter(i => 
      i.recommendations.some(r => r.effort === 'minimal' && r.priority === 'high')
    );

    // Group insights by type and category
    const byType: Record<string, Insight[]> = {};
    const byCategory: Record<string, Insight[]> = {};

    for (const insight of insights) {
      if (!byType[insight.type]) byType[insight.type] = [];
      byType[insight.type].push(insight);

      if (!byCategory[insight.category]) byCategory[insight.category] = [];
      byCategory[insight.category].push(insight);
    }

    // Create action plan
    const immediate = insights.filter(i => 
      i.severity === 'critical' || 
      (i.severity === 'warning' && i.recommendations.some(r => r.priority === 'high'))
    ).slice(0, 5);

    const shortTerm = insights.filter(i => 
      i.severity === 'warning' && 
      !immediate.includes(i) &&
      i.recommendations.some(r => r.effort !== 'significant')
    ).slice(0, 8);

    const longTerm = insights.filter(i => 
      !immediate.includes(i) && 
      !shortTerm.includes(i) &&
      i.impact.magnitude === 'high'
    ).slice(0, 5);

    // Calculate overall health score
    const healthFactors = {
      criticalIssues: Math.max(0, 100 - criticalInsights.length * 20),
      codeQuality: Math.max(0, 100 - technicalDebt.summary.totalItems * 2),
      architecture: architecturalInsights.length === 0 ? 100 : Math.max(0, 100 - architecturalInsights.length * 15),
      maintainability: this.calculateMaintainabilityScore(insights),
      testCoverage: 75 // Would come from actual test analysis
    };

    const overallHealth = Math.round(
      Object.values(healthFactors).reduce((sum, score) => sum + score, 0) / Object.keys(healthFactors).length
    );

    return {
      summary: {
        totalInsights: insights.length,
        criticalInsights: criticalInsights.length,
        architecturalConcerns: architecturalInsights.length,
        quickWins: quickWins.length,
        overallHealth
      },
      byType,
      byCategory,
      prioritizedInsights: insights,
      actionPlan: {
        immediate,
        shortTerm,
        longTerm
      },
      trends: {
        codeGrowth: this.analyzeTrend(analysisResult, 'growth'),
        complexityTrend: this.analyzeTrend(analysisResult, 'complexity'),
        qualityTrend: this.analyzeTrend(analysisResult, 'quality'),
        recommendations: this.generateTrendRecommendations(insights)
      }
    };
  }

  // Insight analysis methods
  private async analyzeModuleStructure(modules: CodeEntity[], relationships: CodeRelationship[]): Promise<Insight[]> {
    // Implementation for module structure analysis
    return [];
  }

  private async analyzeDependencyPatterns(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Insight[]> {
    // Implementation for dependency pattern analysis
    return [];
  }

  private async analyzeLayering(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Insight[]> {
    // Implementation for layering analysis
    return [];
  }

  private async analyzeComplexityHotspots(entities: CodeEntity[]): Promise<Insight[]> {
    // Implementation for complexity hotspot analysis
    return [];
  }

  private async analyzeBottlenecks(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Insight[]> {
    // Implementation for bottleneck analysis
    return [];
  }

  private async analyzeMemoryPatterns(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Insight[]> {
    // Implementation for memory pattern analysis
    return [];
  }

  private async generateCodeExamples(insight: Insight, entities: CodeEntity[]): Promise<Insight['evidence']['codeExamples']> {
    // Implementation for generating code examples
    return [];
  }

  private findRelatedInsights(insight: Insight, allInsights: Insight[]): string[] {
    // Implementation for finding related insights
    return [];
  }

  private calculateMaintainabilityScore(insights: Insight[]): number {
    const maintainabilityInsights = insights.filter(i => i.type === 'maintainability');
    return Math.max(0, 100 - maintainabilityInsights.length * 10);
  }

  private analyzeTrend(analysisResult: AnalysisResult, trendType: string): string {
    // Implementation for trend analysis
    return 'stable';
  }

  private generateTrendRecommendations(insights: Insight[]): string[] {
    // Implementation for trend-based recommendations
    return [
      'Monitor complexity growth in core modules',
      'Establish code review guidelines for new features',
      'Implement automated quality gates in CI/CD'
    ];
  }
}

/**
 * Base class for insight generation rules
 */
export abstract class InsightRule {
  protected type: Insight['type'];
  protected categories: string[];

  constructor(type: Insight['type'], categories: string[]) {
    this.type = type;
    this.categories = categories;
  }

  abstract generate(
    analysisResult: AnalysisResult,
    patterns: Pattern[],
    technicalDebt: TechnicalDebtReport
  ): Promise<Insight[]>;

  getType(): Insight['type'] {
    return this.type;
  }

  getCategories(): string[] {
    return this.categories;
  }

  protected createInsight(
    category: string,
    title: string,
    description: string,
    severity: Insight['severity'],
    confidence: number,
    impact: Insight['impact'],
    evidence: Insight['evidence'],
    recommendations: Insight['recommendations'],
    metadata: Record<string, any> = {}
  ): Insight {
    return {
      id: `${this.type}_${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: this.type,
      category,
      title,
      description,
      severity,
      confidence,
      impact,
      evidence,
      recommendations,
      relatedInsights: [],
      metadata
    };
  }
}

/**
 * Architectural Insights Rule
 */
class ArchitecturalInsightRule extends InsightRule {
  constructor() {
    super('architecture', ['structure', 'dependencies', 'layering']);
  }

  async generate(
    analysisResult: AnalysisResult,
    patterns: Pattern[],
    technicalDebt: TechnicalDebtReport
  ): Promise<Insight[]> {
    const insights: Insight[] = [];

    // Analyze module count and organization
    const moduleCount = analysisResult.entities.filter(e => e.type === 'Module').length;
    if (moduleCount > 50) {
      insights.push(this.createInsight(
        'structure',
        'Large Module Count',
        `Project has ${moduleCount} modules which may indicate need for better organization`,
        'warning',
        0.8,
        {
          scope: 'project',
          magnitude: 'medium',
          areas: ['maintainability', 'navigation']
        },
        {
          entities: [],
          patterns: [],
          metrics: { moduleCount }
        },
        [
          {
            action: 'Group related modules into packages or namespaces',
            priority: 'medium',
            effort: 'moderate',
            benefit: 'Improved code organization and developer experience'
          }
        ]
      ));
    }

    // Analyze circular dependencies
    const circularDeps = patterns.filter(p => p.name.includes('Circular'));
    if (circularDeps.length > 0) {
      insights.push(this.createInsight(
        'dependencies',
        'Circular Dependencies Detected',
        `Found ${circularDeps.length} circular dependency patterns that can complicate testing and deployment`,
        'critical',
        0.9,
        {
          scope: 'project',
          magnitude: 'high',
          areas: ['testability', 'modularity', 'deployment']
        },
        {
          entities: circularDeps.flatMap(p => p.entities),
          patterns: circularDeps.map(p => p.id),
          metrics: { circularCount: circularDeps.length }
        },
        [
          {
            action: 'Refactor modules to eliminate circular dependencies',
            priority: 'high',
            effort: 'significant',
            benefit: 'Improved modularity and testability',
            steps: [
              'Identify dependency cycles',
              'Extract common interfaces',
              'Apply dependency inversion principle',
              'Use dependency injection where appropriate'
            ]
          }
        ]
      ));
    }

    return insights;
  }
}

/**
 * Complexity Insights Rule
 */
class ComplexityInsightRule extends InsightRule {
  constructor() {
    super('quality', ['complexity', 'maintainability']);
  }

  async generate(
    analysisResult: AnalysisResult,
    patterns: Pattern[],
    technicalDebt: TechnicalDebtReport
  ): Promise<Insight[]> {
    const insights: Insight[] = [];

    const avgComplexity = analysisResult.metrics.complexity / analysisResult.metrics.functions;
    if (avgComplexity > 10) {
      insights.push(this.createInsight(
        'complexity',
        'High Average Complexity',
        `Average function complexity of ${avgComplexity.toFixed(1)} is above recommended threshold`,
        'warning',
        0.85,
        {
          scope: 'project',
          magnitude: 'medium',
          areas: ['maintainability', 'testing']
        },
        {
          entities: [],
          patterns: [],
          metrics: { avgComplexity, threshold: 10 }
        },
        [
          {
            action: 'Refactor complex functions to reduce cyclomatic complexity',
            priority: 'medium',
            effort: 'moderate',
            benefit: 'Improved maintainability and testability'
          }
        ]
      ));
    }

    return insights;
  }
}

// Additional insight rules would be implemented similarly...
class PatternInsightRule extends InsightRule {
  constructor() {
    super('best_practice', ['patterns', 'design']);
  }

  async generate(): Promise<Insight[]> {
    return [];
  }
}

class TestingInsightRule extends InsightRule {
  constructor() {
    super('quality', ['testing', 'coverage']);
  }

  async generate(): Promise<Insight[]> {
    return [];
  }
}

class SecurityInsightRule extends InsightRule {
  constructor() {
    super('security', ['vulnerabilities', 'best_practices']);
  }

  async generate(): Promise<Insight[]> {
    return [];
  }
}

class PerformanceInsightRule extends InsightRule {
  constructor() {
    super('performance', ['bottlenecks', 'optimization']);
  }

  async generate(): Promise<Insight[]> {
    return [];
  }
}

class MaintainabilityInsightRule extends InsightRule {
  constructor() {
    super('maintainability', ['debt', 'refactoring']);
  }

  async generate(): Promise<Insight[]> {
    return [];
  }
}

class DocumentationInsightRule extends InsightRule {
  constructor() {
    super('maintainability', ['documentation', 'knowledge']);
  }

  async generate(): Promise<Insight[]> {
    return [];
  }
}