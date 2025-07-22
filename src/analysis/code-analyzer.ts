/**
 * Code Analyzer
 * Main engine for analyzing code structure and extracting entities/relationships
 */

import path from 'path';
import { UnifiedMemory } from '../graph/unified-memory.js';
import { NodeType } from '../graph/types.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';
import { EntityExtractor } from './extractors/entity-extractor.js';
import { RelationshipExtractor } from './extractors/relationship-extractor.js';
import { TypeScriptParser } from './parsers/typescript-parser.js';

export interface CodeEntity {
  id: string;
  name: string;
  type: CodeEntityType;
  filePath: string;
  line: number;
  column: number;
  content: string;
  signature?: string;
  language: string;
  metadata: Record<string, any>;
}

export interface CodeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: CodeRelationshipType;
  filePath: string;
  line: number;
  metadata: Record<string, any>;
}

export enum CodeEntityType {
  FUNCTION = 'Function',
  CLASS = 'Class',
  INTERFACE = 'Interface',
  TYPE = 'Type',
  VARIABLE = 'Variable',
  CONSTANT = 'Constant',
  MODULE = 'Module',
  PACKAGE = 'Package',
  IMPORT = 'Import',
  EXPORT = 'Export'
}

export enum CodeRelationshipType {
  CALLS = 'CALLS',
  IMPORTS = 'IMPORTS',
  EXPORTS = 'EXPORTS',
  INHERITS = 'INHERITS',
  IMPLEMENTS = 'IMPLEMENTS',
  DEPENDS_ON = 'DEPENDS_ON',
  DEFINES = 'DEFINES',
  USES = 'USES',
  MODIFIES = 'MODIFIES',
  CONTAINS = 'CONTAINS',
  REFERENCES = 'REFERENCES'
}

export interface AnalysisResult {
  entities: CodeEntity[];
  relationships: CodeRelationship[];
  metrics: {
    totalLines: number;
    functions: number;
    classes: number;
    complexity: number;
  };
  insights: string[];
}

export interface AnalysisOptions {
  includeTests?: boolean;
  maxDepth?: number;
  languages?: string[];
  patterns?: string[];
  excludePatterns?: string[];
}

export class CodeAnalyzer {
  private memory: UnifiedMemory;
  private entityExtractor: EntityExtractor;
  private relationshipExtractor: RelationshipExtractor;
  private parsers: Map<string, any> = new Map();

