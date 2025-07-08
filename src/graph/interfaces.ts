/**
 * Core Memory Interfaces
 * Abstract interfaces for different memory systems
 */

import { Node, Edge, NodeType, EdgeType, MemoryType, SearchOptions, GraphQueryResult } from './types.js';
import { Result } from '../types/index.js';

/**
 * Base memory interface
 */
export interface IMemory {
  /**
   * Store information in memory
   */
  store(content: string, metadata?: Record<string, any>): Promise<Result<Node>>;
  
  /**
   * Retrieve information from memory
   */
  retrieve(query: string, options?: SearchOptions): Promise<Result<GraphQueryResult>>;
  
  /**
   * Update existing memory
   */
  update(nodeId: string, updates: Partial<Node>): Promise<Result<Node>>;
  
  /**
   * Forget (remove) information
   */
  forget(nodeId: string): Promise<Result<void>>;
  
  /**
   * Reinforce memory (increase importance)
   */
  reinforce(nodeId: string, amount?: number): Promise<Result<Node>>;
  
  /**
   * Get memory statistics
   */
  getStats(): Promise<Result<Record<string, any>>>;
}

/**
 * Graph-based memory operations
 */
export interface IGraphMemory extends IMemory {
  /**
   * Create a node in the graph
   */
  createNode(node: Omit<Node, 'id'>): Promise<Result<Node>>;
  
  /**
   * Create an edge between nodes
   */
  createEdge(
    sourceId: string, 
    targetId: string, 
    edgeType: EdgeType, 
    properties?: Partial<Edge>
  ): Promise<Result<Edge>>;
  
  /**
   * Find nodes by type
   */
  findNodesByType(type: NodeType, limit?: number): Promise<Result<Node[]>>;
  
  /**
   * Find related nodes
   */
  findRelated(nodeId: string, maxDepth?: number): Promise<Result<GraphQueryResult>>;
  
  /**
   * Find path between nodes
   */
  findPath(startId: string, endId: string): Promise<Result<GraphQueryResult>>;
  
  /**
   * Execute custom Cypher query
   */
  query(cypher: string, params?: Record<string, any>): Promise<Result<any>>;
  
  /**
   * Batch operations
   */
  batch(operations: Array<() => Promise<any>>): Promise<Result<any[]>>;
}

/**
 * Vector-based memory operations
 */
export interface IVectorMemory extends IMemory {
  /**
   * Store embedding
   */
  storeEmbedding(
    nodeId: string, 
    embedding: number[], 
    metadata?: Record<string, any>
  ): Promise<Result<void>>;
  
  /**
   * Semantic search
   */
  semanticSearch(
    query: string | number[], 
    limit?: number, 
    threshold?: number
  ): Promise<Result<Array<{node: Node; similarity: number}>>>;
  
  /**
   * Find similar nodes
   */
  findSimilar(
    nodeId: string, 
    limit?: number, 
    threshold?: number
  ): Promise<Result<Array<{node: Node; similarity: number}>>>;
  
  /**
   * Update embedding model
   */
  updateEmbeddingModel(modelName: string): Promise<Result<void>>;
  
  /**
   * Recompute all embeddings
   */
  recomputeEmbeddings(): Promise<Result<void>>;
}

/**
 * Temporal memory operations
 */
export interface ITemporalMemory extends IMemory {
  /**
   * Store with temporal context
   */
  storeWithTime(
    content: string, 
    timestamp: Date, 
    duration?: number
  ): Promise<Result<Node>>;
  
  /**
   * Retrieve memories from time range
   */
  retrieveByTimeRange(
    start: Date, 
    end: Date, 
    options?: SearchOptions
  ): Promise<Result<GraphQueryResult>>;
  
  /**
   * Find temporal sequences
   */
  findSequence(
    startNodeId: string, 
    direction: 'forward' | 'backward'
  ): Promise<Result<Node[]>>;
  
  /**
   * Create temporal chain
   */
  createTemporalChain(nodeIds: string[]): Promise<Result<Edge[]>>;
  
