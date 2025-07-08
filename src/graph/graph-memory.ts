/**
 * GraphMemory Implementation
 * Core graph-based memory operations using FalkorDB
 */

import { v4 as uuidv4 } from 'uuid';
import { IGraphMemory } from './interfaces.js';
import { FalkorDBConnection } from './connection.js';
import { 
  Node, Edge, NodeType, EdgeType, SearchOptions, 
  GraphQueryResult, NodeSchema, EdgeSchema 
} from './types.js';
import { Result } from '@types/index.js';
import { GRAPH_SCHEMA } from './schema.js';

export class GraphMemory implements IGraphMemory {
  private connection: FalkorDBConnection;

  constructor(connection: FalkorDBConnection) {
    this.connection = connection;
  }

  /**
   * Store information in memory
   */
  async store(content: string, metadata?: Record<string, any>): Promise<Result<Node>> {
    // Determine node type based on content
    const nodeType = this.inferNodeType(content, metadata);
    
    // Create appropriate node
    const node: Omit<Node, 'id'> = {
      type: nodeType,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      accessed_at: new Date().toISOString(),
      access_count: 0,
      importance: metadata?.importance ?? 0.5,
      confidence: metadata?.confidence ?? 1.0,
      metadata: metadata ?? {},
      ...this.getNodeSpecificProps(nodeType, content, metadata),
    };

    return this.createNode(node);
  }

  /**
   * Retrieve information from memory
   */
  async retrieve(query: string, options?: SearchOptions): Promise<Result<GraphQueryResult>> {
    const cypher = `
      CALL db.idx.fulltext.queryNodes($index, $query) 
      YIELD node, score
      WHERE score >= $threshold
        ${options?.node_types ? 'AND node.type IN $node_types' : ''}
        ${options?.min_confidence ? 'AND node.confidence >= $min_confidence' : ''}
        ${options?.min_importance ? 'AND node.importance >= $min_importance' : ''}
      WITH node, score
      ORDER BY score DESC
      LIMIT $limit
      OPTIONAL MATCH (node)-[r]-(related)
      RETURN collect(DISTINCT node) as nodes, 
             collect(DISTINCT r) as edges,
             collect(DISTINCT related) as related_nodes
    `;

    const params = {
      index: 'fulltext_index',
      query,
      threshold: 0.5,
      limit: options?.limit ?? 10,
      node_types: options?.node_types,
      min_confidence: options?.min_confidence,
      min_importance: options?.min_importance,
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return result;
    }

    const data = result.data[0];
    const nodes = [...data.nodes, ...data.related_nodes];
    const edges = data.edges.filter((e: any) => e !== null);

    return {
      success: true,
      data: {
        nodes,
        edges,
        metadata: {
          query_time_ms: 0, // Would need to track this
          total_nodes: nodes.length,
          total_edges: edges.length,
        },
      },
    };
  }

  /**
   * Update existing memory
   */
  async update(nodeId: string, updates: Partial<Node>): Promise<Result<Node>> {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map(key => `n.${key} = $${key}`)
      .join(', ');

    const cypher = `
      MATCH (n {id: $nodeId})
      SET ${setClause}, n.updated_at = datetime()
      RETURN n
    `;

    const params = {
      nodeId,
      ...updates,
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: 'Node not found',
      };
    }

