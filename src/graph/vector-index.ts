/**
 * Vector Index Service
 * Efficient similarity search using FAISS or in-memory indexing
 */

import { Result } from '../types/index.js';
import { Node } from './types.js';
import { cosine } from 'ml-distance';
import { toKBError } from '../types/error-utils.js';

interface VectorIndexConfig {
  dimension: number;
  indexType: 'flat' | 'hnsw' | 'ivf';
  metric: 'cosine' | 'euclidean' | 'inner_product';
  nlist?: number; // For IVF
  m?: number; // For HNSW
  efConstruction?: number; // For HNSW
  efSearch?: number; // For HNSW
}

interface IndexedVector {
  id: string;
  embedding: number[];
  node: Node;
}

/**
 * High-performance vector index for similarity search
 */
export class VectorIndex {
  private vectors: IndexedVector[] = [];
  private config: VectorIndexConfig;
  private faissIndex: any = null;
  private initialized = false;

  constructor(config: VectorIndexConfig) {
    this.config = config;
  }

  /**
   * Initialize the vector index
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Try to use FAISS for high-performance vector search
      try {
        const faiss = await import('faiss-node');
        this.faissIndex = new faiss.IndexFlatIP(this.config.dimension);
        console.log('Using FAISS for vector indexing');
      } catch (error) {
        console.log('FAISS not available, using in-memory indexing');
        this.faissIndex = null;
      }
      
      this.initialized = true;
      
      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Failed to initialize vector index: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'initialize' }),
      };
    }
  }

  /**
   * Add vector to the index
   */
  async addVector(id: string, embedding: number[], node: Node): Promise<Result<void>> {
    if (!this.initialized) {
      return {
        success: false,
        error: toKBError(new Error('Vector index not initialized'), { operation: 'addVector' }),
      };
    }

    try {
      // Normalize embedding if using cosine similarity
      const normalizedEmbedding = this.config.metric === 'cosine' 
        ? this.normalize(embedding)
        : embedding;

      const indexedVector: IndexedVector = {
        id,
        embedding: normalizedEmbedding,
        node,
      };

      // Add to FAISS index if available
      if (this.faissIndex) {
        this.faissIndex.add(Float32Array.from(normalizedEmbedding));
      }

      // Add to in-memory storage
      this.vectors.push(indexedVector);

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Failed to add vector: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'addVector' }),
      };
    }
  }

  /**
   * Remove vector from the index
   */
  async removeVector(id: string): Promise<Result<void>> {
    if (!this.initialized) {
      return {
        success: false,
        error: toKBError(new Error('Vector index not initialized'), { operation: 'removeVector' }),
      };
    }

    try {
      // Remove from in-memory storage
      const index = this.vectors.findIndex(v => v.id === id);
      if (index === -1) {
        return {
          success: false,
          error: toKBError(new Error('Vector not found in index'), { operation: 'removeVector' }),
        };
      }

      this.vectors.splice(index, 1);

      // Note: FAISS doesn't support direct removal, would need to rebuild index
      // For now, we'll mark as deleted and rebuild periodically

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Failed to remove vector: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'removeVector' }),
      };
    }
  }

  /**
   * Search for similar vectors
   */
  async search(
    queryEmbedding: number[],
    limit: number = 10,
    threshold: number = 0.5
  ): Promise<Result<Array<{ node: Node; similarity: number }>>> {
    if (!this.initialized) {
      return {
        success: false,
        error: toKBError(new Error('Vector index not initialized'), { operation: 'search' }),
      };
    }

    try {
      // Normalize query embedding if using cosine similarity
      const normalizedQuery = this.config.metric === 'cosine' 
        ? this.normalize(queryEmbedding)
        : queryEmbedding;

      let results: Array<{ node: Node; similarity: number }> = [];

      if (this.faissIndex && this.vectors.length > 100) {
        // Use FAISS for large datasets
        results = await this.searchWithFaiss(normalizedQuery, limit, threshold);
      } else {
        // Use in-memory search for smaller datasets
        results = await this.searchInMemory(normalizedQuery, limit, threshold);
      }

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'search' }),
      };
    }
  }

  /**
   * Search using FAISS index
   */
  private async searchWithFaiss(
    queryEmbedding: number[],
    limit: number,
    threshold: number
  ): Promise<Array<{ node: Node; similarity: number }>> {
    if (!this.faissIndex) {
      throw new Error('FAISS index not available');
    }

    const { distances, labels } = this.faissIndex.search(
      Float32Array.from(queryEmbedding),
      Math.min(limit * 2, this.vectors.length)
    );

    const results: Array<{ node: Node; similarity: number }> = [];

    for (let i = 0; i < labels.length; i++) {
      const vectorIndex = labels[i];
      const distance = distances[i];
      
      if (vectorIndex >= 0 && vectorIndex < this.vectors.length) {
        const similarity = this.config.metric === 'cosine' 
          ? distance // FAISS returns similarity for inner product
          : 1 - distance; // Convert distance to similarity

        if (similarity >= threshold) {
          results.push({
            node: this.vectors[vectorIndex].node,
            similarity,
          });
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Search using in-memory computation
   */
  private async searchInMemory(
    queryEmbedding: number[],
    limit: number,
    threshold: number
  ): Promise<Array<{ node: Node; similarity: number }>> {
    const results: Array<{ node: Node; similarity: number }> = [];

    // Compute similarities in batches to avoid blocking
    const batchSize = 100;
    for (let i = 0; i < this.vectors.length; i += batchSize) {
      const batch = this.vectors.slice(i, i + batchSize);
      
      for (const vector of batch) {
        const similarity = this.config.metric === 'cosine'
          ? 1 - cosine(queryEmbedding, vector.embedding)
          : this.computeEuclideanSimilarity(queryEmbedding, vector.embedding);

        if (similarity >= threshold) {
          results.push({
            node: vector.node,
            similarity,
          });
        }
      }

      // Yield to event loop between batches
      if (i + batchSize < this.vectors.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Sort by similarity and limit
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Normalize vector for cosine similarity
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  /**
   * Compute Euclidean similarity
   */
  private computeEuclideanSimilarity(a: number[], b: number[]): number {
    const distance = Math.sqrt(
      a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
    );
    return 1 / (1 + distance);
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{
    total_vectors: number;
    dimension: number;
    index_type: string;
    memory_usage: number;
  }> {
    const memoryUsage = this.vectors.length * this.config.dimension * 8; // 8 bytes per float

    return {
      total_vectors: this.vectors.length,
      dimension: this.config.dimension,
      index_type: this.faissIndex ? 'faiss' : 'in-memory',
      memory_usage: memoryUsage,
    };
  }

  /**
   * Clear the index
   */
  async clear(): Promise<void> {
    this.vectors = [];
    if (this.faissIndex) {
      this.faissIndex.reset();
    }
  }

  /**
   * Rebuild the index for optimal performance
   */
  async rebuild(): Promise<Result<void>> {
    if (!this.initialized) {
      return {
        success: false,
        error: toKBError(new Error('Vector index not initialized'), { operation: 'rebuild' }),
      };
    }

    try {
      if (this.faissIndex) {
        // Rebuild FAISS index
        this.faissIndex.reset();
        
        const embeddings = this.vectors.map(v => Float32Array.from(v.embedding));
        if (embeddings.length > 0) {
          this.faissIndex.add(embeddings);
        }
      }

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'rebuild' }),
      };
    }
  }
}