  constructor(memory: UnifiedMemory) {
    this.memory = memory;
    this.entityExtractor = new EntityExtractor();
    this.relationshipExtractor = new RelationshipExtractor();
    
    // Initialize parsers
    this.parsers.set('typescript', new TypeScriptParser());
    this.parsers.set('javascript', new TypeScriptParser()); // TS parser handles JS too
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string, content: string): Promise<Result<AnalysisResult>> {
    try {
      const language = this.detectLanguage(filePath);
      const parser = this.parsers.get(language);
      
      if (!parser) {
        return {
          success: false,
          error: toKBError(new Error(`Unsupported language: ${language}`), { operation: 'analyzeFile' })
        };
      }

      // Parse the code to get AST
      const parseResult = await parser.parse(content, filePath);
      if (!parseResult.success) {
        return parseResult;
      }

      // Extract entities from AST
      const entities = await this.entityExtractor.extractEntities(parseResult.data, filePath, language);
      
      // Extract relationships from AST
      const relationships = await this.relationshipExtractor.extractRelationships(
        parseResult.data, 
        entities, 
        filePath
      );

      // Calculate metrics
      const metrics = this.calculateMetrics(content, entities);

      // Generate insights
      const insights = this.generateInsights(entities, relationships, metrics);

      // Store in knowledge graph
      await this.storeInGraph(entities, relationships, filePath);

      return {
        success: true,
        data: {
          entities,
          relationships,
          metrics,
          insights
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
   * Analyze an entire project
   */
  async analyzeProject(projectPath: string, options: AnalysisOptions = {}): Promise<Result<AnalysisResult>> {
    try {
      const files = await this.findSourceFiles(projectPath, options);
      
      const allEntities: CodeEntity[] = [];
      const allRelationships: CodeRelationship[] = [];
      const totalMetrics = {
        totalLines: 0,
        functions: 0,
        classes: 0,
        complexity: 0
      };
      const allInsights: string[] = [];

      // Analyze each file
      for (const file of files) {
        const content = await this.readFile(file);
        const result = await this.analyzeFile(file, content);
        
        if (result.success) {
          allEntities.push(...result.data.entities);
          allRelationships.push(...result.data.relationships);
          totalMetrics.totalLines += result.data.metrics.totalLines;
          totalMetrics.functions += result.data.metrics.functions;
          totalMetrics.classes += result.data.metrics.classes;
          totalMetrics.complexity += result.data.metrics.complexity;
          allInsights.push(...result.data.insights);
        }
      }

      // Find cross-file relationships
      const crossFileRelationships = await this.findCrossFileRelationships(allEntities);
      allRelationships.push(...crossFileRelationships);

      // Generate project-level insights
      const projectInsights = this.generateProjectInsights(allEntities, allRelationships);
      allInsights.push(...projectInsights);

      return {
        success: true,
        data: {
          entities: allEntities,
          relationships: allRelationships,
          metrics: totalMetrics,
          insights: allInsights
        }
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'analyzeProject' })
      };
    }
  }

  /**
   * Find similar code patterns
   */
  async findSimilarCode(snippet: string, options?: { limit?: number; threshold?: number }): Promise<Result<CodeEntity[]>> {
    try {
      // Use vector search to find semantically similar code
      const searchResult = await this.memory.vector.semanticSearch(
        snippet,
        options?.limit || 10,
        options?.threshold || 0.8
      );

      if (!searchResult.success) {
        return searchResult;
      }

      // Filter for code entities
      const codeEntities = searchResult.data
        .filter(item => Object.values(CodeEntityType).includes(item.node.type as CodeEntityType))
        .map(item => item.node as unknown as CodeEntity);

      return {
        success: true,
        data: codeEntities
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'findSimilarCode' })
      };
    }
  }

