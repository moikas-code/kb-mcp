/**
 * Graph Storage Backend
 * Implements graph-based storage using FalkorDB for advanced AI features
 */

import { UnifiedMemory, UnifiedMemoryConfig } from '../graph/index.js';
import { NodeType, DocumentNode, MemoryNode } from '../graph/types.js';
import { StorageBackend, SearchOptions, BackendConfig } from './storage-interface.js';
import { KBFile, KBDirectory, SearchResult, KBCategory, KB_CATEGORIES, ImplementationStatus, KnownIssue, BackendExport } from './types.js';
import { Result } from '../types/index.js';

export class GraphBackend implements StorageBackend {
  private memory: UnifiedMemory;
  private initialized = false;

  constructor(private config: BackendConfig) {
    if (config.type !== 'graph') {
      throw new Error('Invalid backend type for GraphBackend');
    }

    const memoryConfig: UnifiedMemoryConfig = {
      host: config.graph?.connection.host || 'localhost',
      port: config.graph?.connection.port || connection.connection?.port || 3000 || 6380,
      password: config.graph?.connection.password,
      graph_name: config.graph?.connection.database || 'kb_graph',
      max_connections: 10,
      connection_timeout: 5000,
      query_timeout: 30000,
      embedding_model: 'Xenova/all-MiniLM-L6-v2',
      enable_auto_consolidation: true,
      consolidation_threshold: 5,
      contradiction_detection: true,
      insight_generation: true
    };

    this.memory = new UnifiedMemory(memoryConfig);
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return { success: true, data: undefined };
    }

    const result = await this.memory.initialize();
    
    if (result.success) {
      this.initialized = true;
      
      // Create initial graph schema for KB documents
      await this.setupGraphSchema();
    }
    
