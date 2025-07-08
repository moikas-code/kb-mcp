/**
 * UnifiedMemory Implementation
 * Combines all memory systems into a cohesive interface
 */

import { EventEmitter } from 'events';
// import { v4 as uuidv4 } from 'uuid';
import { IUnifiedMemory, IGraphMemory, IVectorMemory, ITemporalMemory, IWorkingMemory } from './interfaces.js';
import { GraphMemory } from './graph-memory.js';
import { VectorMemory } from './vector-memory.js';
import { TemporalMemory } from './temporal-memory.js';
import { WorkingMemory } from './working-memory.js';
import { FalkorDBConnection, FalkorDBConfig } from './connection.js';
import { MemoryManager } from '../monitoring/memory-manager.js';
import {
  Node, NodeType, EdgeType, MemoryType, SearchOptions, 
  GraphQueryResult, InsightNode, FactNode
} from './types.js';
import { Result } from '../types/index.js';
// import { GRAPH_SCHEMA } from './schema.js';
import { toKBError } from '../types/error-utils.js';

export interface UnifiedMemoryConfig extends FalkorDBConfig {
  embedding_model?: string;
  session_id?: string;
  enable_auto_consolidation?: boolean;
  consolidation_threshold?: number;
  contradiction_detection?: boolean;
  insight_generation?: boolean;
}

export class UnifiedMemory extends EventEmitter implements IUnifiedMemory {
  public graph: IGraphMemory;
  public vector: IVectorMemory;
  public temporal: ITemporalMemory;
  public working: IWorkingMemory;
  
  private connection: FalkorDBConnection;
  private config: UnifiedMemoryConfig;
  private consolidationTimer?: NodeJS.Timeout;
  private memoryManager: MemoryManager;
  
  constructor(config: UnifiedMemoryConfig) {
    super();
    
    this.config = {
      enable_auto_consolidation: true,
      consolidation_threshold: 5,
      contradiction_detection: true,
      insight_generation: true,
      ...config,
    };

    // Initialize memory manager
    this.memoryManager = new MemoryManager({
      warning: 80,
      critical: 90,
      maxHeapSize: 1024 * 1024 * 1024, // 1GB
    });
    
    // Initialize connection
    this.connection = FalkorDBConnection.getInstance(config);
    
    // Initialize memory subsystems
    this.graph = new GraphMemory(this.connection);
    this.vector = new VectorMemory(this.connection, config.embedding_model);
    this.temporal = new TemporalMemory(this.connection);
    this.working = new WorkingMemory(this.connection, config.session_id);
    
    // Setup auto-consolidation if enabled
    if (this.config.enable_auto_consolidation) {
      this.startAutoConsolidation();
    }
  }

  /**
   * Initialize the unified memory system
   */
  async initialize(): Promise<Result<void>> {
    const result = await this.connection.connect();
    
    if (!result.success) {
      return result;
    }
    
    // Initialize schema
    await this.connection.query('CREATE INDEX IF NOT EXISTS ON :Node(id)');
    await this.connection.query('CREATE INDEX IF NOT EXISTS ON :Node(type)');
    await this.connection.query('CREATE INDEX IF NOT EXISTS ON :Node(memory_type)');
    
    // Start memory monitoring
    this.memoryManager.start(30000); // Check every 30 seconds
    
    // Register cleanup callbacks
    this.memoryManager.registerCleanup(async () => {
      await this.cleanupMemory();
    });
    
    // Handle memory alerts
    this.memoryManager.on('alert', (alert) => {
      console.warn('Memory alert:', alert);
      this.emit('memory:alert', alert);
    });
    
    return { success: true, data: undefined };
  }

