/**
 * FalkorDB Connection Pool
 * Manages database connections with pooling for scalability
 */

import { Pool, createPool } from 'generic-pool';
import { FalkorDB } from 'falkordb';
import { Result } from '../types/index.js';
import { ErrorTypes, toKBError } from '../types/error-utils.js';
import winston from 'winston';

export interface ConnectionPoolConfig {
  host: string;
  port: number;
  password?: string;
  graph_name: string;
  pool?: {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    idleTimeoutMillis: number;
    evictionRunIntervalMillis: number;
    testOnBorrow: boolean;
    testOnReturn: boolean;
  };
}

interface PooledConnection {
  client: FalkorDB;
  graph: any;
  created_at: Date;
  last_used: Date;
  query_count: number;
}

/**
 * High-performance connection pool for FalkorDB
 */
export class FalkorDBConnectionPool {
  private pool: Pool<PooledConnection>;
  private config: ConnectionPoolConfig;
  private logger: winston.Logger;
  private isInitialized = false;

  constructor(config: ConnectionPoolConfig) {
    this.config = {
      ...config,
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 300000, // 5 minutes
        evictionRunIntervalMillis: 60000, // 1 minute
        testOnBorrow: true,
        testOnReturn: true,
        ...config.pool,
      },
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

    this.pool = createPool(
      {
        create: () => this.createConnection(),
        destroy: (connection: PooledConnection) => this.destroyConnection(connection),
        validate: (connection: PooledConnection) => this.validateConnection(connection),
      },
      {
        min: (this.config.pool?.min) ?? 2,
        max: (this.config.pool?.max) ?? 10,
        acquireTimeoutMillis: (this.config.pool?.acquireTimeoutMillis) ?? 30000,
        idleTimeoutMillis: (this.config.pool?.idleTimeoutMillis) ?? 300000,
        evictionRunIntervalMillis: (this.config.pool?.evictionRunIntervalMillis) ?? 60000,
        testOnBorrow: (this.config.pool?.testOnBorrow) ?? true,
        testOnReturn: (this.config.pool?.testOnReturn) ?? true,
      }
    );
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      return { success: true, data: undefined };
    }