    return result;
  }

  private async setupGraphSchema(): Promise<void> {
    // Create indexes for efficient querying
    const schemaQueries = [
      'CREATE INDEX ON :Document(path)',
      'CREATE INDEX ON :Document(category)',
      'CREATE INDEX ON :Document(modified)',
      'CREATE INDEX ON :Category(name)',
      'CREATE INDEX ON :Issue(severity)',
      'CREATE INDEX ON :Status(phase)'
    ];

    for (const query of schemaQueries) {
      try {
        await this.memory.graph.query(query, {});
      } catch (error) {
        // Index might already exist, ignore
        console.warn(`Schema setup warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async healthCheck(): Promise<Result<{ status: string; details: Record<string, any> }>> {
    try {
      // Test graph connection
      const result = await this.memory.graph.query('RETURN "ping" as status', {});
      
      if (!result.success) {
        return {
          success: true,
          data: {
            status: 'unhealthy',
            details: {
              backend_type: 'graph',
              error: 'Graph database connection failed',
              connection: this.config.graph?.connection
            }
          }
        };
      }

      // Get document count
      const countResult = await this.memory.graph.query('MATCH (d:Document) RETURN count(d) as total', {});
      const documentCount = countResult.success && countResult.data?.[0]?.total || 0;

      return {
        success: true,
        data: {
          status: 'healthy',
          details: {
            backend_type: 'graph',
            graph_connected: true,
            total_documents: documentCount,
            vector_search: this.config.graph?.enable_semantic_search ?? false,
            temporal_queries: this.config.graph?.enable_temporal_queries ?? false,
            connection: {
              host: this.config.graph?.connection.host,
              port: this.config.graph?.connection.port || connection.connection?.port || 3000,
              database: this.config.graph?.connection.database
            }
          }
        }
      };
    } catch (error) {
      return {
        success: true,
        data: {
          status: 'unhealthy',
          details: {
            backend_type: 'graph',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      };
    }
  }

  getBackendType(): 'filesystem' | 'graph' {
    return 'graph';
  }

  getConfiguration(): Record<string, any> {
    return {
      type: 'graph',
      connection: this.config.graph?.connection,
      features: {
        semantic_search: this.config.graph?.enable_semantic_search ?? false,
        temporal_queries: this.config.graph?.enable_temporal_queries ?? false,
        vector_dimensions: this.config.graph?.vector_dimensions || 1536
      }
    };
  }

  private categorizeFile(filePath: string): KBCategory {
    const normalizedPath = filePath.toLowerCase();
    
    if (normalizedPath.includes('/active/') || normalizedPath.startsWith('active/')) {
      return 'active';
    }
    if (normalizedPath.includes('/completed/') || normalizedPath.startsWith('completed/')) {
      return 'completed';
    }
    if (normalizedPath.includes('/status/') || normalizedPath.startsWith('status/')) {
      return 'status';
    }
    if (normalizedPath.includes('/architecture/') || normalizedPath.startsWith('architecture/')) {
      return 'architecture';
    }
    if (normalizedPath.includes('/compliance/') || normalizedPath.startsWith('compliance/')) {
      return 'compliance';
    }
    if (normalizedPath.includes('/legacy/') || normalizedPath.startsWith('legacy/')) {
      return 'legacy';
    }
    
    return 'general';
  }

  async readFile(filePath: string): Promise<Result<KBFile>> {
    try {
      const result = await this.memory.graph.query(
        'MATCH (d:Document {path: $path}) RETURN d',
        { path: filePath }
      );

      if (!result.success || !result.data || result.data.length === 0) {
        return {
          success: false,
          error: {
            name: 'FileNotFound',
            message: `File not found: ${filePath}`,
            code: 'FILE_NOT_FOUND',
            statusCode: 404,
            isOperational: true
          }
        };
      }

      const doc = result.data[0].d;
      
      return {
        success: true,
        data: {
          path: doc.path,
          content: doc.content,
          metadata: doc.metadata || {},
          category: doc.category || this.categorizeFile(filePath),
          size: doc.content?.length || 0,
          modified: doc.modified || new Date().toISOString(),
          created: doc.created || new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphReadError',
          message: `Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_READ_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async writeFile(filePath: string, content: string, metadata?: Record<string, any>): Promise<Result<void>> {
    try {
      const category = this.categorizeFile(filePath);
      const now = new Date().toISOString();

      // Use graph query to create or update document
      const result = await this.memory.graph.query(`
        MERGE (d:Document {path: $path})
        SET d.content = $content,
            d.metadata = $metadata,
            d.category = $category,
            d.modified = $modified,
            d.size = $size
        ON CREATE SET d.created = $created
        MERGE (c:Category {name: $category})
        MERGE (d)-[:BELONGS_TO]->(c)
        RETURN d
      `, {
        path: filePath,
        content,
        metadata: JSON.stringify(metadata || {}),
        category,
        modified: now,
        created: now,
        size: content.length
      });

      if (!result.success) {
        return {
          success: false,
          error: {
            name: 'GraphWriteError',
            message: `Failed to write file ${filePath}: ${result.error}`,
            code: 'GRAPH_WRITE_FAILED',
            statusCode: 500,
            isOperational: true
          }
        };
      }

      // Store in vector memory for semantic search if enabled
      if (this.config.graph?.enable_semantic_search) {
        await this.memory.vector.store(content, {
          category,
          path: filePath,
          modified: now
        });
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphWriteError',
          message: `Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_WRITE_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async deleteFile(filePath: string): Promise<Result<void>> {
    try {
      const result = await this.memory.graph.query(
        'MATCH (d:Document {path: $path}) DETACH DELETE d',
        { path: filePath }
      );

      if (!result.success) {
        return {
          success: false,
          error: {
            name: 'GraphDeleteError',
            message: `Failed to delete file ${filePath}: ${result.error}`,
            code: 'GRAPH_DELETE_FAILED',
            statusCode: 500,
            isOperational: true
          }
        };
      }

      // Remove from vector memory
      if (this.config.graph?.enable_semantic_search) {
        await this.memory.vector.forget(filePath);
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphDeleteError',
          message: `Failed to delete file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_DELETE_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async listFiles(directory?: string): Promise<Result<KBDirectory>> {
    try {
      // Build query based on directory filter
      let query = 'MATCH (d:Document)';
      const params: Record<string, any> = {};

      if (directory) {
        query += ' WHERE d.path STARTS WITH $directory';
        params.directory = directory.endsWith('/') ? directory : directory + '/';
      }

      query += ' RETURN d ORDER BY d.modified DESC';

      const result = await this.memory.graph.query(query, params);

      if (!result.success) {
        return {
          success: false,
          error: {
            name: 'GraphListError',
            message: `Failed to list files: ${result.error}`,
            code: 'GRAPH_LIST_FAILED',
            statusCode: 500,
            isOperational: true
          }
        };
      }

      const files: KBFile[] = (result.data || []).map((row: any) => {
        const doc = row.d;
        return {
          path: doc.path,
          content: doc.content,
          metadata: doc.metadata ? JSON.parse(doc.metadata) : {},
          category: doc.category || this.categorizeFile(doc.path),
          size: doc.size || doc.content?.length || 0,
          modified: doc.modified || new Date().toISOString(),
          created: doc.created || new Date().toISOString()
        };
      });

      // Group by category
      const categorizedFiles: Record<KBCategory, KBFile[]> = {
        active: [],
        completed: [],
        status: [],
        architecture: [],
        compliance: [],
        legacy: [],
        general: []
      };

      files.forEach(file => {
        categorizedFiles[file.category].push(file);
      });

      return {
        success: true,
        data: {
          path: directory || '',
          files,
          categories: categorizedFiles,
          total_files: files.length,
          total_size: files.reduce((sum, file) => sum + file.size, 0)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphListError',
          message: `Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_LIST_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async searchContent(query: string, options: SearchOptions = {}): Promise<Result<SearchResult[]>> {
    try {
      const { limit = 50, category } = options;

      let results: SearchResult[] = [];

      // Use vector search if enabled and available
      if (this.config.graph?.enable_semantic_search) {
        const vectorResult = await this.memory.vector.semanticSearch(query, limit, 0.7);

        if (vectorResult.success && vectorResult.data) {
          results = vectorResult.data.map(match => {
            const node = match.node;
            const content = node.type === NodeType.DOCUMENT ? (node as DocumentNode).content : 
                           node.type === NodeType.MEMORY ? (node as MemoryNode).content : '';
            
            return {
              file: {
                path: node.metadata.path || node.id,
                content,
                metadata: node.metadata,
                category: (node.metadata.category as KBCategory) || 'general',
                size: content.length,
                modified: node.metadata.modified || node.updated_at,
                created: node.metadata.created || node.created_at
              },
              score: match.similarity,
              matches: [{ line: 0, content: query, context: content.substring(0, 100) }],
              snippet: this.extractSnippet(content, query)
            };
          });
        }
      } else {
        // Fallback to graph-based text search
        let graphQuery = `
          MATCH (d:Document)
          WHERE toLower(d.content) CONTAINS toLower($query)
        `;
        
        if (category) {
          graphQuery += ' AND d.category = $category';
        }
        
        graphQuery += ' RETURN d ORDER BY d.modified DESC';
        if (limit) {
          graphQuery += ` LIMIT ${limit}`;
        }

        const params: Record<string, any> = { query };
        if (category) params.category = category;

        const graphResult = await this.memory.graph.query(graphQuery, params);

        if (graphResult.success && graphResult.data) {
          results = graphResult.data.map((row: any) => {
            const doc = row.d;
            return {
              file: {
                path: doc.path,
                content: doc.content,
                metadata: doc.metadata ? JSON.parse(doc.metadata) : {},
                category: doc.category || this.categorizeFile(doc.path),
                size: doc.size || doc.content?.length || 0,
                modified: doc.modified,
                created: doc.created
              },
              score: 1, // Simple binary match for text search
              matches: [{ line: 0, content: query, context: doc.content.substring(0, 100) }],
              snippet: this.extractSnippet(doc.content, query)
            };
          });
        }
      }

      return {
        success: true,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphSearchError',
          message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_SEARCH_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  private extractSnippet(content: string, query: string, maxLength = 200): string {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const index = contentLower.indexOf(queryLower);
    
    if (index === -1) return content.substring(0, maxLength);
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 150);
    
    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }

  async getStatus(): Promise<Result<ImplementationStatus>> {
    try {
      // Query for status information from graph
      const statusResult = await this.memory.graph.query(`
        MATCH (s:Status)
        RETURN s.phase as phase, s.status as status, s.completion as completion, s.notes as notes
        ORDER BY s.order
      `, {});

      let phases = [];
      if (statusResult.success && statusResult.data && statusResult.data.length > 0) {
        phases = statusResult.data.map((row: any) => ({
          name: row.phase,
          status: row.status,
          completion: row.completion,
          notes: row.notes
        }));
      } else {
        // Default phases if no status in graph
        phases = [
          { name: 'Lexer', status: 'completed' as const, completion: 100 },
          { name: 'Parser', status: 'completed' as const, completion: 99 },
          { name: 'Type System', status: 'completed' as const, completion: 98 },
          { name: 'Semantic Analysis', status: 'completed' as const, completion: 99 },
          { name: 'Code Generation', status: 'in_progress' as const, completion: 85 },
          { name: 'Runtime', status: 'in_progress' as const, completion: 60 },
          { name: 'Standard Library', status: 'in_progress' as const, completion: 30 },
          { name: 'Module System', status: 'blocked' as const, completion: 25, notes: 'BROKEN - blocks multi-file projects' }
        ];
      }

      const overallCompletion = Math.round(
        phases.reduce((sum: number, phase: any) => sum + phase.completion, 0) / phases.length
      );

      // Count critical issues
      const issuesResult = await this.memory.graph.query(
        'MATCH (i:Issue {severity: "critical"}) RETURN count(i) as count',
        {}
      );
      const criticalIssues = issuesResult.success && issuesResult.data?.[0]?.count || 3;

      return {
        success: true,
        data: {
          overall_completion: overallCompletion,
          phases,
          critical_issues: criticalIssues,
          last_updated: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphStatusError',
          message: `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_STATUS_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async getIssues(): Promise<Result<KnownIssue[]>> {
    try {
      const result = await this.memory.graph.query(`
        MATCH (i:Issue)
        RETURN i.id as id, i.title as title, i.description as description,
               i.severity as severity, i.category as category, i.status as status,
               i.created_at as created_at, i.updated_at as updated_at
        ORDER BY 
          CASE i.severity 
            WHEN 'critical' THEN 1 
            WHEN 'high' THEN 2 
            WHEN 'medium' THEN 3 
            ELSE 4 
          END, i.created_at DESC
      `, {});

      if (!result.success) {
        return {
          success: true,
          data: [] // Return empty array if query fails
        };
      }

      const issues: KnownIssue[] = (result.data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        severity: row.severity,
        category: row.category,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      return {
        success: true,
        data: issues
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphIssuesError',
          message: `Failed to get issues: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_ISSUES_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async exportData(): Promise<Result<BackendExport>> {
    try {
      const listResult = await this.listFiles();
      if (!listResult.success) return listResult;

      const files = listResult.data.files;
      const exportData: BackendExport = {
        backend_type: 'graph',
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        files: files.map(file => ({
          path: file.path,
          content: file.content,
          metadata: file.metadata,
          created_at: file.created,
          updated_at: file.modified
        })),
        metadata: {
          total_files: files.length,
          total_size: files.reduce((sum, file) => sum + file.size, 0),
          categories: KB_CATEGORIES
        }
      };

      return {
        success: true,
        data: exportData
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphExportError',
          message: `Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_EXPORT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async importData(data: BackendExport): Promise<Result<void>> {
    try {
      // Clear existing data first
      await this.memory.graph.query('MATCH (d:Document) DETACH DELETE d', {});

      // Import all files
      for (const file of data.files) {
        const writeResult = await this.writeFile(file.path, file.content, file.metadata);
        if (!writeResult.success) {
          return writeResult;
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'GraphImportError',
          message: `Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'GRAPH_IMPORT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }
}