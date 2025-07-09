/**
 * MCP Tool implementations for Script KB
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { BackendManager } from '../core/backend-manager.js';

export function createTools(_backendManager: BackendManager): Tool[] {
  return [
    {
      name: 'kb_read',
      description: 'Read a file from the Script language knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to kb/ directory (e.g., "active/KNOWN_ISSUES.md")'
          }
        },
        required: ['path']
      }
    },
    {
      name: 'kb_list',
      description: 'List files and directories in the Script knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory path relative to kb/ (optional, defaults to root)',
            default: ''
          }
        }
      }
    },
    {
      name: 'kb_update',
      description: 'Create or update a file in the Script knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to kb/ directory'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file (markdown format)'
          }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'kb_delete',
      description: 'Delete a file from the Script knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to kb/ directory'
          }
        },
        required: ['path']
      }
    },
    {
      name: 'kb_search',
      description: 'Search for content in Script knowledge base files',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text to search for'
          },
          directory: {
            type: 'string',
            description: 'Directory to search in (optional, searches all kb/ if not specified)'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'kb_status',
      description: 'Get the current implementation status of the Script language',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'kb_issues',
      description: 'Get the current known issues in the Script language implementation',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'kb_backend_info',
      description: 'Get information about the current storage backend and available options',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'kb_backend_switch',
      description: 'Switch between storage backends (filesystem or graph)',
      inputSchema: {
        type: 'object',
        properties: {
          backend_type: {
            type: 'string',
            enum: ['filesystem', 'graph'],
            description: 'Backend type to switch to'
          },
          migrate_data: {
            type: 'boolean',
            description: 'Whether to migrate existing data to the new backend',
            default: false
          }
        },
        required: ['backend_type']
      }
    },
    {
      name: 'kb_backend_health',
      description: 'Check the health status of the current storage backend',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'kb_create',
      description: 'Create a new file in the knowledge base (alias for kb_update)',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to kb/ directory'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file (markdown format)'
          }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'kb_semantic_search',
      description: 'Perform semantic search using vector embeddings (graph backend only)',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query for semantic search'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 10
          },
          threshold: {
            type: 'number',
            description: 'Similarity threshold (0-1)',
            default: 0.7
          }
        },
        required: ['query']
      }
    },
    {
      name: 'kb_graph_query',
      description: 'Execute a custom graph query using Cypher syntax (graph backend only)',
      inputSchema: {
        type: 'object',
        properties: {
          cypher: {
            type: 'string',
            description: 'Cypher query to execute'
          },
          params: {
            type: 'object',
            description: 'Parameters for the query',
            default: {}
          }
        },
        required: ['cypher']
      }
    },
    {
      name: 'kb_export',
      description: 'Export knowledge base data for backup or migration',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'yaml'],
            description: 'Export format',
            default: 'json'
          },
          include_metadata: {
            type: 'boolean',
            description: 'Include file metadata in export',
            default: true
          }
        }
      }
    },
    {
      name: 'kb_import',
      description: 'Import knowledge base data from backup',
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'string',
            description: 'JSON or YAML data to import'
          },
          overwrite: {
            type: 'boolean',
            description: 'Whether to overwrite existing files',
            default: false
          }
        },
        required: ['data']
      }
    }
  ];
}

/**
 * Execute a tool with the given arguments
 */