  /**
   * Perform impact analysis for a code entity
   */
  async getImpactAnalysis(entityId: string): Promise<Result<{
    directDependents: CodeEntity[];
    indirectDependents: CodeEntity[];
    dependsOn: CodeEntity[];
    riskLevel: 'low' | 'medium' | 'high';
  }>> {
    try {
      // Find direct dependents (things that directly use this entity)
      const directQuery = `
        MATCH (source {id: $entityId})<-[:CALLS|USES|REFERENCES]-(dependent)
        RETURN dependent
      `;
      
      const directResult = await this.memory.graph.query(directQuery, { entityId });
      const directDependents = directResult.success ? directResult.data.map((row: any) => row.dependent) : [];

      // Find indirect dependents (things that use the direct dependents)
      const indirectQuery = `
        MATCH (source {id: $entityId})<-[:CALLS|USES|REFERENCES*2..3]-(dependent)
        WHERE dependent.id <> $entityId
        RETURN DISTINCT dependent
      `;
      
      const indirectResult = await this.memory.graph.query(indirectQuery, { entityId });
      const indirectDependents = indirectResult.success ? indirectResult.data.map((row: any) => row.dependent) : [];

      // Find what this entity depends on
      const dependsOnQuery = `
        MATCH (source {id: $entityId})-[:CALLS|USES|REFERENCES]->(dependency)
        RETURN dependency
      `;
      
      const dependsOnResult = await this.memory.graph.query(dependsOnQuery, { entityId });
      const dependsOn = dependsOnResult.success ? dependsOnResult.data.map((row: any) => row.dependency) : [];

      // Calculate risk level
      const totalDependents = directDependents.length + indirectDependents.length;
      const riskLevel = totalDependents > 20 ? 'high' : totalDependents > 5 ? 'medium' : 'low';

      return {
        success: true,
        data: {
          directDependents,
          indirectDependents,
          dependsOn,
          riskLevel
        }
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'getImpactAnalysis' })
      };
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.cpp':
      case '.cc':
      case '.cxx':
        return 'cpp';
      case '.c':
        return 'c';
      case '.rs':
        return 'rust';
      case '.go':
        return 'go';
      default:
        return 'unknown';
    }
  }

  /**
   * Calculate code metrics
   */
  private calculateMetrics(content: string, entities: CodeEntity[]): {
    totalLines: number;
    functions: number;
    classes: number;
    complexity: number;
  } {
    const lines = content.split('\n');
    const functions = entities.filter(e => e.type === CodeEntityType.FUNCTION).length;
    const classes = entities.filter(e => e.type === CodeEntityType.CLASS).length;
    
    // Simple complexity calculation - could be enhanced
    const complexity = functions * 2 + classes * 3;

    return {
      totalLines: lines.length,
      functions,
      classes,
      complexity
    };
  }

  /**
   * Generate insights from analysis
   */
  private generateInsights(entities: CodeEntity[], relationships: CodeRelationship[], metrics: any): string[] {
    const insights: string[] = [];

    // Function complexity insights
    if (metrics.functions > 50) {
      insights.push(`High function count (${metrics.functions}) - consider modularization`);
    }

    // Class insights
    if (metrics.classes > 20) {
      insights.push(`High class count (${metrics.classes}) - consider package organization`);
    }

    // Relationship insights
    const callRelationships = relationships.filter(r => r.type === CodeRelationshipType.CALLS);
    if (callRelationships.length > entities.length * 2) {
      insights.push('High coupling detected - consider refactoring for better separation of concerns');
    }

    return insights;
  }

  /**
   * Store entities and relationships in the knowledge graph
   */
  private async storeInGraph(entities: CodeEntity[], relationships: CodeRelationship[], filePath: string): Promise<void> {
    // Store entities as nodes
    for (const entity of entities) {
      await this.memory.store(entity.content, {
        type: NodeType.ENTITY,
        entityType: entity.type,
        filePath: entity.filePath,
        line: entity.line,
        column: entity.column,
        language: entity.language,
        signature: entity.signature,
        ...entity.metadata
      });
    }

    // Store relationships as edges
    for (const rel of relationships) {
      await this.memory.graph.createEdge(
        rel.sourceId,
        rel.targetId,
        rel.type as any,
        { filePath: rel.filePath, line: rel.line, ...rel.metadata }
      );
    }
  }

  /**
   * Find source files in project
   */
  private async findSourceFiles(projectPath: string, options: AnalysisOptions): Promise<string[]> {
    // This would use file system traversal - placeholder for now
    // In real implementation, would use glob patterns and respect .gitignore
    return [];
  }

  /**
   * Read file content
   */
  private async readFile(filePath: string): Promise<string> {
    // Placeholder - would use fs.readFile in real implementation
    return '';
  }

  /**
   * Find relationships between entities across files
   */
  private async findCrossFileRelationships(entities: CodeEntity[]): Promise<CodeRelationship[]> {
    // Analyze imports, exports, and cross-file references
    // Placeholder for now
    return [];
  }

  /**
   * Generate project-level insights
   */
  private generateProjectInsights(entities: CodeEntity[], relationships: CodeRelationship[]): string[] {
    const insights: string[] = [];
    
    // Architecture insights
    const modules = entities.filter(e => e.type === CodeEntityType.MODULE).length;
    if (modules > 100) {
      insights.push('Large module count suggests need for better organization');
    }

    // Dependency insights
    const imports = relationships.filter(r => r.type === CodeRelationshipType.IMPORTS).length;
    if (imports > entities.length) {
      insights.push('High import ratio suggests potential circular dependencies');
    }

    return insights;
  }
}