    try {
      // Test initial connection
      const testConnection = await this.pool.acquire();
      await this.pool.release(testConnection);
      
      this.isInitialized = true;
      
      this.logger.info('Connection pool initialized', {
        port: this.config.port,
        graph: this.config.graph_name,
        pool_config: this.config.pool,
      });

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to initialize connection pool', error);
      return {
        success: false,
        error: {
          name: 'ConnectionPoolInitError',
          message: `Failed to initialize connection pool: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'CONNECTION_POOL_INIT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Execute a query with connection pooling
   */
  async query(cypher: string, params?: Record<string, any>): Promise<Result<any>> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: {
          name: 'ConnectionPoolNotInitialized',
          message: 'Connection pool not initialized',
          code: 'CONNECTION_POOL_NOT_INITIALIZED',
          statusCode: 500,
          isOperational: true
        }
      };
    }

    const startTime = Date.now();
    let connection: PooledConnection | null = null;

    try {
      // Acquire connection from pool
      connection = await this.pool.acquire();
      
      // Execute query
      const result = await connection.graph.query(cypher, params);
      
      // Update connection stats
      connection.last_used = new Date();
      connection.query_count++;
      
      const executionTime = Date.now() - startTime;
      
      this.logger.debug('Query executed', {
        query: cypher.substring(0, 100) + (cypher.length > 100 ? '...' : ''),
        params,
        execution_time_ms: executionTime,
        connection_id: connection.created_at.toISOString(),
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Query execution failed', {
        query: cypher,
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time_ms: Date.now() - startTime,
      });

      return {
        success: false,
        error: toKBError(error, { query: cypher, params }),
      };
    } finally {
      // Always release connection back to pool
      if (connection) {
        await this.pool.release(connection);
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: Array<{ cypher: string; params?: Record<string, any> }>): Promise<Result<any[]>> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: ErrorTypes.INITIALIZATION_ERROR('Connection pool not initialized'),
      };
    }

    const startTime = Date.now();
    let connection: PooledConnection | null = null;

    try {
      // Acquire connection from pool
      connection = await this.pool.acquire();
      
      // Execute queries in transaction
      const results: any[] = [];
      
      // Note: FalkorDB doesn't support explicit transactions yet
      // This is a placeholder for future transaction support
      for (const query of queries) {
        const result = await connection.graph.query(query.cypher, query.params);
        results.push(result);
      }
      
      // Update connection stats
      connection.last_used = new Date();
      connection.query_count += queries.length;
      
      const executionTime = Date.now() - startTime;
      
      this.logger.debug('Transaction executed', {
        query_count: queries.length,
        execution_time_ms: executionTime,
        connection_id: connection.created_at.toISOString(),
      });

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      this.logger.error('Transaction failed', {
        query_count: queries.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time_ms: Date.now() - startTime,
      });

      return {
        success: false,
        error: toKBError(error, { operation: 'transaction', queries }),
      };
    } finally {
      // Always release connection back to pool
      if (connection) {
        await this.pool.release(connection);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total_connections: number;
    available_connections: number;
    borrowed_connections: number;
    pending_requests: number;
    pool_config: any;
  } {
    return {
      total_connections: this.pool?.size ?? 0,
      available_connections: this.pool?.available ?? 0,
      borrowed_connections: this.pool?.borrowed ?? 0,
      pending_requests: this.pool?.pending ?? 0,
      pool_config: this.config?.pool ?? {},
    };
  }

  /**
   * Health check for the connection pool
   */
  async healthCheck(): Promise<Result<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    connections: number;
    avg_response_time_ms: number;
    error_rate: number;
  }>> {
    try {
      const startTime = Date.now();
      
      // Test a simple query
      const testResult = await this.query('RETURN 1 as test');
      
      const responseTime = Date.now() - startTime;
      const stats = this.getStats();
      
      const status = testResult.success ? 
        (responseTime < 100 ? 'healthy' : 'degraded') : 
        'unhealthy';

      return {
        success: true,
        data: {
          status,
          connections: stats.total_connections,
          avg_response_time_ms: responseTime,
          error_rate: 0, // Would need to track this over time
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'healthCheck' }),
      };
    }
  }

  /**
   * Gracefully shutdown the connection pool
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      await this.pool.drain();
      await this.pool.clear();
      
      this.isInitialized = false;
      
      this.logger.info('Connection pool shut down gracefully');
    } catch (error) {
      this.logger.error('Error during connection pool shutdown', error);
    }
  }

  /**
   * Create a new database connection
   */
  private async createConnection(): Promise<PooledConnection> {
    const client = await FalkorDB.connect({
      url: undefined,
      socket: {
        host: this.config.host,
        port: this.config.port,
      },
      password: this.config.password,
    });
    // Get graph instance
    const graph = client.selectGraph(this.config.graph_name);
    
    const connection: PooledConnection = {
      client,
      graph,
      created_at: new Date(),
      last_used: new Date(),
      query_count: 0,
    };

    this.logger.debug('New connection created', {
      connection_id: connection.created_at.toISOString(),
    });

    return connection;
  }

  /**
   * Destroy a database connection
   */
  private async destroyConnection(connection: PooledConnection): Promise<void> {
    try {
      await connection.client.close();
      
      this.logger.debug('Connection destroyed', {
        connection_id: connection.created_at.toISOString(),
        query_count: connection.query_count,
        lifetime_ms: Date.now() - connection.created_at.getTime(),
      });
    } catch (error) {
      this.logger.error('Error destroying connection', error);
    }
  }

  /**
   * Validate a database connection
   */
  private async validateConnection(connection: PooledConnection): Promise<boolean> {
    try {
      // Test with a simple query
      await connection.graph.query('RETURN 1');
      return true;
    } catch (error) {
      this.logger.warn('Connection validation failed', {
        connection_id: connection.created_at.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}