export async function executeTool(
  toolName: string,
  args: any,
  backendManager: BackendManager
): Promise<any> {
  const backend = backendManager.getBackend();
  if (!backend) {
    throw new Error('No storage backend initialized');
  }
  switch (toolName) {
    case 'kb_read': {
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const result = await backend.readFile(normalizedPath);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      // Add parsed summary for specific status/issues files
      let parsedSummary = undefined;
      if (args.path.includes('OVERALL_STATUS.md') || args.path.includes('status/')) {
        parsedSummary = _extractStatusSummary(result.data.content);
      } else if (args.path.includes('KNOWN_ISSUES.md') || args.path.includes('issues/')) {
        parsedSummary = _extractIssuesSummary(result.data.content);
      }
      
      return {
        path: result.data.path,
        content: result.data.content,
        metadata: result.data.metadata,
        category: result.data.category,
        size: result.data.size,
        modified: result.data.modified,
        ...(parsedSummary && { parsed_summary: parsedSummary })
      };
    }

    case 'kb_list': {
      const directory = args.directory || '';
      const result = await backend.listFiles(directory);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        path: result.data.path,
        total_files: result.data.total_files,
        total_size: result.data.total_size,
        categories: result.data.categories,
        files: result.data.files.map(f => ({
          path: f.path,
          category: f.category,
          size: f.size,
          modified: f.modified
        }))
      };
    }

    case 'kb_update': {
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const result = await backend.writeFile(normalizedPath, args.content, args.metadata);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        success: true,
        message: `File ${args.path} updated successfully`
      };
    }

    case 'kb_delete': {
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const result = await backend.deleteFile(normalizedPath);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        success: true,
        message: `File ${args.path} deleted successfully`
      };
    }

    case 'kb_search': {
      const options = {
        limit: args.limit || 20,
        category: args.category,
        includeContent: true,
        fuzzy: args.fuzzy || false
      };
      const result = await backend.searchContent(args.query, options);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        query: args.query,
        total_results: result.data.length,
        results: result.data.map(r => ({
          path: r.file.path,
          category: r.file.category,
          score: r.score,
          matches: r.matches,
          snippet: r.snippet
        }))
      };
    }

    case 'kb_status': {
      const result = await backend.getStatus();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        overall_completion: result.data.overall_completion,
        phases: result.data.phases,
        critical_issues: result.data.critical_issues,
        last_updated: result.data.last_updated,
        backend_type: backend.getBackendType()
      };
    }

    case 'kb_issues': {
      const result = await backend.getIssues();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        total_issues: result.data.length,
        issues: result.data,
        by_severity: {
          critical: result.data.filter(i => i.severity === 'critical').length,
          high: result.data.filter(i => i.severity === 'high').length,
          medium: result.data.filter(i => i.severity === 'medium').length,
          low: result.data.filter(i => i.severity === 'low').length
        },
        backend_type: backend.getBackendType()
      };
    }

    case 'kb_backend_info': {
      const availableResult = await backendManager.listAvailableBackends();
      if (!availableResult.success) {
        throw new Error(availableResult.error.message);
      }
      
      const currentConfig = backendManager.getCurrentConfig();
      const currentBackend = backendManager.getBackend();
      
      return {
        current_backend: {
          type: currentBackend?.getBackendType(),
          configuration: currentBackend?.getConfiguration()
        },
        available_backends: availableResult.data,
        configuration: currentConfig
      };
    }

    case 'kb_backend_switch': {
      const result = await backendManager.switchBackend(args.backend_type, args.migrate_data);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        success: true,
        message: `Successfully switched to ${args.backend_type} backend`,
        migrated_data: args.migrate_data,
        new_backend: args.backend_type
      };
    }

    case 'kb_backend_health': {
      const result = await backendManager.getBackendHealth();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return result.data;
    }

    case 'kb_create': {
      // kb_create is an alias for kb_update
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const result = await backend.writeFile(normalizedPath, args.content, args.metadata);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        success: true,
        message: `File ${args.path} created successfully`
      };
    }

    case 'kb_semantic_search': {
      // Check if current backend supports semantic search
      if (backend.getBackendType() !== 'graph') {
        throw new Error('Semantic search requires graph backend. Use kb_backend_switch to switch to graph backend.');
      }
      
      const options = {
        limit: args.limit || 10,
        includeContent: true
      };
      
      const result = await backend.searchContent(args.query, options);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        query: args.query,
        search_type: 'semantic',
        threshold: args.threshold || 0.7,
        total_results: result.data.length,
        results: result.data.map(r => ({
          path: r.file.path,
          category: r.file.category,
          score: r.score,
          matches: r.matches,
          snippet: r.snippet,
          semantic_similarity: r.score
        }))
      };
    }

    case 'kb_graph_query': {
      // Check if current backend supports graph queries
      if (backend.getBackendType() !== 'graph') {
        throw new Error('Graph queries require graph backend. Use kb_backend_switch to switch to graph backend.');
      }
      
      // For safety, only allow read-only queries
      const cypher = args.cypher.trim().toLowerCase();
      if (!cypher.startsWith('match') && !cypher.startsWith('return') && !cypher.startsWith('call db.')) {
        throw new Error('Only read-only graph queries are allowed (MATCH, RETURN, CALL db.*)');
      }
      
      try {
        // Access the graph backend directly
        const graphBackend = backend as any;
        if (!graphBackend.memory || !graphBackend.memory.graph) {
          throw new Error('Graph backend not properly initialized');
        }
        
        const result = await graphBackend.memory.graph.query(args.cypher, args.params || {});
        if (!result.success) {
          throw new Error(result.error);
        }
        
        return {
          cypher: args.cypher,
          params: args.params || {},
          result_count: result.data ? result.data.length : 0,
          results: result.data
        };
      } catch (error) {
        throw new Error(`Graph query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    case 'kb_export': {
      const result = await backend.exportData();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      let exportData: string;
      if (args.format === 'yaml') {
        const yaml = require('js-yaml');
        exportData = yaml.dump(result.data, { indent: 2 });
      } else {
        exportData = JSON.stringify(result.data, null, 2);
      }
      
      return {
        format: args.format || 'json',
        exported_at: new Date().toISOString(),
        total_files: result.data.files.length,
        total_size: result.data.metadata.total_size,
        backend_type: result.data.backend_type,
        data: exportData
      };
    }

    case 'kb_import': {
      let importData: any;
      try {
        if (args.data.trim().startsWith('{')) {
          importData = JSON.parse(args.data);
        } else {
          const yaml = require('js-yaml');
          importData = yaml.load(args.data);
        }
      } catch (error) {
        throw new Error('Invalid import data format. Must be valid JSON or YAML.');
      }
      
      const result = await backend.importData(importData);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        success: true,
        message: 'Data imported successfully',
        imported_files: importData.files ? importData.files.length : 0,
        backend_type: importData.backend_type,
        overwrite: args.overwrite || false
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Extract a summary from the status file
 */
function _extractStatusSummary(content: string): any {
  const lines = content.split('\n');
  const summary: any = {
    components: {},
    overall: {}
  };

  // let inComponentSection = false;
  
  for (const line of lines) {
    // Look for overall completion percentage
    if (line.includes('Overall Completion:')) {
      const match = line.match(/(\d+)%/);
      if (match) {
        summary.overall.completion = parseInt(match[1]);
      }
    }

    // Look for component status lines
    if (line.includes('|') && line.includes('%')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts[2].includes('%')) {
        const component = parts[0];
        const status = parts[1];
        const completion = parseInt(parts[2].replace('%', ''));
        
        summary.components[component] = {
          status,
          completion
        };
      }
    }
  }

  return summary;
}

/**
 * Extract a summary from the issues file
 */
function _extractIssuesSummary(content: string): any {
  const lines = content.split('\n');
  const issues: any[] = [];
  
  let currentIssue: any = null;
  let currentSection = '';

  for (const line of lines) {
    // Section headers
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
    }
    
    // Issue headers
    if (line.startsWith('### ')) {
      if (currentIssue) {
        issues.push(currentIssue);
      }
      currentIssue = {
        title: line.replace('### ', '').trim(),
        severity: determineSeverity(currentSection),
        description: ''
      };
    }
    
    // Issue content
    if (currentIssue && line.trim() && !line.startsWith('#')) {
      currentIssue.description += line + ' ';
    }
  }
  
  if (currentIssue) {
    issues.push(currentIssue);
  }

  return {
    totalIssues: issues.length,
    bySeverity: {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length
    },
    issues: issues.slice(0, 10) // Return first 10 issues
  };
}

function determineSeverity(section: string): string {
  const lower = section.toLowerCase();
  if (lower.includes('critical') || lower.includes('blocker')) return 'critical';
  if (lower.includes('high') || lower.includes('security')) return 'high';
  if (lower.includes('medium')) return 'medium';
  return 'low';
}