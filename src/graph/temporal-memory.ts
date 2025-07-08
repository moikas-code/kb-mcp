/**
 * TemporalMemory Implementation
 * Handles time-based memory operations
 */

import { v4 as uuidv4 } from 'uuid';
import { ITemporalMemory } from './interfaces.js';
import { FalkorDBConnection } from './connection.js';
import {
  Node, Edge, EdgeType, NodeType, SearchOptions, GraphQueryResult
} from './types.js';
import { Result } from '@types/index.js';

export class TemporalMemory implements ITemporalMemory {
  private connection: FalkorDBConnection;

  constructor(connection: FalkorDBConnection) {
    this.connection = connection;
  }

  /**
   * Store information in memory
   */
  async store(content: string, metadata?: Record<string, any>): Promise<Result<Node>> {
    return this.storeWithTime(content, new Date(), metadata?.duration);
  }

  /**
   * Store with temporal context
   */
  async storeWithTime(
    content: string,
    timestamp: Date,
    duration?: number
  ): Promise<Result<Node>> {
    const cypher = `
      CREATE (n:TemporalNode {
        id: $id,
        type: $type,
        content: $content,
        timestamp: datetime($timestamp),
        duration: $duration,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $importance,
        confidence: $confidence,
        metadata: $metadata
      })
      RETURN n
    `;

    const params = {
      id: uuidv4(),
      type: NodeType.EVENT,
      content,
      timestamp: timestamp.toISOString(),
      duration,
      importance: 0.5,
      confidence: 1.0,
      metadata: {},
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data[0].n,
    };
  }

