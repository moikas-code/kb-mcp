/**
 * Graph-based Knowledge Representation Types
 * Defines the schema for nodes, edges, and memory structures
 */

import { z } from 'zod';

/**
 * Base node types in the knowledge graph
 */
export enum NodeType {
  CONCEPT = 'concept',
  FACT = 'fact',
  EVENT = 'event',
  ENTITY = 'entity',
  DOCUMENT = 'document',
  QUESTION = 'question',
  INSIGHT = 'insight',
  MEMORY = 'memory',
}

/**
 * Edge types representing relationships
 */
export enum EdgeType {
  RELATES_TO = 'relates_to',
  DERIVED_FROM = 'derived_from',
  CONTRADICTS = 'contradicts',
  SUPPORTS = 'supports',
  CONTAINS = 'contains',
  REFERENCES = 'references',
  TEMPORAL_NEXT = 'temporal_next',
  TEMPORAL_PREV = 'temporal_prev',
  CAUSED_BY = 'caused_by',
  LEADS_TO = 'leads_to',
  SIMILAR_TO = 'similar_to',
  OPPOSITE_OF = 'opposite_of',
  PART_OF = 'part_of',
  INSTANCE_OF = 'instance_of',
}

/**
 * Memory types for different storage strategies
 */
export enum MemoryType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
  WORKING = 'working',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
}

/**
 * Base properties for all nodes
 */
export const BaseNodeSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NodeType),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  accessed_at: z.string().datetime(),
  access_count: z.number().default(0),
  importance: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(1.0),
  embedding: z.array(z.number()).optional(),
  metadata: z.record(z.any()).default({}),
});

/**
 * Concept node - represents abstract ideas or categories
 */
export const ConceptNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.CONCEPT),
  name: z.string(),
  description: z.string(),
  synonyms: z.array(z.string()).default([]),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

/**
 * Fact node - represents concrete information
 */
export const FactNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.FACT),
  statement: z.string(),
  source: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  verified: z.boolean().default(false),
  validity_period: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  }).optional(),
});

/**
 * Event node - represents temporal occurrences
 */
export const EventNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.EVENT),
  name: z.string(),
  description: z.string(),
  timestamp: z.string().datetime(),
  duration: z.number().optional(), // in seconds
  participants: z.array(z.string()).default([]),
  location: z.string().optional(),
  outcome: z.string().optional(),
});

/**
 * Entity node - represents people, organizations, systems
 */
export const EntityNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.ENTITY),
  name: z.string(),
  entity_type: z.enum(['person', 'organization', 'system', 'place', 'object']),
  attributes: z.record(z.any()).default({}),
  aliases: z.array(z.string()).default([]),
});

/**
 * Document node - represents knowledge base documents
 */
export const DocumentNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.DOCUMENT),
  title: z.string(),
  content: z.string(),
  path: z.string(),
  author: z.string().optional(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  language: z.string().default('en'),
});

/**
 * Question node - represents queries and uncertainties
 */
export const QuestionNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.QUESTION),
  question: z.string(),
  context: z.string().optional(),
  answered: z.boolean().default(false),
  answer_nodes: z.array(z.string()).default([]),
  asked_by: z.string().optional(),
});

/**
 * Insight node - represents derived understanding
 */
export const InsightNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.INSIGHT),
  insight: z.string(),
  reasoning: z.string(),
  supporting_nodes: z.array(z.string()).default([]),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  actionable: z.boolean().default(false),
});

/**
 * Memory node - represents conversation context
 */
export const MemoryNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.MEMORY),
  memory_type: z.nativeEnum(MemoryType),
  content: z.string(),
  session_id: z.string().optional(),
  user_id: z.string().optional(),
  decay_rate: z.number().min(0).max(1).default(0.1),
  reinforcement_count: z.number().default(0),
});

/**
 * Union type for all node schemas
 */
export const NodeSchema = z.discriminatedUnion('type', [
  ConceptNodeSchema,
  FactNodeSchema,
  EventNodeSchema,
  EntityNodeSchema,
  DocumentNodeSchema,
  QuestionNodeSchema,
  InsightNodeSchema,
  MemoryNodeSchema,
]);

/**
 * Edge properties
 */
export const EdgeSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(EdgeType),
  source: z.string(),
  target: z.string(),
  weight: z.number().min(0).max(1).default(1.0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.any()).default({}),
  bidirectional: z.boolean().default(false),
});

/**
 * Temporal edge with time information
 */
export const TemporalEdgeSchema = EdgeSchema.extend({
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime().optional(),
  confidence_over_time: z.array(z.object({
    timestamp: z.string().datetime(),
    confidence: z.number().min(0).max(1),
  })).default([]),
});

/**
 * Query result types
 */
export const GraphQueryResultSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  metadata: z.object({
    query_time_ms: z.number(),
    total_nodes: z.number(),
    total_edges: z.number(),
    traversal_depth: z.number().optional(),
  }),
});

/**
 * Memory operation types
 */
export const MemoryOperationSchema = z.object({
  operation: z.enum(['store', 'retrieve', 'update', 'forget', 'reinforce', 'consolidate']),
  timestamp: z.string().datetime(),
  memory_type: z.nativeEnum(MemoryType),
  node_ids: z.array(z.string()),
  success: z.boolean(),
  duration_ms: z.number(),
});

/**
 * Type exports
 */
export type BaseNode = z.infer<typeof BaseNodeSchema>;
export type ConceptNode = z.infer<typeof ConceptNodeSchema>;
export type FactNode = z.infer<typeof FactNodeSchema>;
export type EventNode = z.infer<typeof EventNodeSchema>;
export type EntityNode = z.infer<typeof EntityNodeSchema>;
export type DocumentNode = z.infer<typeof DocumentNodeSchema>;
export type QuestionNode = z.infer<typeof QuestionNodeSchema>;
export type InsightNode = z.infer<typeof InsightNodeSchema>;
export type MemoryNode = z.infer<typeof MemoryNodeSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type TemporalEdge = z.infer<typeof TemporalEdgeSchema>;
export type GraphQueryResult = z.infer<typeof GraphQueryResultSchema>;
export type MemoryOperation = z.infer<typeof MemoryOperationSchema>;

/**
 * Graph statistics
 */
export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  node_types: Record<NodeType, number>;
  edge_types: Record<EdgeType, number>;
  memory_usage_bytes: number;
  avg_node_connections: number;
  graph_density: number;
  last_update: string;
}

/**
 * Memory configuration
 */
export interface MemoryConfig {
  max_short_term_items: number;
  short_term_duration_ms: number;
  consolidation_threshold: number;
  decay_interval_ms: number;
  importance_threshold: number;
  embedding_model: string;
  graph_url: string;
  vector_dimension: number;
  enable_auto_consolidation: boolean;
  enable_contradiction_detection: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  node_types?: NodeType[];
  limit?: number;
  min_confidence?: number;
  min_importance?: number;
  include_embeddings?: boolean;
  semantic_threshold?: number;
  traversal_depth?: number;
  time_range?: {
    start: string;
    end: string;
  };
}

/**
 * Reasoning path
 */
export interface ReasoningPath {
  start_node: string;
  end_node: string;
  path: string[];
  edges: Edge[];
  confidence: number;
  reasoning_steps: string[];
}