/**
 * WorkingMemory Implementation
 * Manages active context and short-term memory
 */

import { v4 as uuidv4 } from 'uuid';
import { IWorkingMemory } from './interfaces.js';
import { FalkorDBConnection } from './connection.js';
import {
  Node, MemoryType, NodeType, SearchOptions, GraphQueryResult
} from './types.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export class WorkingMemory implements IWorkingMemory {
  private connection: FalkorDBConnection;
  private sessionId: string;
  private maxItems: number = 20;
  private focusedNodeIds: Set<string> = new Set();

  constructor(connection: FalkorDBConnection, sessionId?: string) {
    this.connection = connection;
    this.sessionId = sessionId || uuidv4();
  }

  /**
   * Store information in working memory
   */
  async store(content: string, metadata?: Record<string, any>): Promise<Result<Node>> {
    return this.add(content, metadata?.priority);
  }

  /**
   * Add to working memory
   */
  async add(content: string, priority: number = 0.5): Promise<Result<Node>> {
    // Check if we need to evict old items
    await this.evictIfNeeded();

    const cypher = `
      CREATE (n:WorkingMemory {
        id: $id,
        type: $type,
        memory_type: $memory_type,
        content: $content,
        session_id: $session_id,
        priority: $priority,
        created_at: datetime(),
        updated_at: datetime(),
        accessed_at: datetime(),
        access_count: 0,
        importance: $priority,
        confidence: 1.0,
        focused: false,
        metadata: {}
      })
      RETURN n
    `;

    const params = {
      id: uuidv4(),
      type: NodeType.MEMORY,
      memory_type: MemoryType.WORKING,
      content,
      session_id: this.sessionId,
      priority,
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
   * Get current context
   */
  async getContext(limit?: number): Promise<Result<Node[]>> {
    const cypher = `
      MATCH (n:WorkingMemory {session_id: $session_id})
      WITH n
      ORDER BY n.focused DESC, n.priority DESC, n.accessed_at DESC
      LIMIT $limit
      RETURN n
    `;

    const result = await this.connection.query(cypher, {
      session_id: this.sessionId,
      limit: limit || this.maxItems,
    });
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.map((row: any) => row.n),
    };
  }

  /**
   * Clear working memory
   */
  async clear(): Promise<Result<void>> {
    const cypher = `
      MATCH (n:WorkingMemory {session_id: $session_id})
      DETACH DELETE n
    `;

    const result = await this.connection.query(cypher, {
      session_id: this.sessionId,
    });
    
    if (!result.success) {
      return result;
    }

    this.focusedNodeIds.clear();
    
    return { success: true, data: undefined };
  }

  /**
   * Promote to long-term memory
   */
  async promote(nodeId: string): Promise<Result<Node>> {
    const cypher = `
      MATCH (n:WorkingMemory {id: $nodeId, session_id: $session_id})
      SET n.memory_type = $new_type,
          n:LongTermMemory,
          n.promoted_at = datetime(),
          n.importance = n.importance * 1.5
      REMOVE n:WorkingMemory
      RETURN n
    `;

    const result = await this.connection.query(cypher, {
      nodeId,
      session_id: this.sessionId,
      new_type: MemoryType.LONG_TERM,
    });
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: toKBError('Node not found in working memory', { operation: 'promote' }),
      };
    }

    // Remove from focused set if promoted
    this.focusedNodeIds.delete(nodeId);

    return {
      success: true,
      data: result.data[0].n,
    };
  }

  /**
   * Get attention weights
   */
  async getAttention(): Promise<Result<Record<string, number>>> {
    const cypher = `
      MATCH (n:WorkingMemory {session_id: $session_id})
      RETURN n.id as id, 
             n.priority * n.importance * 
             (CASE WHEN n.focused THEN 2.0 ELSE 1.0 END) as attention
      ORDER BY attention DESC
    `;

    const result = await this.connection.query(cypher, {
      session_id: this.sessionId,
    });
    
    if (!result.success) {
      return result;
    }

    const attention: Record<string, number> = {};
    let totalAttention = 0;

    // Calculate total attention
    for (const row of result.data) {
      totalAttention += row.attention;
    }

    // Normalize attention weights
    for (const row of result.data) {
      attention[row.id] = row.attention / totalAttention;
    }

    return {
      success: true,
      data: attention,
    };
  }

  /**
   * Focus on specific nodes
   */
  async focus(nodeIds: string[]): Promise<Result<void>> {
    // First, unfocus all nodes
    const unfocusCypher = `
      MATCH (n:WorkingMemory {session_id: $session_id})
      SET n.focused = false
    `;

    await this.connection.query(unfocusCypher, {
      session_id: this.sessionId,
    });

    // Then focus on specified nodes
    if (nodeIds.length > 0) {
      const focusCypher = `
        MATCH (n:WorkingMemory {session_id: $session_id})
        WHERE n.id IN $nodeIds
        SET n.focused = true,
            n.priority = CASE 
              WHEN n.priority < 0.8 THEN n.priority + 0.2 
              ELSE 1.0 
            END
      `;

      const result = await this.connection.query(focusCypher, {
        session_id: this.sessionId,
        nodeIds,
      });
      
      if (!result.success) {
        return result;
      }
    }

    // Update focused set
    this.focusedNodeIds = new Set(nodeIds);

    return { success: true, data: undefined };
  }

  /**
   * Retrieve information
   */
  async retrieve(query: string, options?: SearchOptions): Promise<Result<GraphQueryResult>> {
    const cypher = `
      MATCH (n:WorkingMemory {session_id: $session_id})
      WHERE n.content CONTAINS $query
      WITH n
      ORDER BY n.focused DESC, n.priority DESC, n.accessed_at DESC
      LIMIT $limit
      SET n.accessed_at = datetime(),
          n.access_count = n.access_count + 1
      RETURN collect(n) as nodes
    `;

    const params = {
      session_id: this.sessionId,
      query,
      limit: options?.limit ?? 10,
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: {
        nodes: result.data[0].nodes,
        edges: [],
        metadata: {
          query_time_ms: 0,
          total_nodes: result.data[0].nodes.length,
          total_edges: 0,
        },
      },
    };
  }

  /**
   * Update existing memory
   */
  async update(nodeId: string, updates: Partial<Node>): Promise<Result<Node>> {
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'session_id')
      .map(key => `n.${key} = $${key}`)
      .join(', ');

    const cypher = `
      MATCH (n:WorkingMemory {id: $nodeId, session_id: $session_id})
      SET ${setClause}, n.updated_at = datetime()
      RETURN n
    `;

    const params = {
      nodeId,
      session_id: this.sessionId,
      ...updates,
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: toKBError('Node not found in working memory', { operation: 'update' }),
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
      MATCH (n:WorkingMemory {id: $nodeId, session_id: $session_id})
      DETACH DELETE n
    `;

    const result = await this.connection.query(cypher, {
      nodeId,
      session_id: this.sessionId,
    });
    
    if (!result.success) {
      return result;
    }

    this.focusedNodeIds.delete(nodeId);

    return { success: true, data: undefined };
  }

  /**
   * Reinforce memory
   */
  async reinforce(nodeId: string, amount: number = 0.1): Promise<Result<Node>> {
    const cypher = `
      MATCH (n:WorkingMemory {id: $nodeId, session_id: $session_id})
      SET n.importance = CASE 
        WHEN n.importance + $amount > 1.0 THEN 1.0
        ELSE n.importance + $amount
      END,
      n.priority = CASE 
        WHEN n.priority + $amount > 1.0 THEN 1.0
        ELSE n.priority + $amount
      END,
      n.accessed_at = datetime(),
      n.access_count = n.access_count + 1
      RETURN n
    `;

    const result = await this.connection.query(cypher, { 
      nodeId, 
      session_id: this.sessionId, 
      amount 
    });
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: toKBError('Node not found in working memory', { operation: 'reinforce' }),
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
      MATCH (n:WorkingMemory {session_id: $session_id})
      WITH count(n) as total_items,
           count(CASE WHEN n.focused THEN 1 END) as focused_items,
           avg(n.priority) as avg_priority,
           avg(n.importance) as avg_importance,
           avg(n.access_count) as avg_access_count,
           max(n.accessed_at) as last_access
      RETURN {
        session_id: $session_id,
        total_items: total_items,
        focused_items: focused_items,
        capacity_used: toFloat(total_items) / $max_items,
        avg_priority: avg_priority,
        avg_importance: avg_importance,
        avg_access_count: avg_access_count,
        last_access: last_access
      } as stats
    `;

    const result = await this.connection.query(cypher, {
      session_id: this.sessionId,
      max_items: this.maxItems,
    });
    
    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data[0].stats,
    };
  }

  /**
   * Evict old items if needed
   */
  private async evictIfNeeded(): Promise<void> {
    const countResult = await this.connection.query(
      'MATCH (n:WorkingMemory {session_id: $session_id}) RETURN count(n) as count',
      { session_id: this.sessionId }
    );

    if (!countResult.success || !countResult.data?.[0]) {
      return;
    }

    const currentCount = countResult.data[0].count;
    
    if (currentCount >= this.maxItems) {
      // Evict least important, unfocused, least recently accessed items
      const evictCypher = `
        MATCH (n:WorkingMemory {session_id: $session_id})
        WHERE n.focused = false
        WITH n
        ORDER BY n.importance ASC, n.priority ASC, n.accessed_at ASC
        LIMIT $to_evict
        DETACH DELETE n
      `;

      await this.connection.query(evictCypher, {
        session_id: this.sessionId,
        to_evict: Math.ceil(this.maxItems * 0.2), // Evict 20%
      });
    }
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.focusedNodeIds.clear();
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}