    return {
      success: true,
      data: result.data[0].n,
    };
  }

  /**
   * Forget (remove) information
   */
  async forget(nodeId: string): Promise<Result<void>> {
    const cypher = `
      MATCH (n {id: $nodeId})
      DETACH DELETE n
    `;

    const result = await this.connection.query(cypher, { nodeId });
    
    if (!result.success) {
      return result;
    }

    return { success: true, data: undefined };
  }

  /**
   * Reinforce memory (increase importance)
   */
  async reinforce(nodeId: string, amount: number = 0.1): Promise<Result<Node>> {
    const cypher = `
      MATCH (n {id: $nodeId})
      SET n.importance = CASE 
        WHEN n.importance + $amount > 1.0 THEN 1.0
        ELSE n.importance + $amount
      END,
      n.reinforcement_count = coalesce(n.reinforcement_count, 0) + 1,
      n.accessed_at = datetime(),
      n.access_count = n.access_count + 1
      RETURN n
    `;

    const result = await this.connection.query(cypher, { nodeId, amount });
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: 'Node not found',
      };
    }

    return {
      success: true,
      data: result.data[0].n,
    };
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<Result<Record<string, any>>> {
    return this.connection.getStats();
  }

  /**
   * Create a node in the graph
   */
  async createNode(node: Omit<Node, 'id'>): Promise<Result<Node>> {
    const id = uuidv4();
    const nodeWithId = { ...node, id };

    // Validate node
    const validation = NodeSchema.safeParse(nodeWithId);
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid node: ${validation.error.message}`,
      };
    }

    // Get the appropriate template
    const template = GRAPH_SCHEMA.nodeTemplates[node.type];
    if (!template) {
      return {
        success: false,
        error: `Unknown node type: ${node.type}`,
      };
    }

    // Execute the query
    const result = await this.connection.query(template, nodeWithId);
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data[0].n,
    };
  }

  /**
   * Create an edge between nodes
   */
  async createEdge(
    sourceId: string,
    targetId: string,
    edgeType: EdgeType,
    properties?: Partial<Edge>
  ): Promise<Result<Edge>> {
    const edge: Edge = {
      id: uuidv4(),
      type: edgeType,
      source: sourceId,
      target: targetId,
      weight: properties?.weight ?? 1.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: properties?.metadata ?? {},
      bidirectional: properties?.bidirectional ?? false,
    };

    // Validate edge
    const validation = EdgeSchema.safeParse(edge);
    if (!validation.success) {
      return {
        success: false,
        error: `Invalid edge: ${validation.error.message}`,
      };
    }

    const cypher = `
      MATCH (a {id: $sourceId})
      MATCH (b {id: $targetId})
      CREATE (a)-[r:${edgeType} {
        id: $id,
        type: $type,
        weight: $weight,
        created_at: $created_at,
        updated_at: $updated_at,
        metadata: $metadata,
        bidirectional: $bidirectional
      }]->(b)
      ${edge.bidirectional ? 'CREATE (b)-[r2:' + edgeType + ' { id: $id2, type: $type, weight: $weight, created_at: $created_at, updated_at: $updated_at, metadata: $metadata, bidirectional: $bidirectional }]->(a)' : ''}
      RETURN r
    `;

    const params = {
      sourceId,
      targetId,
      ...edge,
      id2: edge.bidirectional ? uuidv4() : undefined,
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: 'Failed to create edge - nodes might not exist',
      };
    }

    return {
      success: true,
      data: result.data[0].r,
    };
  }

  /**
   * Find nodes by type
   */
  async findNodesByType(type: NodeType, limit: number = 100): Promise<Result<Node[]>> {
    const cypher = `
      MATCH (n {type: $type})
      RETURN n
      ORDER BY n.importance DESC, n.created_at DESC
      LIMIT $limit
    `;

    const result = await this.connection.query(cypher, { type, limit });
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.map((row: any) => row.n),
    };
  }

  /**
   * Find related nodes
   */
  async findRelated(nodeId: string, maxDepth: number = 2): Promise<Result<GraphQueryResult>> {
    const cypher = `
      MATCH path = (start {id: $nodeId})-[*1..${maxDepth}]-(end)
      WITH start, end, path, length(path) as distance
      ORDER BY distance ASC
      LIMIT 50
      WITH collect(distinct start) + collect(distinct end) as nodes,
           [r in reduce(rels = [], p in collect(path) | rels + relationships(p)) | r] as relationships
      UNWIND nodes as node
      WITH collect(distinct node) as unique_nodes, relationships
      UNWIND relationships as rel
      RETURN unique_nodes as nodes, collect(distinct rel) as edges
    `;

    const result = await this.connection.query(cypher, { nodeId });
    
    if (!result.success) {
      return result;
    }

    const data = result.data[0];
    
    return {
      success: true,
      data: {
        nodes: data.nodes,
        edges: data.edges,
        metadata: {
          query_time_ms: 0,
          total_nodes: data.nodes.length,
          total_edges: data.edges.length,
          traversal_depth: maxDepth,
        },
      },
    };
  }

  /**
   * Find path between nodes
   */
  async findPath(startId: string, endId: string): Promise<Result<GraphQueryResult>> {
    const cypher = `
      MATCH path = shortestPath((start {id: $startId})-[*..10]-(end {id: $endId}))
      WITH nodes(path) as nodes, relationships(path) as edges
      RETURN nodes, edges
    `;

    const result = await this.connection.query(cypher, { startId, endId });
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: 'No path found between nodes',
      };
    }

    const data = result.data[0];
    
    return {
      success: true,
      data: {
        nodes: data.nodes,
        edges: data.edges,
        metadata: {
          query_time_ms: 0,
          total_nodes: data.nodes.length,
          total_edges: data.edges.length,
          traversal_depth: data.edges.length,
        },
      },
    };
  }

  /**
   * Execute custom Cypher query
   */
  async query(cypher: string, params?: Record<string, any>): Promise<Result<any>> {
    return this.connection.query(cypher, params);
  }

  /**
   * Batch operations
   */
  async batch(operations: Array<() => Promise<any>>): Promise<Result<any[]>> {
    const results: any[] = [];
    
    try {
      for (const operation of operations) {
        const result = await operation();
        results.push(result);
      }
      
      return {
        success: true,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        error: `Batch operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Infer node type from content
   */
  private inferNodeType(content: string, metadata?: Record<string, any>): NodeType {
    if (metadata?.type) {
      return metadata.type as NodeType;
    }

    // Simple heuristics
    if (content.endsWith('?')) {
      return NodeType.QUESTION;
    }
    
    if (content.includes('because') || content.includes('therefore')) {
      return NodeType.INSIGHT;
    }
    
    if (content.match(/\d{4}-\d{2}-\d{2}/) || content.includes('happened') || content.includes('occurred')) {
      return NodeType.EVENT;
    }
    
    if (content.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) {
      return NodeType.ENTITY;
    }
    
    if (content.length > 200) {
      return NodeType.DOCUMENT;
    }
    
    if (content.includes(' is ') || content.includes(' are ')) {
      return NodeType.FACT;
    }
    
    return NodeType.CONCEPT;
  }

  /**
   * Get node-specific properties
   */
  private getNodeSpecificProps(
    type: NodeType, 
    content: string, 
    metadata?: Record<string, any>
  ): Record<string, any> {
    switch (type) {
      case NodeType.CONCEPT:
        return {
          name: metadata?.name ?? content.substring(0, 50),
          description: content,
          synonyms: metadata?.synonyms ?? [],
          category: metadata?.category,
          tags: metadata?.tags ?? [],
        };
        
      case NodeType.FACT:
        return {
          statement: content,
          source: metadata?.source,
          evidence: metadata?.evidence ?? [],
          verified: metadata?.verified ?? false,
        };
        
      case NodeType.EVENT:
        return {
          name: metadata?.name ?? content.substring(0, 50),
          description: content,
          timestamp: metadata?.timestamp ?? new Date().toISOString(),
          duration: metadata?.duration,
          participants: metadata?.participants ?? [],
          location: metadata?.location,
          outcome: metadata?.outcome,
        };
        
      case NodeType.ENTITY:
        return {
          name: metadata?.name ?? content,
          entity_type: metadata?.entity_type ?? 'object',
          attributes: metadata?.attributes ?? {},
          aliases: metadata?.aliases ?? [],
        };
        
      case NodeType.DOCUMENT:
        return {
          title: metadata?.title ?? content.substring(0, 50),
          content: content,
          path: metadata?.path ?? '',
          author: metadata?.author,
          summary: metadata?.summary,
          keywords: metadata?.keywords ?? [],
          language: metadata?.language ?? 'en',
        };
        
      case NodeType.QUESTION:
        return {
          question: content,
          context: metadata?.context,
          answered: false,
          answer_nodes: [],
          asked_by: metadata?.asked_by,
        };
        
      case NodeType.INSIGHT:
        return {
          insight: content,
          reasoning: metadata?.reasoning ?? '',
          supporting_nodes: metadata?.supporting_nodes ?? [],
          impact: metadata?.impact ?? 'medium',
          actionable: metadata?.actionable ?? false,
        };
        
      case NodeType.MEMORY:
        return {
          memory_type: metadata?.memory_type ?? 'short_term',
          content: content,
          session_id: metadata?.session_id,
          user_id: metadata?.user_id,
          decay_rate: metadata?.decay_rate ?? 0.1,
          reinforcement_count: 0,
        };
        
      default:
        return {};
    }
  }
}