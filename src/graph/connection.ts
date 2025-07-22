/**
 * FalkorDB Connection Manager
 * Handles database connections and query execution
 */

// import { FalkorDB } from 'falkordb';
import { Result } from '../types/index.js';
import { GRAPH_SCHEMA } from './schema.js';
import { FalkorDBConnectionPool } from './connection-pool.js';
import winston from 'winston';
import { toKBError } from '../types/error-utils.js';

export interface FalkorDBConfig {
  host: string;
  port: number;
  password?: string;
  graph_name: string;
  max_connections?: number;
  connection_timeout?: number;
  query_timeout?: number;
}

/**
 * FalkorDB connection manager with connection pooling
 */
export class FalkorDBConnection {
  private static instance: FalkorDBConnection;
  private connectionPool: FalkorDBConnectionPool;
  private config: FalkorDBConfig;
  private logger: winston.Logger;
  private isInitialized = false;

  private constructor(config: FalkorDBConfig) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      graph_name: config.graph_name || 'knowledge_graph',
      max_connections: config.max_connections || 10,
      connection_timeout: config.connection_timeout || 5000,
      query_timeout: config.query_timeout || 30000,
    };

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      ],
    });

    // Initialize connection pool
    this.connectionPool = new FalkorDBConnectionPool({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      graph_name: this.config.graph_name,
      pool: {
        min: 2,
        max: this.config.max_connections ?? 10,
        acquireTimeoutMillis: this.config.connection_timeout ?? 30000,
        idleTimeoutMillis: 300000,
        evictionRunIntervalMillis: 60000,
        testOnBorrow: true,
        testOnReturn: true,
      },
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: FalkorDBConfig): FalkorDBConnection {
    if (!FalkorDBConnection.instance) {
      if (!config) {
        throw new Error('FalkorDB configuration required for first initialization');
      }
      FalkorDBConnection.instance = new FalkorDBConnection(config);
    }
    return FalkorDBConnection.instance;
  }

  /**
   * Connect to FalkorDB
   */
  async connect(): Promise<Result<void>> {
    try {
      if (this.isInitialized) {
        return { success: true, data: undefined };
      }

      // Initialize connection pool
      const poolResult = await this.connectionPool.initialize();
      if (!poolResult.success) {
        return poolResult;
      }
      
      this.logger.info('Connected to FalkorDB with connection pool', {
        host: this.config.host,
        port: this.config.port,
        graph: this.config.graph_name,
        pool_config: this.connectionPool.getStats(),
      });

      // Mark as initialized after successful connection
      this.isInitialized = true;

      // Initialize schema
      await this.initializeSchema();

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to connect to FalkorDB', error);
      return {
        success: false,
        error: toKBError(new Error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'FalkorDBConnection' }),
      };
    }
  }

  /**
   * Initialize graph schema
   */
  private async initializeSchema(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Not connected to FalkorDB');
    }

    try {
      // Create indexes
      for (const indexQuery of GRAPH_SCHEMA.indexes) {
        try {
          await this.query(indexQuery);
        } catch (error) {
          // Index might already exist
          if (!(error instanceof Error && error.message.includes('already exists'))) {
            throw error;
          }
        }
      }

      this.logger.info('Graph schema initialized');
    } catch (error) {
      this.logger.error('Failed to initialize schema', error);
      throw error;
    }
  }

  /**
   * Execute a Cypher query using connection pool
   */
  async query<T = any>(
    cypher: string, 
    params?: Record<string, any>
  ): Promise<Result<T>> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: toKBError(new Error('Not connected to FalkorDB'), { operation: 'FalkorDBConnection' }),
      };
    }

    try {
      // Use connection pool for query execution
      const result = await this.connectionPool.query(cypher, params);
      
      if (!result.success) {
        return result;
      }

      return {
        success: true,
        data: result.data as T,
      };
    } catch (error) {
      this.logger.error('Query failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        cypher: cypher.substring(0, 200),
      });

      return {
        success: false,
        error: toKBError(new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'FalkorDBConnection' }),
      };
    }
  }

  /**
   * Execute multiple queries in a transaction using connection pool
   */
  async transaction<T = any>(
    queries: Array<{ cypher: string; params?: Record<string, any> }>
  ): Promise<Result<T[]>> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: toKBError(new Error('Not connected to FalkorDB'), { operation: 'FalkorDBConnection' }),
      };
    }

    try {
      // Use connection pool for transaction execution
      const result = await this.connectionPool.transaction(queries);
      
      if (!result.success) {
        return result;
      }

      return {
        success: true,
        data: result.data as T[],
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'FalkorDBConnection' }),
      };
    }
  }

  /**
   * Disconnect from FalkorDB and shutdown connection pool
   */
  async disconnect(): Promise<void> {
    if (this.isInitialized) {
      try {
        await this.connectionPool.shutdown();
        this.isInitialized = false;
        this.logger.info('Disconnected from FalkorDB and shut down connection pool');
      } catch (error) {
        this.logger.error('Error disconnecting from FalkorDB', error);
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.isInitialized;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): any {
    return this.connectionPool.getStats();
  }

  /**
   * Health check for connection pool
   */
  async healthCheck(): Promise<Result<any>> {
    return this.connectionPool.healthCheck();
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<Result<Record<string, any>>> {
    const result = await this.query(GRAPH_SCHEMA.queries.getStats);
    
    if (result.success && result.data?.[0]) {
      return {
        success: true,
        data: result.data[0].stats,
      };
    }
    
    return result;
  }

  /**
   * Clear the entire graph (use with caution!)
   */
  async clearGraph(): Promise<Result<void>> {
    const result = await this.query('MATCH (n) DETACH DELETE n');
    
    if (result.success) {
      this.logger.warn('Graph cleared');
      return { success: true, data: undefined };
    }
    
    return result;
  }

  /**
   * Export graph to Cypher statements
   */
  async exportGraph(): Promise<Result<string>> {
    try {
      // Get all nodes
      const nodesResult = await this.query('MATCH (n) RETURN n');
      if (!nodesResult.success) {
        return nodesResult;
      }

      // Get all relationships
      const edgesResult = await this.query('MATCH ()-[r]->() RETURN r');
      if (!edgesResult.success) {
        return edgesResult;
      }

      // Build export statements
      const statements: string[] = [];
      
      // Add node creation statements
      for (const row of nodesResult.data) {
        const node = row.n;
        const labels = node.labels.join(':');
        const props = JSON.stringify(node.properties);
        statements.push(`CREATE (n:${labels} ${props});`);
      }
      
      // Add relationship creation statements
      for (const row of edgesResult.data) {
        const rel = row.r;
        const type = rel.type;
        const props = JSON.stringify(rel.properties);
        statements.push(`MATCH (a {id: "${rel.start}"}), (b {id: "${rel.end}"}) CREATE (a)-[r:${type} ${props}]->(b);`);
      }
      
      return {
        success: true,
        data: statements.join('\n'),
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'FalkorDBConnection' }),
      };
    }
  }

  /**
   * Import graph from Cypher statements
   */
  async importGraph(cypherStatements: string): Promise<Result<void>> {
    try {
      const statements = cypherStatements.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          const result = await this.query(statement);
          if (!result.success) {
            return result;
          }
        }
      }
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(new Error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'FalkorDBConnection' }),
      };
    }
  }
}