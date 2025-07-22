/**
 * Natural Language Query Processor
 * Translates natural language questions into graph queries and code analysis operations
 */

import { CodeEntity, CodeRelationship } from '../code-analyzer.js';
import { UnifiedMemory } from '../../graph/unified-memory.js';
import { Result } from '../../types/index.js';
import { toKBError } from '../../types/error-utils.js';

export interface QueryIntent {
  type: 'find' | 'analyze' | 'compare' | 'explain' | 'suggest' | 'count' | 'list';
  target: 'function' | 'class' | 'module' | 'variable' | 'relationship' | 'pattern' | 'file' | 'project';
  filters: {
    name?: string;
    language?: string;
    complexity?: { operator: 'gt' | 'lt' | 'eq'; value: number };
    size?: { operator: 'gt' | 'lt' | 'eq'; value: number };
    pattern?: string;
    scope?: 'file' | 'module' | 'project';
  };
  modifiers: {
    includeRelated?: boolean;
    includeMetrics?: boolean;
    includeExamples?: boolean;
    sortBy?: string;
    limit?: number;
  };
  context: string[];
}

export interface QueryResult {
  entities: CodeEntity[];
  relationships: CodeRelationship[];
  metrics: Record<string, number>;
  explanations: string[];
  suggestions: string[];
  visualizations?: Array<{
    type: 'graph' | 'tree' | 'metrics' | 'timeline';
    data: any;
    description: string;
  }>;
}

export interface NLQueryOptions {
  includeContext?: boolean;
  includeExplanations?: boolean;
  includeSuggestions?: boolean;
  maxResults?: number;
  confidenceThreshold?: number;
}

export class NaturalLanguageProcessor {
  private memory: UnifiedMemory;
  private intentPatterns: Map<string, IntentPattern> = new Map();
  private contextKeywords: Map<string, string[]> = new Map();

  constructor(memory: UnifiedMemory) {
    this.memory = memory;
    this.initializeIntentPatterns();
    this.initializeContextKeywords();
  }

