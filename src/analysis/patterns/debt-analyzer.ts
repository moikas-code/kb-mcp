/**
 * Technical Debt Analyzer
 * Analyzes and quantifies technical debt in the codebase
 */

import { CodeEntity, CodeRelationship } from '../code-analyzer.js';
import { Pattern, PatternDetector } from './pattern-detector.js';
import { UnifiedMemory } from '../../graph/unified-memory.js';
import { Result } from '../../types/index.js';
import { toKBError } from '../../types/error-utils.js';

export interface TechnicalDebtItem {
  id: string;
  type: 'complexity' | 'duplication' | 'coverage' | 'dependencies' | 'documentation' | 'performance' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: {
    filePath: string;
    startLine: number;
    endLine: number;
  };
  impact: {
    maintainability: number; // 0-100
    readability: number; // 0-100
    testability: number; // 0-100
    performance: number; // 0-100
  };
  estimatedEffort: {
    hours: number;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  };
  priority: number; // 0-100
  relatedPatterns: string[]; // Pattern IDs
  suggestions: string[];
  metadata: Record<string, any>;
}

export interface TechnicalDebtReport {
  summary: {
    totalItems: number;
    totalEstimatedHours: number;
    averagePriority: number;
    debtRatio: number; // 0-1
    trends: {
      improving: boolean;
      changeRate: number;
    };
  };
  byType: Record<string, {
    count: number;
    averagePriority: number;
    totalHours: number;
  }>;
  bySeverity: Record<string, {
    count: number;
    averagePriority: number;
    totalHours: number;
  }>;
  topPriorities: TechnicalDebtItem[];
  recommendations: {
    quickWins: TechnicalDebtItem[];
    majorRefactoring: TechnicalDebtItem[];
    longTermGoals: TechnicalDebtItem[];
  };
  metrics: {
    codeComplexity: number;
    duplicatedCode: number;
    testCoverage: number;
    documentationCoverage: number;
    dependencyHealth: number;
  };
}

export interface DebtAnalysisOptions {
  includeTypes?: TechnicalDebtItem['type'][];
  minSeverity?: TechnicalDebtItem['severity'];
  includeEstimates?: boolean;
  includeTrends?: boolean;
  analysisDepth?: 'surface' | 'medium' | 'deep';
}

export class TechnicalDebtAnalyzer {
  private memory: UnifiedMemory;
  private patternDetector: PatternDetector;

  constructor(memory: UnifiedMemory) {
    this.memory = memory;
    this.patternDetector = new PatternDetector(memory);
  }