  /**
   * Decay old memories
   */
  decayMemories(thresholdDate: Date): Promise<Result<number>>;
}

/**
 * Working memory for active context
 */
export interface IWorkingMemory extends IMemory {
  /**
   * Add to working memory
   */
  add(content: string, priority?: number): Promise<Result<Node>>;
  
  /**
   * Get current context
   */
  getContext(limit?: number): Promise<Result<Node[]>>;
  
  /**
   * Clear working memory
   */
  clear(): Promise<Result<void>>;
  
  /**
   * Promote to long-term memory
   */
  promote(nodeId: string): Promise<Result<Node>>;
  
  /**
   * Get attention weights
   */
  getAttention(): Promise<Result<Record<string, number>>>;
  
  /**
   * Focus on specific nodes
   */
  focus(nodeIds: string[]): Promise<Result<void>>;
}

/**
 * Unified memory system combining all memory types
 */
export interface IUnifiedMemory {
  graph: IGraphMemory;
  vector: IVectorMemory;
  temporal: ITemporalMemory;
  working: IWorkingMemory;
  
  /**
   * Store information across all memory systems
   */
  store(
    content: string, 
    options?: {
      type?: NodeType;
      memoryType?: MemoryType;
      metadata?: Record<string, any>;
      embedding?: number[];
      timestamp?: Date;
    }
  ): Promise<Result<Node>>;
  
  /**
   * Hybrid search across all memory systems
   */
  search(
    query: string, 
    options?: SearchOptions & {
      useVector?: boolean;
      useGraph?: boolean;
      useTemporal?: boolean;
    }
  ): Promise<Result<GraphQueryResult>>;
  
  /**
   * Consolidate memories
   */
  consolidate(): Promise<Result<void>>;
  
  /**
   * Detect and resolve contradictions
   */
  resolveContradictions(): Promise<Result<Array<{node1: Node; node2: Node; resolution?: string}>>>;
  
  /**
   * Generate insights from memories
   */
  generateInsights(): Promise<Result<Node[]>>;
  
  /**
   * Export memory snapshot
   */
  export(format: 'json' | 'cypher' | 'graphml'): Promise<Result<string>>;
  
  /**
   * Import memory snapshot
   */
  import(data: string, format: 'json' | 'cypher' | 'graphml'): Promise<Result<void>>;
  
  /**
   * Get unified statistics
   */
  getStats(): Promise<Result<{
    graph: Record<string, any>;
    vector: Record<string, any>;
    temporal: Record<string, any>;
    working: Record<string, any>;
    overall: Record<string, any>;
  }>>;
}

/**
 * Memory event types
 */
export interface MemoryEvents {
  'node:created': (node: Node) => void;
  'node:updated': (node: Node) => void;
  'node:deleted': (nodeId: string) => void;
  'edge:created': (edge: Edge) => void;
  'edge:deleted': (edgeId: string) => void;
  'memory:consolidated': (nodes: Node[]) => void;
  'memory:decayed': (nodes: Node[]) => void;
  'contradiction:detected': (node1: Node, node2: Node) => void;
  'insight:generated': (insight: Node) => void;
}

/**
 * Memory lifecycle hooks
 */
export interface IMemoryLifecycle {
  /**
   * Called before storing
   */
  beforeStore?(content: string, metadata?: Record<string, any>): Promise<void>;
  
  /**
   * Called after storing
   */
  afterStore?(node: Node): Promise<void>;
  
  /**
   * Called before retrieval
   */
  beforeRetrieve?(query: string, options?: SearchOptions): Promise<void>;
  
  /**
   * Called after retrieval
   */
  afterRetrieve?(result: GraphQueryResult): Promise<void>;
  
  /**
   * Called during consolidation
   */
  onConsolidate?(nodes: Node[]): Promise<Node[]>;
  
  /**
   * Called when contradiction detected
   */
  onContradiction?(node1: Node, node2: Node): Promise<void>;
}