  /**
   * Store information across all memory systems
   */
  async store(
    content: string,
    options?: {
      type?: NodeType;
      memoryType?: MemoryType;
      metadata?: Record<string, any>;
      embedding?: number[];
      timestamp?: Date;
    }
  ): Promise<Result<Node>> {
    try {
      const memoryType = options?.memoryType ?? MemoryType.SHORT_TERM;
      
      // Store in working memory first
      if (memoryType === MemoryType.WORKING) {
        const result = await this.working.store(content, options?.metadata);
        if (result.success) {
          this.emit('node:created', result.data);
        }
        return result;
      }
      
      // Store in graph memory
      const graphResult = await this.graph.store(content, {
        ...options?.metadata,
        type: options?.type,
        memory_type: memoryType,
      });
      
      if (!graphResult.success) {
        return graphResult;
      }
      
      const node = graphResult.data;
      
      // Store embedding if not provided
      if (!options?.embedding) {
        const vectorResult = await this.vector.storeEmbedding(
          node.id,
          [],
          { content }
        );
        
        if (!vectorResult.success) {
          console.warn('Failed to generate embedding:', vectorResult.error);
        }
      } else {
        await this.vector.storeEmbedding(node.id, options.embedding);
      }
      
      // Add temporal information if provided
      if (options?.timestamp) {
        await this.temporal.storeWithTime(content, options.timestamp);
      }
      
      // Detect contradictions if enabled
      if (this.config.contradiction_detection && node.type === NodeType.FACT) {
        await this.detectContradictions(node as FactNode);
      }
      
      // Generate insights if enabled
      if (this.config.insight_generation) {
        await this.generateInsightsFor(node);
      }
      
      this.emit('node:created', node);
      
      return {
        success: true,
        data: node,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Failed to store: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'store' }),
      };
    }
  }

  /**
   * Hybrid search across all memory systems
   */
  async search(
    query: string,
    options?: SearchOptions & {
      useVector?: boolean;
      useGraph?: boolean;
      useTemporal?: boolean;
    }
  ): Promise<Result<GraphQueryResult>> {
    try {
      const results: GraphQueryResult[] = [];
      
      // Default to using all search types
      const useVector = options?.useVector ?? true;
      const useGraph = options?.useGraph ?? true;
      const useTemporal = options?.useTemporal ?? true;
      
      // Parallel search across systems
      const searchPromises: Promise<Result<GraphQueryResult>>[] = [];
      
      if (useGraph) {
        searchPromises.push(this.graph.retrieve(query, options));
      }
      
      if (useVector) {
        searchPromises.push(this.vector.retrieve(query, options));
      }
      
      if (useTemporal && options?.time_range) {
        searchPromises.push(
          this.temporal.retrieveByTimeRange(
            new Date(options.time_range.start),
            new Date(options.time_range.end),
            options
          )
        );
      }
      
      // Also search working memory
      searchPromises.push(this.working.retrieve(query, options));
      
      const searchResults = await Promise.all(searchPromises);
      
      // Merge results
      const allNodes: Map<string, Node> = new Map();
      const allEdges: Map<string, any> = new Map();
      
      for (const result of searchResults) {
        if (result.success && result.data) {
          for (const node of result.data.nodes) {
            allNodes.set(node.id, node);
          }
          for (const edge of result.data.edges) {
            allEdges.set(edge.id, edge);
          }
        }
      }
      
      // Rank and filter results
      const rankedNodes = await this.rankResults(
        Array.from(allNodes.values()),
        query
      );
      
      return {
        success: true,
        data: {
          nodes: rankedNodes.slice(0, options?.limit ?? 10),
          edges: Array.from(allEdges.values()),
          metadata: {
            query_time_ms: 0,
            total_nodes: rankedNodes.length,
            total_edges: allEdges.size,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'search' }),
      };
    }
  }

  /**
   * Consolidate memories
   */
  async consolidate(): Promise<Result<void>> {
    try {
      // Find memories to consolidate
      const cypher = `
        MATCH (m:Memory)
        WHERE m.memory_type = 'short_term'
          AND m.reinforcement_count >= $threshold
        RETURN m
      `;
      
      const result = await this.connection.query(cypher, {
        threshold: this.config.consolidation_threshold,
      });
      
      if (!result.success || !result.data) {
        return result;
      }
      
      const nodesToConsolidate = result.data.map((row: any) => row.m);
      
      // Promote to long-term memory
      for (const node of nodesToConsolidate) {
        await this.graph.update(node.id, {
          memory_type: MemoryType.LONG_TERM,
          importance: Math.min(node.importance * 1.5, 1.0),
        });
      }
      
      // Merge similar memories
      await this.mergeSimilarMemories();
      
      // Clean up old working memory
      await this.cleanupWorkingMemory();
      
      this.emit('memory:consolidated', nodesToConsolidate);
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Consolidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'consolidate' }),
      };
    }
  }

  /**
   * Detect and resolve contradictions
   */
  async resolveContradictions(): Promise<Result<Array<{node1: Node; node2: Node; resolution?: string}>>> {
    try {
      const cypher = `
        MATCH (n1:Fact)-[:CONTRADICTS]-(n2:Fact)
        WHERE id(n1) < id(n2)
        RETURN n1, n2
        LIMIT 50
      `;
      
      const result = await this.connection.query(cypher);
      
      if (!result.success || !result.data) {
        return {
          success: true,
          data: [],
        };
      }
      
      const contradictions: Array<{node1: Node; node2: Node; resolution?: string}> = [];
      
      for (const row of result.data) {
        const node1 = row.n1 as FactNode;
        const node2 = row.n2 as FactNode;
        
        // Simple resolution strategy based on confidence and recency
        let resolution: string | undefined;
        
        if (node1.confidence > node2.confidence) {
          resolution = `Prefer statement 1 due to higher confidence (${node1.confidence} vs ${node2.confidence})`;
        } else if (node2.confidence > node1.confidence) {
          resolution = `Prefer statement 2 due to higher confidence (${node2.confidence} vs ${node1.confidence})`;
        } else if (node1.updated_at > node2.updated_at) {
          resolution = `Prefer statement 1 as more recent`;
        } else {
          resolution = `Unable to resolve automatically - manual review needed`;
        }
        
        contradictions.push({ node1, node2, resolution });
        
        this.emit('contradiction:detected', node1, node2);
      }
      
      return {
        success: true,
        data: contradictions,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Contradiction detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'resolveContradictions' }),
      };
    }
  }

  /**
   * Generate insights from memories
   */
  async generateInsights(): Promise<Result<Node[]>> {
    try {
      // Find patterns and connections
      const cypher = `
        MATCH (n1)-[r1]-(n2)-[r2]-(n3)
        WHERE n1.type IN ['fact', 'event'] 
          AND n2.type IN ['fact', 'event']
          AND n3.type IN ['fact', 'event']
          AND id(n1) < id(n3)
        WITH n1, n2, n3, collect(r1) + collect(r2) as relationships
        WHERE size(relationships) >= 2
        RETURN n1, n2, n3, relationships
        LIMIT 20
      `;
      
      const result = await this.connection.query(cypher);
      
      if (!result.success || !result.data) {
        return {
          success: true,
          data: [],
        };
      }
      
      const insights: Node[] = [];
      
      for (const row of result.data) {
        const n1 = row.n1;
        const n2 = row.n2;
        const n3 = row.n3;
        
        // Generate insight based on pattern
        const insightContent = this.generateInsightFromPattern(n1, n2, n3);
        
        if (insightContent) {
          const insightResult = await this.graph.createNode({
            type: NodeType.INSIGHT,
            insight: insightContent,
            reasoning: `Pattern detected between ${n1.type}, ${n2.type}, and ${n3.type}`,
            supporting_nodes: [n1.id, n2.id, n3.id],
            impact: 'medium',
            actionable: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            accessed_at: new Date().toISOString(),
            access_count: 0,
            importance: 0.7,
            confidence: 0.8,
            metadata: {},
          } as Omit<InsightNode, 'id'>);
          
          if (insightResult.success) {
            insights.push(insightResult.data);
            
            // Create relationships
            await this.graph.createEdge(insightResult.data.id, n1.id, EdgeType.DERIVED_FROM);
            await this.graph.createEdge(insightResult.data.id, n2.id, EdgeType.DERIVED_FROM);
            await this.graph.createEdge(insightResult.data.id, n3.id, EdgeType.DERIVED_FROM);
            
            this.emit('insight:generated', insightResult.data);
          }
        }
      }
      
      return {
        success: true,
        data: insights,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Insight generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'generateInsights' }),
      };
    }
  }

  /**
   * Export memory snapshot
   */
  async export(format: 'json' | 'cypher' | 'graphml'): Promise<Result<string>> {
    switch (format) {
      case 'cypher':
        return this.connection.exportGraph();
        
      case 'json':
        return this.exportJSON();
        
      case 'graphml':
        return this.exportGraphML();
        
      default:
        return {
          success: false,
          error: toKBError(new Error(`Unsupported export format: ${format}`), { operation: 'export' }),
        };
    }
  }

  /**
   * Import memory snapshot
   */
  async import(data: string, format: 'json' | 'cypher' | 'graphml'): Promise<Result<void>> {
    switch (format) {
      case 'cypher':
        return this.connection.importGraph(data);
        
      case 'json':
        return this.importJSON(data);
        
      case 'graphml':
        return this.importGraphML(data);
        
      default:
        return {
          success: false,
          error: toKBError(new Error(`Unsupported import format: ${format}`), { operation: 'import' }),
        };
    }
  }

  /**
   * Get unified statistics
   */
  async getStats(): Promise<Result<{
    graph: Record<string, any>;
    vector: Record<string, any>;
    temporal: Record<string, any>;
    working: Record<string, any>;
    overall: Record<string, any>;
  }>> {
    try {
      const [graphStats, vectorStats, temporalStats, workingStats] = await Promise.all([
        this.graph.getStats(),
        this.vector.getStats(),
        this.temporal.getStats(),
        this.working.getStats(),
      ]);
      
      const overallCypher = `
        MATCH (n)
        WITH count(n) as total_nodes,
             count(DISTINCT n.type) as node_types,
             avg(n.importance) as avg_importance,
             avg(n.confidence) as avg_confidence
        MATCH ()-[r]->()
        RETURN {
          total_nodes: total_nodes,
          total_edges: count(r),
          node_types: node_types,
          avg_importance: avg_importance,
          avg_confidence: avg_confidence
        } as stats
      `;
      
      const overallResult = await this.connection.query(overallCypher);
      
      return {
        success: true,
        data: {
          graph: graphStats.success ? graphStats.data : {},
          vector: vectorStats.success ? vectorStats.data : {},
          temporal: temporalStats.success ? temporalStats.data : {},
          working: workingStats.success ? workingStats.data : {},
          overall: overallResult.success ? overallResult.data[0].stats : {},
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'getStats' }),
      };
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
    }
    
    await this.connection.disconnect();
  }

  /**
   * Start auto-consolidation
   */
  private startAutoConsolidation(): void {
    this.consolidationTimer = setInterval(
      () => {
        this.consolidate().catch(error => {
          console.error('Auto-consolidation failed:', error);
        });
      },
      5 * 60 * 1000 // Every 5 minutes
    );
  }

  /**
   * Rank search results
   */
  private async rankResults(nodes: Node[], query: string): Promise<Node[]> {
    // Simple ranking based on multiple factors
    return nodes.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      
      // Importance factor
      scoreA += a.importance * 0.3;
      scoreB += b.importance * 0.3;
      
      // Confidence factor
      scoreA += a.confidence * 0.2;
      scoreB += b.confidence * 0.2;
      
      // Recency factor
      const recencyA = new Date(a.accessed_at).getTime();
      const recencyB = new Date(b.accessed_at).getTime();
      scoreA += (recencyA / Date.now()) * 0.2;
      scoreB += (recencyB / Date.now()) * 0.2;
      
      // Access count factor
      scoreA += Math.min(a.access_count / 100, 1) * 0.1;
      scoreB += Math.min(b.access_count / 100, 1) * 0.1;
      
      // Type relevance
      const relevantTypes = [NodeType.FACT, NodeType.INSIGHT, NodeType.MEMORY];
      if (relevantTypes.includes(a.type as NodeType)) scoreA += 0.2;
      if (relevantTypes.includes(b.type as NodeType)) scoreB += 0.2;
      
      return scoreB - scoreA;
    });
  }

  /**
   * Detect contradictions for a fact
   */
  private async detectContradictions(fact: FactNode): Promise<void> {
    // Find similar facts that might contradict
    const similarResult = await this.vector.semanticSearch(
      fact.statement,
      20,
      0.7
    );
    
    if (!similarResult.success) {
      return;
    }
    
    for (const { node: similarNode } of similarResult.data) {
      if (similarNode.id !== fact.id && similarNode.type === NodeType.FACT) {
        const similarFact = similarNode as FactNode;
        
        // Simple contradiction detection
        if (this.areContradictory(fact.statement, similarFact.statement)) {
          await this.graph.createEdge(
            fact.id,
            similarFact.id,
            EdgeType.CONTRADICTS,
            { metadata: { detected_at: new Date().toISOString() } }
          );
        }
      }
    }
  }

  /**
   * Check if two statements are contradictory
   */
  private areContradictory(statement1: string, statement2: string): boolean {
    // Simple heuristic - look for negation patterns
    const negationPatterns = [
      { positive: /is\s+(\w+)/, negative: /is\s+not\s+(\w+)/ },
      { positive: /are\s+(\w+)/, negative: /are\s+not\s+(\w+)/ },
      { positive: /can\s+(\w+)/, negative: /cannot\s+(\w+)/ },
      { positive: /will\s+(\w+)/, negative: /will\s+not\s+(\w+)/ },
    ];
    
    for (const pattern of negationPatterns) {
      const match1Pos = statement1.match(pattern.positive);
      const match1Neg = statement1.match(pattern.negative);
      const match2Pos = statement2.match(pattern.positive);
      const match2Neg = statement2.match(pattern.negative);
      
      if ((match1Pos && match2Neg) || (match1Neg && match2Pos)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate insights for a node
   */
  private async generateInsightsFor(node: Node): Promise<void> {
    // Only generate insights for certain node types
    if (![NodeType.FACT, NodeType.EVENT, NodeType.ENTITY].includes(node.type as NodeType)) {
      return;
    }
    
    // Find related nodes
    const relatedResult = await this.graph.findRelated(node.id, 2);
    
    if (!relatedResult.success || relatedResult.data.nodes.length < 3) {
      return;
    }
    
    // Look for patterns in related nodes
    // This is a placeholder - real insight generation would be more sophisticated
    await this.generateInsights();
  }

  /**
   * Generate insight from pattern
   */
  private generateInsightFromPattern(n1: any, n2: any, n3: any): string | null {
    // Simple pattern matching for insights
    if (n1.type === 'event' && n2.type === 'event' && n3.type === 'event') {
      return `Sequence of events detected: ${n1.name || n1.content} → ${n2.name || n2.content} → ${n3.name || n3.content}`;
    }
    
    if (n1.type === 'fact' && n2.type === 'fact' && n3.type === 'fact') {
      return `Related facts suggest a pattern or principle connecting these concepts`;
    }
    
    return null;
  }

  /**
   * Merge similar memories
   */
  private async mergeSimilarMemories(): Promise<void> {
    // Find highly similar memories
    const cypher = `
      MATCH (m1:Memory), (m2:Memory)
      WHERE id(m1) < id(m2)
        AND m1.memory_type = m2.memory_type
        AND m1.embedding IS NOT NULL
        AND m2.embedding IS NOT NULL
      WITH m1, m2,
           gds.alpha.similarity.cosine(m1.embedding, m2.embedding) as similarity
      WHERE similarity > 0.95
      RETURN m1, m2, similarity
      LIMIT 20
    `;
    
    // Note: This uses Neo4j GDS syntax - adapt for FalkorDB
    // For now, skip implementation
  }

  /**
   * Cleanup working memory
   */
  private async cleanupWorkingMemory(): Promise<void> {
    // Remove old items from working memory
    const cypher = `
      MATCH (m:WorkingMemory)
      WHERE datetime() > datetime(m.accessed_at) + duration({hours: 1})
        AND m.importance < 0.3
      DETACH DELETE m
    `;
    
    await this.connection.query(cypher);
  }

  /**
   * Cleanup memory to prevent leaks
   */
  private async cleanupMemory(): Promise<void> {
    try {
      // Clear old working memory
      await this.cleanupWorkingMemory();
      
      // Clear old temporal memories (older than 7 days)
      // const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      // await this.temporal.clearBefore(cutoffDate);
      
      // Clear vector index cache - method not yet implemented
      // if (this.vector.clearCache) {
      //   await this.vector.clearCache();
      // }
      
      // Clear low-importance nodes (importance < 0.1)
      await this.connection.query(`
        MATCH (n:Node) 
        WHERE n.importance < 0.1 
        AND n.created_at < datetime() - duration('P7D')
        DETACH DELETE n
      `);
      
      // Clear orphaned nodes (no edges)
      await this.connection.query(`
        MATCH (n:Node) 
        WHERE NOT (n)-[]-()
        AND n.created_at < datetime() - duration('P1D')
        DETACH DELETE n
      `);
      
      console.log('Memory cleanup completed');
    } catch (error) {
      console.error('Memory cleanup failed:', error);
    }
  }

  /**
   * Export as JSON
   */
  private async exportJSON(): Promise<Result<string>> {
    try {
      const nodesResult = await this.connection.query('MATCH (n) RETURN n');
      const edgesResult = await this.connection.query('MATCH ()-[r]->() RETURN r');
      
      if (!nodesResult.success || !edgesResult.success) {
        return {
          success: false,
          error: toKBError(new Error('Failed to fetch graph data'), { operation: 'exportJSON' }),
        };
      }
      
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        nodes: nodesResult.data.map((row: any) => row.n),
        edges: edgesResult.data.map((row: any) => row.r),
      };
      
      return {
        success: true,
        data: JSON.stringify(exportData, null, 2),
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'exportJSON' }),
      };
    }
  }

  /**
   * Import from JSON
   */
  private async importJSON(data: string): Promise<Result<void>> {
    try {
      const parsed = JSON.parse(data);
      
      // Import nodes
      for (const node of parsed.nodes) {
        await this.graph.createNode(node);
      }
      
      // Import edges
      for (const edge of parsed.edges) {
        await this.graph.createEdge(
          edge.source,
          edge.target,
          edge.type,
          edge
        );
      }
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'importJSON' }),
      };
    }
  }

  /**
   * Export as GraphML
   */
  private async exportGraphML(): Promise<Result<string>> {
    // GraphML export implementation
    return {
      success: false,
      error: toKBError(new Error('GraphML export not yet implemented'), { operation: 'exportGraphML' }),
    };
  }

  /**
   * Import from GraphML
   */
  private async importGraphML(data: string): Promise<Result<void>> {
    // GraphML import implementation
    return {
      success: false,
      error: toKBError(new Error('GraphML import not yet implemented'), { operation: 'importGraphML' }),
    };
  }
}