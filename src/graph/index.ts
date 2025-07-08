/**
 * Graph-based Memory System
 * Main exports for the graph-based persistent memory system
 */

// Core types
export * from './types.js';

// Schema definitions
export * from './schema.js';

// Interfaces
export * from './interfaces.js';

// Connection management
export { FalkorDBConnection, type FalkorDBConfig } from './connection.js';

// Memory implementations
export { GraphMemory } from './graph-memory.js';
export { VectorMemory } from './vector-memory.js';
export { TemporalMemory } from './temporal-memory.js';
export { WorkingMemory } from './working-memory.js';

// Unified memory system
export { UnifiedMemory, type UnifiedMemoryConfig } from './unified-memory.js';

// Import types for local use
import type { FalkorDBConfig as _FalkorDBConfig } from './connection.js';
import { UnifiedMemory as _UnifiedMemory } from './unified-memory.js';

// Factory function for easy initialization
export async function createMemorySystem(config: _FalkorDBConfig) {
  const memory = new _UnifiedMemory(config);
  const result = await memory.initialize();
  
  if (!result.success) {
    throw new Error(`Failed to initialize memory system: ${result.error}`);
  }
  
  return memory;
}

// Default configuration
export const defaultConfig: Partial<_FalkorDBConfig> = {
  host: 'localhost',
  port: 6379,
  graph_name: 'knowledge_graph',
  max_connections: 10,
  connection_timeout: 5000,
  query_timeout: 30000,
};