  /**
   * Analyze technical debt in a codebase
   */
  async analyzeTechnicalDebt(
    entities: CodeEntity[],
    relationships: CodeRelationship[],
    options: DebtAnalysisOptions = {}
  ): Promise<Result<TechnicalDebtReport>> {
    try {
      // Detect patterns first
      const patternsResult = await this.patternDetector.detectPatterns(entities, relationships, {
        includeAntiPatterns: true,
        includeCodeSmells: true
      });

      if (!patternsResult.success) {
        return patternsResult as any;
      }

      const patterns = patternsResult.data;
      const debtItems: TechnicalDebtItem[] = [];

      // Convert patterns to debt items
      for (const pattern of patterns) {
        if (pattern.type === 'anti_pattern' || pattern.type === 'code_smell') {
          const debtItem = await this.convertPatternToDebtItem(pattern, entities, relationships);
          if (debtItem) {
            debtItems.push(debtItem);
          }
        }
      }

      // Add additional debt analysis
      const complexityDebt = await this.analyzeComplexityDebt(entities, relationships);
      const duplicationDebt = await this.analyzeDuplicationDebt(entities, relationships);
      const dependencyDebt = await this.analyzeDependencyDebt(entities, relationships);
      const documentationDebt = await this.analyzeDocumentationDebt(entities);

      debtItems.push(...complexityDebt, ...duplicationDebt, ...dependencyDebt, ...documentationDebt);

      // Filter by options
      const filteredDebt = this.filterDebtItems(debtItems, options);

      // Calculate priorities
      const prioritizedDebt = this.calculatePriorities(filteredDebt);

      // Generate report
      const report = this.generateReport(prioritizedDebt, patterns);

      return {
        success: true,
        data: report
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'analyzeTechnicalDebt' })
      };
    }
  }

  /**
   * Get debt trends over time
   */
  async getDebtTrends(
    timeRange: { from: Date; to: Date },
    options: DebtAnalysisOptions = {}
  ): Promise<Result<{
    trends: Array<{
      date: Date;
      totalDebt: number;
      newDebt: number;
      resolvedDebt: number;
      debtRatio: number;
    }>;
    insights: string[];
  }>> {
    try {
      // This would analyze historical data from the graph
      // For now, return a basic structure
      return {
        success: true,
        data: {
          trends: [],
          insights: []
        }
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'getDebtTrends' })
      };
    }
  }

  /**
   * Suggest debt reduction strategies
   */
  async suggestDebtReduction(
    debtItems: TechnicalDebtItem[],
    constraints: {
      availableHours?: number;
      teamSize?: number;
      skillLevel?: 'junior' | 'mid' | 'senior' | 'expert';
      timeline?: number; // weeks
    }
  ): Promise<Result<{
    strategy: {
      phase1: TechnicalDebtItem[];
      phase2: TechnicalDebtItem[];
      phase3: TechnicalDebtItem[];
    };
    timeline: {
      weeks: number;
      milestones: Array<{
        week: number;
        description: string;
        completedDebt: string[];
      }>;
    };
    riskAssessment: {
      level: 'low' | 'medium' | 'high';
      concerns: string[];
      mitigations: string[];
    };
  }>> {
    try {
      // Sort by priority and effort
      const sortedDebt = debtItems.sort((a, b) => {
        const priorityDiff = b.priority - a.priority;
        if (priorityDiff !== 0) return priorityDiff;
        return a.estimatedEffort.hours - b.estimatedEffort.hours;
      });

      const strategy = this.createReductionStrategy(sortedDebt, constraints);
      const timeline = this.createTimeline(strategy, constraints);
      const riskAssessment = this.assessReductionRisk(strategy, constraints);

      return {
        success: true,
        data: {
          strategy,
          timeline,
          riskAssessment
        }
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'suggestDebtReduction' })
      };
    }
  }

  /**
   * Convert a pattern to a technical debt item
   */
  private async convertPatternToDebtItem(
    pattern: Pattern,
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): Promise<TechnicalDebtItem | null> {
    const entity = entities.find(e => pattern.entities.includes(e.id));
    if (!entity) return null;

    const impact = this.calculateImpact(pattern, entities, relationships);
    const effort = this.estimateEffort(pattern, entities);

    return {
      id: pattern.id,
      type: this.mapPatternToDebtType(pattern),
      severity: pattern.severity,
      description: pattern.description,
      location: pattern.location,
      impact,
      estimatedEffort: effort,
      priority: 0, // Will be calculated later
      relatedPatterns: [pattern.id],
      suggestions: pattern.metadata.recommendation ? [pattern.metadata.recommendation] : [],
      metadata: {
        patternType: pattern.type,
        patternCategory: pattern.category,
        confidence: pattern.confidence
      }
    };
  }

  /**
   * Analyze complexity-related debt
   */
  private async analyzeComplexityDebt(
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): Promise<TechnicalDebtItem[]> {
    const debtItems: TechnicalDebtItem[] = [];
    
    const functions = entities.filter(e => e.type === 'Function');
    
    for (const func of functions) {
      const complexity = func.metadata.complexity || 0;
      
      if (complexity > 10) {
        const severity = complexity > 20 ? 'high' : complexity > 15 ? 'medium' : 'low';
        const hours = Math.ceil(complexity / 5); // Rough estimate
        
        debtItems.push({
          id: `complexity_${func.id}`,
          type: 'complexity',
          severity,
          description: `High cyclomatic complexity (${complexity})`,
          location: {
            filePath: func.filePath,
            startLine: func.line,
            endLine: func.metadata.endLine || func.line
          },
          impact: {
            maintainability: Math.max(0, 100 - complexity * 3),
            readability: Math.max(0, 100 - complexity * 4),
            testability: Math.max(0, 100 - complexity * 5),
            performance: 80
          },
          estimatedEffort: {
            hours,
            difficulty: complexity > 20 ? 'hard' : 'medium'
          },
          priority: 0,
          relatedPatterns: [],
          suggestions: [
            'Break down into smaller functions',
            'Extract conditional logic',
            'Use early returns to reduce nesting',
            'Consider using polymorphism for complex conditionals'
          ],
          metadata: {
            complexity,
            functionName: func.name
          }
        });
      }
    }
    
    return debtItems;
  }

  /**
   * Analyze code duplication debt
   */
  private async analyzeDuplicationDebt(
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): Promise<TechnicalDebtItem[]> {
    const debtItems: TechnicalDebtItem[] = [];
    
    const functions = entities.filter(e => e.type === 'Function');
    const duplicateGroups = this.findDuplicateFunctions(functions);
    
    for (const group of duplicateGroups) {
      if (group.length > 1) {
        const totalLines = group.reduce((sum, func) => sum + (func.metadata.lineCount || 0), 0);
        const hours = Math.ceil(totalLines / 50); // Rough estimate
        
        debtItems.push({
          id: `duplication_${group[0].id}`,
          type: 'duplication',
          severity: group.length > 3 ? 'high' : 'medium',
          description: `Code duplication across ${group.length} functions`,
          location: {
            filePath: group[0].filePath,
            startLine: group[0].line,
            endLine: group[0].metadata.endLine || group[0].line
          },
          impact: {
            maintainability: Math.max(0, 100 - group.length * 15),
            readability: 70,
            testability: Math.max(0, 100 - group.length * 10),
            performance: 85
          },
          estimatedEffort: {
            hours,
            difficulty: 'medium'
          },
          priority: 0,
          relatedPatterns: [],
          suggestions: [
            'Extract common functionality into shared function',
            'Create utility module for shared logic',
            'Use template method pattern',
            'Consider parameterizing differences'
          ],
          metadata: {
            duplicateCount: group.length,
            functions: group.map(f => ({ name: f.name, file: f.filePath, line: f.line }))
          }
        });
      }
    }
    
    return debtItems;
  }

  /**
   * Analyze dependency-related debt
   */
  private async analyzeDependencyDebt(
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): Promise<TechnicalDebtItem[]> {
    const debtItems: TechnicalDebtItem[] = [];
    
    // Find circular dependencies
    const modules = entities.filter(e => e.type === 'Module');
    const imports = relationships.filter(r => r.type === 'IMPORTS');
    
    const cycles = this.findCircularDependencies(modules, imports);
    
    for (const cycle of cycles) {
      debtItems.push({
        id: `circular_dep_${cycle[0].id}`,
        type: 'dependencies',
        severity: 'high',
        description: `Circular dependency between ${cycle.length} modules`,
        location: {
          filePath: cycle[0].filePath,
          startLine: cycle[0].line,
          endLine: cycle[0].line
        },
        impact: {
          maintainability: 30,
          readability: 50,
          testability: 20,
          performance: 70
        },
        estimatedEffort: {
          hours: cycle.length * 4,
          difficulty: 'hard'
        },
        priority: 0,
        relatedPatterns: [],
        suggestions: [
          'Extract common dependencies to separate module',
          'Use dependency injection',
          'Apply dependency inversion principle',
          'Create facade or mediator'
        ],
        metadata: {
          cycleLength: cycle.length,
          modules: cycle.map(m => m.name)
        }
      });
    }
    
    return debtItems;
  }

  /**
   * Analyze documentation debt
   */
  private async analyzeDocumentationDebt(entities: CodeEntity[]): Promise<TechnicalDebtItem[]> {
    const debtItems: TechnicalDebtItem[] = [];
    
    const functions = entities.filter(e => e.type === 'Function');
    const undocumentedFunctions = functions.filter(f => !f.metadata.documentation);
    
    if (undocumentedFunctions.length > 0) {
      const severity = undocumentedFunctions.length > functions.length * 0.5 ? 'medium' : 'low';
      
      debtItems.push({
        id: `documentation_debt`,
        type: 'documentation',
        severity,
        description: `${undocumentedFunctions.length} undocumented functions`,
        location: {
          filePath: undocumentedFunctions[0].filePath,
          startLine: undocumentedFunctions[0].line,
          endLine: undocumentedFunctions[0].line
        },
        impact: {
          maintainability: Math.max(0, 100 - undocumentedFunctions.length * 2),
          readability: Math.max(0, 100 - undocumentedFunctions.length * 3),
          testability: 80,
          performance: 100
        },
        estimatedEffort: {
          hours: Math.ceil(undocumentedFunctions.length * 0.5),
          difficulty: 'easy'
        },
        priority: 0,
        relatedPatterns: [],
        suggestions: [
          'Add JSDoc comments to public functions',
          'Document complex algorithms',
          'Include parameter and return type descriptions',
          'Add usage examples for important functions'
        ],
        metadata: {
          undocumentedCount: undocumentedFunctions.length,
          totalCount: functions.length,
          coverageRatio: (functions.length - undocumentedFunctions.length) / functions.length
        }
      });
    }
    
    return debtItems;
  }

  /**
   * Calculate impact scores for a pattern
   */
  private calculateImpact(
    pattern: Pattern,
    entities: CodeEntity[],
    relationships: CodeRelationship[]
  ): TechnicalDebtItem['impact'] {
    const baseImpact = {
      maintainability: 70,
      readability: 70,
      testability: 70,
      performance: 80
    };

    // Adjust based on pattern severity
    const severityMultiplier = {
      low: 0.8,
      medium: 1.0,
      high: 1.3,
      critical: 1.6
    };

    const multiplier = severityMultiplier[pattern.severity];

    return {
      maintainability: Math.max(0, Math.min(100, baseImpact.maintainability * multiplier)),
      readability: Math.max(0, Math.min(100, baseImpact.readability * multiplier)),
      testability: Math.max(0, Math.min(100, baseImpact.testability * multiplier)),
      performance: Math.max(0, Math.min(100, baseImpact.performance * multiplier))
    };
  }

  /**
   * Estimate effort to fix a pattern
   */
  private estimateEffort(pattern: Pattern, entities: CodeEntity[]): TechnicalDebtItem['estimatedEffort'] {
    const involvedEntities = entities.filter(e => pattern.entities.includes(e.id));
    const totalLines = involvedEntities.reduce((sum, e) => sum + (e.metadata.lineCount || 10), 0);

    let hours = Math.ceil(totalLines / 20); // Base estimate: 20 lines per hour
    let difficulty: TechnicalDebtItem['estimatedEffort']['difficulty'] = 'medium';

    // Adjust based on pattern type and severity
    if (pattern.type === 'anti_pattern') {
      hours *= 1.5;
      difficulty = pattern.severity === 'critical' ? 'expert' : 'hard';
    }

    if (pattern.category === 'architectural') {
      hours *= 2;
      difficulty = 'expert';
    }

    return {
      hours: Math.max(1, Math.min(40, hours)), // Cap between 1-40 hours
      difficulty
    };
  }

  /**
   * Map pattern type to debt type
   */
  private mapPatternToDebtType(pattern: Pattern): TechnicalDebtItem['type'] {
    if (pattern.name.toLowerCase().includes('complex')) return 'complexity';
    if (pattern.name.toLowerCase().includes('duplicate')) return 'duplication';
    if (pattern.name.toLowerCase().includes('dependency')) return 'dependencies';
    if (pattern.name.toLowerCase().includes('performance')) return 'performance';
    if (pattern.name.toLowerCase().includes('security')) return 'security';
    return 'complexity'; // Default
  }

  /**
   * Filter debt items based on options
   */
  private filterDebtItems(items: TechnicalDebtItem[], options: DebtAnalysisOptions): TechnicalDebtItem[] {
    let filtered = items;

    if (options.includeTypes) {
      filtered = filtered.filter(item => options.includeTypes!.includes(item.type));
    }

    if (options.minSeverity) {
      const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      const minLevel = severityOrder[options.minSeverity];
      filtered = filtered.filter(item => severityOrder[item.severity] >= minLevel);
    }

    return filtered;
  }

  /**
   * Calculate priorities for debt items
   */
  private calculatePriorities(items: TechnicalDebtItem[]): TechnicalDebtItem[] {
    return items.map(item => {
      // Priority based on impact, severity, and effort
      const impactScore = (
        item.impact.maintainability +
        item.impact.readability +
        item.impact.testability +
        item.impact.performance
      ) / 4;

      const severityScore = { low: 25, medium: 50, high: 75, critical: 100 }[item.severity];
      const effortScore = Math.max(0, 100 - item.estimatedEffort.hours * 2);

      item.priority = Math.round((impactScore * 0.4 + severityScore * 0.4 + effortScore * 0.2));
      return item;
    });
  }

  /**
   * Generate comprehensive debt report
   */
  private generateReport(debtItems: TechnicalDebtItem[], patterns: Pattern[]): TechnicalDebtReport {
    const totalHours = debtItems.reduce((sum, item) => sum + item.estimatedEffort.hours, 0);
    const avgPriority = debtItems.reduce((sum, item) => sum + item.priority, 0) / debtItems.length || 0;

    // Group by type and severity
    const byType: Record<string, any> = {};
    const bySeverity: Record<string, any> = {};

    for (const item of debtItems) {
      // By type
      if (!byType[item.type]) {
        byType[item.type] = { count: 0, averagePriority: 0, totalHours: 0 };
      }
      byType[item.type].count++;
      byType[item.type].totalHours += item.estimatedEffort.hours;

      // By severity
      if (!bySeverity[item.severity]) {
        bySeverity[item.severity] = { count: 0, averagePriority: 0, totalHours: 0 };
      }
      bySeverity[item.severity].count++;
      bySeverity[item.severity].totalHours += item.estimatedEffort.hours;
    }

    // Calculate averages
    Object.values(byType).forEach((group: any) => {
      group.averagePriority = debtItems
        .filter(item => byType[item.type] === group)
        .reduce((sum, item) => sum + item.priority, 0) / group.count;
    });

    Object.values(bySeverity).forEach((group: any) => {
      group.averagePriority = debtItems
        .filter(item => bySeverity[item.severity] === group)
        .reduce((sum, item) => sum + item.priority, 0) / group.count;
    });

    // Get top priorities and recommendations
    const sortedByPriority = debtItems.sort((a, b) => b.priority - a.priority);
    const quickWins = debtItems.filter(item => 
      item.estimatedEffort.hours <= 4 && item.priority >= 70
    ).slice(0, 5);
    
    const majorRefactoring = debtItems.filter(item => 
      item.estimatedEffort.hours > 16 && item.severity === 'high'
    ).slice(0, 3);

    return {
      summary: {
        totalItems: debtItems.length,
        totalEstimatedHours: totalHours,
        averagePriority: avgPriority,
        debtRatio: Math.min(1, totalHours / 1000), // Rough ratio
        trends: {
          improving: false, // Would be calculated from historical data
          changeRate: 0
        }
      },
      byType,
      bySeverity,
      topPriorities: sortedByPriority.slice(0, 10),
      recommendations: {
        quickWins,
        majorRefactoring,
        longTermGoals: debtItems.filter(item => 
          item.type === 'dependencies' || item.estimatedEffort.difficulty === 'expert'
        ).slice(0, 3)
      },
      metrics: {
        codeComplexity: this.calculateComplexityMetric(debtItems),
        duplicatedCode: this.calculateDuplicationMetric(debtItems),
        testCoverage: 75, // Would be calculated from actual test data
        documentationCoverage: this.calculateDocumentationMetric(debtItems),
        dependencyHealth: this.calculateDependencyMetric(debtItems)
      }
    };
  }

  /**
   * Helper methods for finding duplicates and cycles
   */
  private findDuplicateFunctions(functions: CodeEntity[]): CodeEntity[][] {
    const groups = new Map<string, CodeEntity[]>();
    
    for (const func of functions) {
      const signature = this.normalizeSignature(func.signature || func.name);
      if (!groups.has(signature)) {
        groups.set(signature, []);
      }
      groups.get(signature)!.push(func);
    }
    
    return Array.from(groups.values()).filter(group => group.length > 1);
  }

  private findCircularDependencies(modules: CodeEntity[], imports: CodeRelationship[]): CodeEntity[][] {
    // Simple cycle detection - would be more sophisticated in practice
    const cycles: CodeEntity[][] = [];
    // Implementation would go here
    return cycles;
  }

  private normalizeSignature(signature: string): string {
    return signature.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  }

  private createReductionStrategy(debtItems: TechnicalDebtItem[], constraints: any): any {
    // Implementation for creating phased reduction strategy
    return {
      phase1: debtItems.slice(0, 5),
      phase2: debtItems.slice(5, 10),
      phase3: debtItems.slice(10)
    };
  }

  private createTimeline(strategy: any, constraints: any): any {
    // Implementation for creating timeline
    return {
      weeks: 12,
      milestones: []
    };
  }

  private assessReductionRisk(strategy: any, constraints: any): any {
    // Implementation for risk assessment
    return {
      level: 'medium' as const,
      concerns: [],
      mitigations: []
    };
  }

  private calculateComplexityMetric(debtItems: TechnicalDebtItem[]): number {
    const complexityItems = debtItems.filter(item => item.type === 'complexity');
    return Math.max(0, 100 - complexityItems.length * 5);
  }

  private calculateDuplicationMetric(debtItems: TechnicalDebtItem[]): number {
    const duplicationItems = debtItems.filter(item => item.type === 'duplication');
    return Math.max(0, 100 - duplicationItems.length * 10);
  }

  private calculateDocumentationMetric(debtItems: TechnicalDebtItem[]): number {
    const docItem = debtItems.find(item => item.type === 'documentation');
    return docItem ? (docItem.metadata.coverageRatio || 0) * 100 : 100;
  }

  private calculateDependencyMetric(debtItems: TechnicalDebtItem[]): number {
    const depItems = debtItems.filter(item => item.type === 'dependencies');
    return Math.max(0, 100 - depItems.length * 15);
  }
}