  /**
   * Process a natural language query
   */
  async processQuery(query: string, options: NLQueryOptions = {}): Promise<Result<QueryResult>> {
    try {
      // Parse the query to extract intent
      const intent = await this.parseQuery(query);
      if (!intent) {
        return {
          success: false,
          error: toKBError(new Error('Could not understand the query'), { operation: 'processQuery' })
        };
      }

      // Execute the query based on intent
      const result = await this.executeQuery(intent, options);
      
      // Enhance result with explanations and suggestions if requested
      if (options.includeExplanations) {
        result.explanations = await this.generateExplanations(query, intent, result);
      }

      if (options.includeSuggestions) {
        result.suggestions = await this.generateSuggestions(query, intent, result);
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'processQuery' })
      };
    }
  }

  /**
   * Get query suggestions based on current codebase
   */
  async getQuerySuggestions(context?: string): Promise<Result<string[]>> {
    try {
      const suggestions = [
        // Function-related queries
        "What are the most complex functions?",
        "Which functions call the authenticate method?",
        "Show me all functions with more than 10 parameters",
        "Find functions that are never called",
        
        // Class-related queries
        "What classes implement the Service interface?",
        "Show me the class hierarchy for User",
        "Which classes have the most methods?",
        "Find all classes with circular dependencies",
        
        // Module-related queries
        "What modules does the auth module depend on?",
        "Show me modules with the highest coupling",
        "Which modules have the most imports?",
        "Find modules that are not being used",
        
        // Pattern queries
        "What design patterns are used in this codebase?",
        "Show me all Singleton implementations",
        "Find anti-patterns in the code",
        "What code smells are present?",
        
        // Quality queries
        "What are the main technical debt issues?",
        "Show me functions with high complexity",
        "Which files have duplicate code?",
        "What security issues were found?",
        
        // Architecture queries
        "What is the overall architecture of this project?",
        "Show me the dependency graph",
        "Which components are most tightly coupled?",
        "What are the main architectural concerns?",
        
        // Performance queries
        "What are the performance hotspots?",
        "Show me functions that might be bottlenecks",
        "Which algorithms could be optimized?",
        "Find memory-intensive operations"
      ];

      // Filter suggestions based on context if provided
      if (context) {
        const contextLower = context.toLowerCase();
        return {
          success: true,
          data: suggestions.filter(s => 
            s.toLowerCase().includes(contextLower) ||
            this.isRelevantToContext(s, contextLower)
          )
        };
      }

      return {
        success: true,
        data: suggestions
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'getQuerySuggestions' })
      };
    }
  }

  /**
   * Parse natural language query into structured intent
   */
  private async parseQuery(query: string): Promise<QueryIntent | null> {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Try to match against known patterns
    for (const [patternId, pattern] of this.intentPatterns) {
      const match = pattern.match(normalizedQuery);
      if (match) {
        return match;
      }
    }

    // Fallback: try to extract basic intent using keywords
    return this.extractBasicIntent(normalizedQuery);
  }

  /**
   * Execute a structured query
   */
  private async executeQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    switch (intent.type) {
      case 'find':
        return this.executeFindQuery(intent, options);
      case 'analyze':
        return this.executeAnalyzeQuery(intent, options);
      case 'compare':
        return this.executeCompareQuery(intent, options);
      case 'explain':
        return this.executeExplainQuery(intent, options);
      case 'suggest':
        return this.executeSuggestQuery(intent, options);
      case 'count':
        return this.executeCountQuery(intent, options);
      case 'list':
        return this.executeListQuery(intent, options);
      default:
        throw new Error(`Unknown query type: ${intent.type}`);
    }
  }

  /**
   * Execute find queries
   */
  private async executeFindQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    // Build Cypher query based on intent
    let cypher = '';
    const params: Record<string, any> = {};

    switch (intent.target) {
      case 'function':
        cypher = this.buildFunctionQuery(intent);
        break;
      case 'class':
        cypher = this.buildClassQuery(intent);
        break;
      case 'module':
        cypher = this.buildModuleQuery(intent);
        break;
      case 'relationship':
        cypher = this.buildRelationshipQuery(intent);
        break;
      default:
        cypher = this.buildGenericQuery(intent);
    }

    // Execute the query
    const queryResult = await this.memory.graph.query(cypher, params);
    if (queryResult.success && queryResult.data) {
      // Process results
      result.entities = queryResult.data
        .filter((row: any) => row.entity)
        .map((row: any) => row.entity);
      
      result.relationships = queryResult.data
        .filter((row: any) => row.relationship)
        .map((row: any) => row.relationship);
    }

    // Apply filters and modifiers
    result.entities = this.applyFilters(result.entities, intent.filters);
    
    if (intent.modifiers.limit) {
      result.entities = result.entities.slice(0, intent.modifiers.limit);
    }

    // Include related entities if requested
    if (intent.modifiers.includeRelated) {
      const relatedEntities = await this.findRelatedEntities(result.entities);
      result.entities.push(...relatedEntities);
    }

    // Include metrics if requested
    if (intent.modifiers.includeMetrics) {
      result.metrics = await this.calculateMetrics(result.entities, result.relationships);
    }

    return result;
  }

  /**
   * Execute analyze queries
   */
  private async executeAnalyzeQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    // Get entities to analyze
    const findIntent: QueryIntent = { ...intent, type: 'find' };
    const findResult = await this.executeFindQuery(findIntent, options);
    
    result.entities = findResult.entities;
    result.relationships = findResult.relationships;

    // Perform analysis based on target
    switch (intent.target) {
      case 'function':
        result.metrics = await this.analyzeFunctions(result.entities);
        break;
      case 'class':
        result.metrics = await this.analyzeClasses(result.entities, result.relationships);
        break;
      case 'module':
        result.metrics = await this.analyzeModules(result.entities, result.relationships);
        break;
      case 'project':
        result.metrics = await this.analyzeProject();
        break;
    }

    return result;
  }

  /**
   * Execute compare queries
   */
  private async executeCompareQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    // Implementation for comparison queries
    // This would compare entities based on various metrics
    
    return result;
  }

  /**
   * Execute explain queries
   */
  private async executeExplainQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    // Get entities to explain
    const findIntent: QueryIntent = { ...intent, type: 'find' };
    const findResult = await this.executeFindQuery(findIntent, options);
    
    result.entities = findResult.entities;
    result.relationships = findResult.relationships;

    // Generate explanations
    result.explanations = await this.generateDetailedExplanations(result.entities, result.relationships);

    return result;
  }

  /**
   * Execute suggest queries
   */
  private async executeSuggestQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    // Generate suggestions based on current codebase state
    result.suggestions = await this.generateCodeSuggestions(intent);

    return result;
  }

  /**
   * Execute count queries
   */
  private async executeCountQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    const result: QueryResult = {
      entities: [],
      relationships: [],
      metrics: {},
      explanations: [],
      suggestions: []
    };

    const findResult = await this.executeFindQuery({ ...intent, type: 'find' }, options);
    result.metrics.count = findResult.entities.length;
    
    return result;
  }

  /**
   * Execute list queries
   */
  private async executeListQuery(intent: QueryIntent, options: NLQueryOptions): Promise<QueryResult> {
    return this.executeFindQuery(intent, options);
  }

  /**
   * Initialize intent recognition patterns
   */
  private initializeIntentPatterns(): void {
    // Find patterns
    this.intentPatterns.set('find_functions', new FunctionFindPattern());
    this.intentPatterns.set('find_classes', new ClassFindPattern());
    this.intentPatterns.set('find_modules', new ModuleFindPattern());
    this.intentPatterns.set('find_callers', new CallerFindPattern());
    this.intentPatterns.set('find_usage', new UsageFindPattern());
    
    // Analyze patterns
    this.intentPatterns.set('analyze_complexity', new ComplexityAnalyzePattern());
    this.intentPatterns.set('analyze_dependencies', new DependencyAnalyzePattern());
    this.intentPatterns.set('analyze_architecture', new ArchitectureAnalyzePattern());
    
    // Quality patterns
    this.intentPatterns.set('find_debt', new TechnicalDebtPattern());
    this.intentPatterns.set('find_patterns', new DesignPatternPattern());
    this.intentPatterns.set('find_smells', new CodeSmellPattern());
  }

  /**
   * Initialize context keywords for better understanding
   */
  private initializeContextKeywords(): void {
    this.contextKeywords.set('complexity', ['complex', 'complicated', 'cyclomatic', 'difficult']);
    this.contextKeywords.set('performance', ['slow', 'fast', 'optimize', 'bottleneck', 'performance']);
    this.contextKeywords.set('security', ['secure', 'vulnerability', 'unsafe', 'security']);
    this.contextKeywords.set('testing', ['test', 'coverage', 'testable', 'mock']);
    this.contextKeywords.set('documentation', ['document', 'comment', 'doc', 'undocumented']);
  }

  /**
   * Extract basic intent from query using keywords
   */
  private extractBasicIntent(query: string): QueryIntent | null {
    const words = query.split(/\s+/);
    
    // Determine query type
    let type: QueryIntent['type'] = 'find';
    if (words.some(w => ['analyze', 'analysis'].includes(w))) type = 'analyze';
    if (words.some(w => ['compare', 'comparison'].includes(w))) type = 'compare';
    if (words.some(w => ['explain', 'why', 'how'].includes(w))) type = 'explain';
    if (words.some(w => ['suggest', 'recommend'].includes(w))) type = 'suggest';
    if (words.some(w => ['count', 'how many'].includes(w))) type = 'count';
    if (words.some(w => ['list', 'show'].includes(w))) type = 'list';

    // Determine target
    let target: QueryIntent['target'] = 'function';
    if (words.some(w => ['class', 'classes'].includes(w))) target = 'class';
    if (words.some(w => ['module', 'modules'].includes(w))) target = 'module';
    if (words.some(w => ['variable', 'variables'].includes(w))) target = 'variable';
    if (words.some(w => ['relationship', 'relationships'].includes(w))) target = 'relationship';
    if (words.some(w => ['pattern', 'patterns'].includes(w))) target = 'pattern';
    if (words.some(w => ['file', 'files'].includes(w))) target = 'file';
    if (words.some(w => ['project', 'codebase'].includes(w))) target = 'project';

    return {
      type,
      target,
      filters: {},
      modifiers: {},
      context: words
    };
  }

  // Query building methods
  private buildFunctionQuery(intent: QueryIntent): string {
    let query = 'MATCH (f:Function)';
    
    if (intent.filters.name) {
      query += ` WHERE f.name CONTAINS $name`;
    }
    
    if (intent.filters.complexity) {
      const op = intent.filters.complexity.operator === 'gt' ? '>' : 
                 intent.filters.complexity.operator === 'lt' ? '<' : '=';
      query += ` AND f.complexity ${op} ${intent.filters.complexity.value}`;
    }
    
    query += ' RETURN f as entity';
    
    if (intent.modifiers.sortBy) {
      query += ` ORDER BY f.${intent.modifiers.sortBy}`;
    }
    
    if (intent.modifiers.limit) {
      query += ` LIMIT ${intent.modifiers.limit}`;
    }
    
    return query;
  }

  private buildClassQuery(intent: QueryIntent): string {
    return 'MATCH (c:Class) RETURN c as entity';
  }

  private buildModuleQuery(intent: QueryIntent): string {
    return 'MATCH (m:Module) RETURN m as entity';
  }

  private buildRelationshipQuery(intent: QueryIntent): string {
    return 'MATCH ()-[r]->() RETURN r as relationship';
  }

  private buildGenericQuery(intent: QueryIntent): string {
    return 'MATCH (n) RETURN n as entity LIMIT 50';
  }

  // Helper methods
  private applyFilters(entities: CodeEntity[], filters: QueryIntent['filters']): CodeEntity[] {
    let filtered = entities;

    if (filters.name) {
      filtered = filtered.filter(e => e.name.toLowerCase().includes(filters.name!.toLowerCase()));
    }

    if (filters.language) {
      filtered = filtered.filter(e => e.language === filters.language);
    }

    if (filters.complexity) {
      filtered = filtered.filter(e => {
        const complexity = e.metadata.complexity || 0;
        const { operator, value } = filters.complexity!;
        return operator === 'gt' ? complexity > value :
               operator === 'lt' ? complexity < value :
               complexity === value;
      });
    }

    return filtered;
  }

  private async findRelatedEntities(entities: CodeEntity[]): Promise<CodeEntity[]> {
    // Find entities related to the given entities
    return [];
  }

  private async calculateMetrics(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Record<string, number>> {
    return {
      totalEntities: entities.length,
      totalRelationships: relationships.length,
      avgComplexity: entities
        .filter(e => e.metadata.complexity)
        .reduce((sum, e) => sum + e.metadata.complexity, 0) / entities.length || 0
    };
  }

  private async analyzeFunctions(entities: CodeEntity[]): Promise<Record<string, number>> {
    const functions = entities.filter(e => e.type === 'Function');
    return {
      count: functions.length,
      avgComplexity: functions.reduce((sum, f) => sum + (f.metadata.complexity || 0), 0) / functions.length || 0,
      maxComplexity: Math.max(...functions.map(f => f.metadata.complexity || 0)),
      totalLines: functions.reduce((sum, f) => sum + (f.metadata.lineCount || 0), 0)
    };
  }

  private async analyzeClasses(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Record<string, number>> {
    const classes = entities.filter(e => e.type === 'Class');
    return {
      count: classes.length,
      avgMethods: classes.reduce((sum, c) => sum + (c.metadata.methods?.length || 0), 0) / classes.length || 0,
      inheritance: relationships.filter(r => r.type === 'INHERITS').length
    };
  }

  private async analyzeModules(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<Record<string, number>> {
    const modules = entities.filter(e => e.type === 'Module');
    return {
      count: modules.length,
      avgDependencies: relationships.filter(r => r.type === 'IMPORTS').length / modules.length || 0,
      totalSize: modules.reduce((sum, m) => sum + (m.metadata.size || 0), 0)
    };
  }

  private async analyzeProject(): Promise<Record<string, number>> {
    // Get overall project metrics
    const query = `
      MATCH (f:Function)
      WITH count(f) as functions, avg(f.complexity) as avgComplexity
      MATCH (c:Class)
      WITH functions, avgComplexity, count(c) as classes
      MATCH (m:Module)
      RETURN {
        functions: functions,
        classes: classes,
        modules: count(m),
        avgComplexity: avgComplexity
      } as metrics
    `;

    const result = await this.memory.graph.query(query);
    return result.success && result.data.length > 0 ? result.data[0].metrics : {};
  }

  private async generateExplanations(query: string, intent: QueryIntent, result: QueryResult): Promise<string[]> {
    const explanations: string[] = [];
    
    explanations.push(`Found ${result.entities.length} ${intent.target}(s) matching your query.`);
    
    if (result.metrics.avgComplexity) {
      explanations.push(`Average complexity is ${result.metrics.avgComplexity.toFixed(1)}.`);
    }
    
    return explanations;
  }

  private async generateSuggestions(query: string, intent: QueryIntent, result: QueryResult): Promise<string[]> {
    const suggestions: string[] = [];
    
    if (result.entities.length === 0) {
      suggestions.push('Try broadening your search criteria.');
      suggestions.push('Check if the entity names are spelled correctly.');
    } else if (result.entities.length > 50) {
      suggestions.push('Consider adding more specific filters to narrow down results.');
    }
    
    return suggestions;
  }

  private async generateDetailedExplanations(entities: CodeEntity[], relationships: CodeRelationship[]): Promise<string[]> {
    // Generate detailed explanations about the entities and their relationships
    return [];
  }

  private async generateCodeSuggestions(intent: QueryIntent): Promise<string[]> {
    // Generate suggestions for code improvements
    return [];
  }

  private isRelevantToContext(suggestion: string, context: string): boolean {
    // Check if a suggestion is relevant to the given context
    const suggestionWords = suggestion.toLowerCase().split(/\s+/);
    const contextWords = context.split(/\s+/);
    
    return contextWords.some(word => suggestionWords.includes(word));
  }
}

/**
 * Base class for intent patterns
 */
export abstract class IntentPattern {
  protected keywords: string[];
  protected patterns: RegExp[];

  constructor(keywords: string[], patterns: string[]) {
    this.keywords = keywords;
    this.patterns = patterns.map(p => new RegExp(p, 'i'));
  }

  abstract match(query: string): QueryIntent | null;

  protected containsKeywords(query: string, keywords: string[]): boolean {
    return keywords.some(keyword => query.includes(keyword));
  }
}

/**
 * Specific intent pattern implementations
 */
class FunctionFindPattern extends IntentPattern {
  constructor() {
    super(
      ['function', 'method', 'call'],
      [
        'find.*function.*(?:named?|called?)\\s+(\\w+)',
        'show.*function.*(?:with|having)\\s+(\\w+)',
        'list.*function.*(?:that|which)\\s+(\\w+)'
      ]
    );
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'function',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class ClassFindPattern extends IntentPattern {
  constructor() {
    super(['class', 'classes'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'class',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class ModuleFindPattern extends IntentPattern {
  constructor() {
    super(['module', 'modules', 'package'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'module',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class CallerFindPattern extends IntentPattern {
  constructor() {
    super(['call', 'calls', 'caller', 'invoke'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'relationship',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class UsageFindPattern extends IntentPattern {
  constructor() {
    super(['use', 'usage', 'used', 'depend'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'relationship',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class ComplexityAnalyzePattern extends IntentPattern {
  constructor() {
    super(['complex', 'complexity', 'complicated'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'analyze',
        target: 'function',
        filters: {},
        modifiers: { includeMetrics: true },
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class DependencyAnalyzePattern extends IntentPattern {
  constructor() {
    super(['depend', 'dependency', 'dependencies'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'analyze',
        target: 'module',
        filters: {},
        modifiers: { includeRelated: true },
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class ArchitectureAnalyzePattern extends IntentPattern {
  constructor() {
    super(['architecture', 'structure', 'design'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'analyze',
        target: 'project',
        filters: {},
        modifiers: { includeMetrics: true, includeRelated: true },
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class TechnicalDebtPattern extends IntentPattern {
  constructor() {
    super(['debt', 'technical debt', 'issue', 'problem'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'pattern',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class DesignPatternPattern extends IntentPattern {
  constructor() {
    super(['pattern', 'patterns', 'design pattern'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'pattern',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}

class CodeSmellPattern extends IntentPattern {
  constructor() {
    super(['smell', 'smells', 'code smell', 'anti-pattern'], []);
  }

  match(query: string): QueryIntent | null {
    if (this.containsKeywords(query, this.keywords)) {
      return {
        type: 'find',
        target: 'pattern',
        filters: {},
        modifiers: {},
        context: query.split(/\s+/)
      };
    }
    return null;
  }
}