  /**
   * Retrieve information from memory
   */
  async retrieve(query: string, options?: SearchOptions): Promise<Result<GraphQueryResult>> {
    const cypher = `
      MATCH (n:TemporalNode)
      WHERE n.content CONTAINS $query
        ${options?.time_range ? 'AND datetime($start) <= n.timestamp <= datetime($end)' : ''}
      WITH n
      ORDER BY n.timestamp DESC
      LIMIT $limit
      OPTIONAL MATCH (n)-[r:TEMPORAL_NEXT|TEMPORAL_PREV]-(related)
      RETURN collect(DISTINCT n) as nodes, 
             collect(DISTINCT r) as edges,
             collect(DISTINCT related) as related_nodes
    `;

    const params = {
      query,
      limit: options?.limit ?? 10,
      start: options?.time_range?.start,
      end: options?.time_range?.end,
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
          query_time_ms: 0,
          total_nodes: nodes.length,
          total_edges: edges.length,
        },
      },
    };
  }

  /**
   * Retrieve memories from time range
   */
  async retrieveByTimeRange(
    start: Date,
    end: Date,
    options?: SearchOptions
  ): Promise<Result<GraphQueryResult>> {
    const cypher = `
      MATCH (n)
      WHERE datetime($start) <= n.timestamp <= datetime($end)
        ${options?.node_types ? 'AND n.type IN $node_types' : ''}
      WITH n
      ORDER BY n.timestamp DESC
      LIMIT $limit
      OPTIONAL MATCH (n)-[r]-(related)
      WHERE datetime($start) <= related.timestamp <= datetime($end)
      RETURN collect(DISTINCT n) as nodes, 
             collect(DISTINCT r) as edges,
             collect(DISTINCT related) as related_nodes
    `;

    const params = {
      start: start.toISOString(),
      end: end.toISOString(),
      limit: options?.limit ?? 100,
      node_types: options?.node_types,
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
          query_time_ms: 0,
          total_nodes: nodes.length,
          total_edges: edges.length,
        },
      },
    };
  }

  /**
   * Find temporal sequences
   */
  async findSequence(
    startNodeId: string,
    direction: 'forward' | 'backward'
  ): Promise<Result<Node[]>> {
    const edgeType = direction === 'forward' ? 'TEMPORAL_NEXT' : 'TEMPORAL_PREV';
    
    const cypher = `
      MATCH path = (start {id: $startNodeId})-[:${edgeType}*]-(end)
      WHERE NOT (end)-[:${edgeType}]->()
      WITH nodes(path) as sequence
      RETURN sequence
    `;

    const result = await this.connection.query(cypher, { startNodeId });
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      // Return just the start node if no sequence found
      const nodeResult = await this.connection.query(
        'MATCH (n {id: $id}) RETURN n',
        { id: startNodeId }
      );
      
      if (nodeResult.success && nodeResult.data?.[0]) {
        return {
          success: true,
          data: [nodeResult.data[0].n],
        };
      }
      
      return {
        success: false,
        error: 'Node not found',
      };
    }

    return {
      success: true,
      data: result.data[0].sequence,
    };
  }

  /**
   * Create temporal chain
   */
  async createTemporalChain(nodeIds: string[]): Promise<Result<Edge[]>> {
    if (nodeIds.length < 2) {
      return {
        success: false,
        error: 'At least 2 nodes required for temporal chain',
      };
    }

    const edges: Edge[] = [];
    
    // Create edges between consecutive nodes
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const cypher = `
        MATCH (a {id: $sourceId})
        MATCH (b {id: $targetId})
        CREATE (a)-[r:TEMPORAL_NEXT {
          id: $id,
          type: $type,
          weight: 1.0,
          created_at: datetime(),
          updated_at: datetime(),
          metadata: {}
        }]->(b)
        CREATE (b)-[r2:TEMPORAL_PREV {
          id: $id2,
          type: 'TEMPORAL_PREV',
          weight: 1.0,
          created_at: datetime(),
          updated_at: datetime(),
          metadata: {}
        }]->(a)
        RETURN r
      `;

      const params = {
        sourceId: nodeIds[i],
        targetId: nodeIds[i + 1],
        id: uuidv4(),
        id2: uuidv4(),
        type: EdgeType.TEMPORAL_NEXT,
      };

      const result = await this.connection.query(cypher, params);
      
      if (!result.success) {
        return result;
      }

      if (result.data?.[0]) {
        edges.push(result.data[0].r);
      }
    }

    return {
      success: true,
      data: edges,
    };
  }

  /**
   * Decay old memories
   */
  async decayMemories(thresholdDate: Date): Promise<Result<number>> {
    const cypher = `
      MATCH (n)
      WHERE n.timestamp < datetime($threshold)
        AND n.importance > 0.1
      WITH n, n.importance * 0.9 as new_importance
      SET n.importance = new_importance,
          n.confidence = n.confidence * 0.95
      RETURN count(n) as decayed_count
    `;

    const result = await this.connection.query(cypher, {
      threshold: thresholdDate.toISOString(),
    });
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data[0].decayed_count,
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
    // Remove from temporal chains first
    const cypher = `
      MATCH (n {id: $nodeId})
      OPTIONAL MATCH (prev)-[:TEMPORAL_NEXT]->(n)-[:TEMPORAL_NEXT]->(next)
      FOREACH (_ IN CASE WHEN prev IS NOT NULL AND next IS NOT NULL THEN [1] ELSE [] END |
        CREATE (prev)-[:TEMPORAL_NEXT]->(next)
        CREATE (next)-[:TEMPORAL_PREV]->(prev)
      )
      WITH n
      DETACH DELETE n
    `;

    const result = await this.connection.query(cypher, { nodeId });
    
    if (!result.success) {
      return result;
    }

    return { success: true, data: undefined };
  }

  /**
   * Reinforce memory
   */
  async reinforce(nodeId: string, amount: number = 0.1): Promise<Result<Node>> {
    const cypher = `
      MATCH (n {id: $nodeId})
      SET n.importance = CASE 
        WHEN n.importance + $amount > 1.0 THEN 1.0
        ELSE n.importance + $amount
      END,
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
    const cypher = `
      MATCH (n:TemporalNode)
      WITH count(n) as total_temporal_nodes,
           min(n.timestamp) as earliest_memory,
           max(n.timestamp) as latest_memory,
           avg(n.duration) as avg_duration
      MATCH ()-[r:TEMPORAL_NEXT|TEMPORAL_PREV]->()
      WITH total_temporal_nodes, earliest_memory, latest_memory, avg_duration,
           count(r) as temporal_edges
      RETURN {
        total_temporal_nodes: total_temporal_nodes,
        temporal_edges: temporal_edges,
        earliest_memory: earliest_memory,
        latest_memory: latest_memory,
        avg_duration: avg_duration,
        memory_span_days: duration.between(earliest_memory, latest_memory).days
      } as stats
    `;

    const result = await this.connection.query(cypher);
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data[0].stats,
    };
  }
}