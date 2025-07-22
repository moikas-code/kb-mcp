/**
 * VectorMemory Implementation
 * Handles vector embeddings and semantic search
 */

import { pipeline } from '@xenova/transformers';
// Import not needed - using vector index instead
import { IVectorMemory } from './interfaces.js';
import { FalkorDBConnection } from './connection.js';
import { VectorIndex } from './vector-index.js';
import {
  Node, SearchOptions, GraphQueryResult, NodeType
} from './types.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export class VectorMemory implements IVectorMemory {
  private connection: FalkorDBConnection;
  private embeddingModel: any | null = null;
  private modelName: string = 'Xenova/all-MiniLM-L6-v2';
  private vectorDimension: number = 384;
  private initPromise: Promise<void> | null = null;
  private vectorIndex: VectorIndex;

  constructor(connection: FalkorDBConnection, modelName?: string) {
    this.connection = connection;
    if (modelName) {
      this.modelName = modelName;
    }
    
    // Initialize vector index
    this.vectorIndex = new VectorIndex({
      dimension: this.vectorDimension,
      indexType: 'hnsw',
      metric: 'cosine',
      m: 16,
      efConstruction: 200,
      efSearch: 50,
    });
  }

  /**
   * Initialize the vector memory system
   */
  async initialize(): Promise<Result<void>> {
    try {
      await this.initializeModel();
      
      // Initialize vector index
      const indexResult = await this.vectorIndex.initialize();
      if (!indexResult.success) {
        return {
          success: false,
          error: toKBError(indexResult.error, { operation: 'initialize' }),
        };
      }
      
      // Load existing vectors into the index
      await this.loadExistingVectors();
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'initialize' }),
      };
    }
  }

  /**
   * Initialize the embedding model
   */
  private async initializeModel(): Promise<void> {
    if (this.embeddingModel) return;
    
    if (!this.initPromise) {
      this.initPromise = this.loadModel();
    }
    
    await this.initPromise;
  }

  /**
   * Load the embedding model
   */
  private async loadModel(): Promise<void> {
    try {
      this.embeddingModel = await pipeline(
        'feature-extraction',
        this.modelName
      );
      
      // Update vector dimension based on model
      if (this.modelName.includes('MiniLM')) {
        this.vectorDimension = 384;
      } else if (this.modelName.includes('mpnet')) {
        this.vectorDimension = 768;
      }
    } catch (error) {
      throw new Error(`Failed to load embedding model: ${error}`);
    }
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    await this.initializeModel();
    
    if (!this.embeddingModel) {
      throw new Error('Embedding model not initialized');
    }

    const output = await this.embeddingModel(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to regular array
    return Array.from(output.data);
  }

  /**
   * Load existing vectors from database into the index
   */
  private async loadExistingVectors(): Promise<void> {
    const cypher = `
      MATCH (n)
      WHERE n.embedding IS NOT NULL
      RETURN n.id as id, n.embedding as embedding, n
      LIMIT 10000
    `;

    const result = await this.connection.query(cypher);
    
    if (result.success && result.data && Array.isArray(result.data)) {
      console.log(`Loading ${result.data.length} existing vectors into index`);
      for (const row of result.data) {
        if (row.embedding && Array.isArray(row.embedding) && row.id) {
          await this.vectorIndex.addVector(row.id, row.embedding, row.n);
        }
      }
    } else {
      console.log('No existing vectors found to load');
    }
  }

  /**
   * Store information in memory with embedding
   */
  async store(content: string, metadata?: Record<string, any>): Promise<Result<Node>> {
    try {
      // Generate embedding
      const embedding = await this.generateEmbedding(content);
      
      // Store in graph with embedding
      const cypher = `
        CREATE (n:VectorNode {
          id: randomUUID(),
          type: $type,
          content: $content,
          embedding: $embedding,
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
        type: metadata?.type ?? NodeType.MEMORY,
        content,
        embedding,
        importance: metadata?.importance ?? 0.5,
        confidence: metadata?.confidence ?? 1.0,
        metadata: metadata ?? {},
      };

      const result = await this.connection.query(cypher, params);
      
      if (!result.success) {
        return result;
      }

      const node = result.data[0].n;
      
      // Add to vector index for efficient search
      await this.vectorIndex.addVector(node.id, embedding, node);

      return {
        success: true,
        data: node,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'store' }),
      };
    }
  }

  /**
   * Retrieve information using semantic search
   */
  async retrieve(query: string, options?: SearchOptions): Promise<Result<GraphQueryResult>> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Perform semantic search
      const searchResult = await this.semanticSearch(
        queryEmbedding,
        options?.limit,
        options?.semantic_threshold
      );
      
      if (!searchResult.success) {
        return searchResult;
      }

      // Format as GraphQueryResult
      const nodes = searchResult.data.map(item => item.node);
      
      return {
        success: true,
        data: {
          nodes,
          edges: [],
          metadata: {
            query_time_ms: 0,
            total_nodes: nodes.length,
            total_edges: 0,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'retrieve' }),
      };
    }
  }

  /**
   * Update existing memory
   */
  async update(nodeId: string, updates: Partial<Node>): Promise<Result<Node>> {
    // If content is updated, regenerate embedding
    if ('description' in updates && updates.description && typeof updates.description === 'string') {
      const embedding = await this.generateEmbedding(updates.description);
      updates.embedding = embedding;
    } else if ('content' in updates && updates.content && typeof updates.content === 'string') {
      const embedding = await this.generateEmbedding(updates.content);
      updates.embedding = embedding;
    }

    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map(key => `n.${key} = $${key}`)
      .join(', ');

    const cypher = `
      MATCH (n:VectorNode {id: $nodeId})
      SET ${setClause}, n.updated_at = datetime()
      RETURN n
    `;

    const params = {
      nodeId,
      ...updates,
    };

    const result = await this.connection.query(cypher, params);
    
    if (!result.success) {
      return {
        success: false,
        error: toKBError(result.error, { operation: 'update' }),
      };
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: toKBError('Node not found', { operation: 'update' }),
      };
    }

    const node = result.data[0].n;
    
    // Update vector index if embedding was changed
    if (updates.embedding) {
      await this.vectorIndex.removeVector(nodeId);
      await this.vectorIndex.addVector(nodeId, updates.embedding, node);
    }

    return {
      success: true,
      data: node,
    };
  }

  /**
   * Forget (remove) information
   */
  async forget(nodeId: string): Promise<Result<void>> {
    const cypher = `
      MATCH (n:VectorNode {id: $nodeId})
      DETACH DELETE n
    `;

    const result = await this.connection.query(cypher, { nodeId });
    
    if (!result.success) {
      return {
        success: false,
        error: toKBError(result.error, { operation: 'forget' }),
      };
    }

    // Remove from vector index
    await this.vectorIndex.removeVector(nodeId);

    return { success: true, data: undefined };
  }

  /**
   * Reinforce memory
   */
  async reinforce(nodeId: string, amount: number = 0.1): Promise<Result<Node>> {
    const cypher = `
      MATCH (n:VectorNode {id: $nodeId})
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
      return {
        success: false,
        error: toKBError(result.error, { operation: 'reinforce' }),
      };
    }

    if (!result.data?.[0]) {
      return {
        success: false,
        error: toKBError('Node not found', { operation: 'reinforce' }),
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
      MATCH (n:VectorNode)
      RETURN count(n) as total_vectors,
             avg(n.importance) as avg_importance,
             avg(n.confidence) as avg_confidence,
             avg(n.access_count) as avg_access_count
    `;

    const result = await this.connection.query(cypher);
    
    if (!result.success) {
      return {
        success: false,
        error: toKBError(result.error, { operation: 'getStats' }),
      };
    }

    return {
      success: true,
      data: {
        ...result.data[0],
        model_name: this.modelName,
        vector_dimension: this.vectorDimension,
      },
    };
  }

  /**
   * Store embedding for existing node
   */
  async storeEmbedding(
    nodeId: string,
    embedding: number[],
    metadata?: Record<string, any>
  ): Promise<Result<void>> {
    try {
      // Generate embedding if empty array provided
      let finalEmbedding = embedding;
      if (embedding.length === 0 && metadata?.content) {
        try {
          finalEmbedding = await this.generateEmbedding(metadata.content);
        } catch (error) {
          console.warn('Failed to generate embedding:', error);
          // Store without embedding rather than failing
          finalEmbedding = [];
        }
      }

      const cypher = `
        MATCH (n {id: $nodeId})
        SET n.embedding = $embedding,
            n.embedding_model = $model,
            n.embedding_updated = datetime()
        ${metadata ? ', n += $metadata' : ''}
        RETURN n
      `;

      const params = {
        nodeId,
        embedding: finalEmbedding,
        model: this.modelName,
        metadata,
      };

      const result = await this.connection.query(cypher, params);
      
      if (!result.success) {
        return {
          success: false,
          error: toKBError(result.error, { operation: 'storeEmbedding' }),
        };
      }

      if (!result.data?.[0]) {
        return {
          success: false,
          error: toKBError('Node not found', { operation: 'storeEmbedding' }),
        };
      }

      const node = result.data[0].n;

      // Add to vector index if embedding was generated
      if (finalEmbedding.length > 0) {
        await this.vectorIndex.addVector(nodeId, finalEmbedding, node);
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'storeEmbedding' }),
      };
    }
  }

  /**
   * Semantic search using optimized vector index
   */
  async semanticSearch(
    query: string | number[],
    limit: number = 10,
    threshold: number = 0.5
  ): Promise<Result<Array<{ node: Node; similarity: number }>>> {
    try {
      // Get query embedding
      const queryEmbedding = typeof query === 'string' 
        ? await this.generateEmbedding(query)
        : query;

      // Use vector index for efficient similarity search
      const searchResult = await this.vectorIndex.search(queryEmbedding, limit, threshold);
      
      if (!searchResult.success) {
        return searchResult;
      }

      return {
        success: true,
        data: searchResult.data,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'semanticSearch' }),
      };
    }
  }

  /**
   * Find similar nodes
   */
  async findSimilar(
    nodeId: string,
    limit: number = 10,
    threshold: number = 0.5
  ): Promise<Result<Array<{ node: Node; similarity: number }>>> {
    // Get the node's embedding
    const cypher = `
      MATCH (n {id: $nodeId})
      RETURN n.embedding as embedding
    `;

    const result = await this.connection.query(cypher, { nodeId });
    
    if (!result.success) {
      return result;
    }

    if (!result.data?.[0] || !result.data[0].embedding) {
      return {
        success: false,
        error: toKBError(new Error('Node not found or has no embedding'), { operation: 'VectorMemory.findSimilar' }),
      };
    }

    // Search using the node's embedding
    return this.semanticSearch(result.data[0].embedding, limit + 1, threshold)
      .then(res => {
        if (res.success) {
          // Filter out the source node
          res.data = res.data.filter(item => item.node.id !== nodeId).slice(0, limit);
        }
        return res;
      });
  }

  /**
   * Update embedding model
   */
  async updateEmbeddingModel(modelName: string): Promise<Result<void>> {
    try {
      this.modelName = modelName;
      this.embeddingModel = null;
      this.initPromise = null;
      
      await this.initialize();
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'updateEmbeddingModel' }),
      };
    }
  }

  /**
   * Recompute all embeddings
   */
  async recomputeEmbeddings(): Promise<Result<void>> {
    try {
      await this.initialize();
      
      // Get all nodes with content
      const cypher = `
        MATCH (n)
        WHERE n.content IS NOT NULL
        RETURN n
      `;

      const result = await this.connection.query(cypher);
      
      if (!result.success) {
        return result;
      }

      // Update embeddings in batches
      const batchSize = 10;
      const nodes = result.data;
      
      for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (row: any) => {
            const node = row.n;
            if (node.content) {
              const embedding = await this.generateEmbedding(node.content);
              await this.storeEmbedding(node.id, embedding);
            }
          })
        );
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'recomputeEmbeddings' }),
      };
    }
  }
}