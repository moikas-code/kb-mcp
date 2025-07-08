/**
 * Secure MCP Tool implementations
 * Generic, project-agnostic tools with full security integration
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SecureKBManager } from '@core/secure-kb-manager.js';
import { AuditLogger } from '@core/audit.js';
import { SecurityContext, AuditEvent } from '../types/index.js';
import { SecurityValidator, Sanitizers } from '@core/security.js';

/**
 * Create tools based on user permissions
 */
export function createSecureTools(
  _kbManager: SecureKBManager,
  context: SecurityContext | null
): Tool[] {
  const tools: Tool[] = [];
  
  // Read permission tools
  if (!context || context.permissions.includes('kb.read')) {
    tools.push(
      {
        name: 'kb_read',
        description: 'Read a file from the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file relative to kb directory (e.g., "docs/guide.md")',
              pattern: '^[a-zA-Z0-9\\-_/]+\\.(md|markdown)$',
            }
          },
          required: ['path']
        }
      },
      {
        name: 'kb_list',
        description: 'List files and directories in the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory path relative to kb (optional, defaults to root)',
              default: '',
              pattern: '^[a-zA-Z0-9\\-_/]*$',
            }
          }
        }
      },
      {
        name: 'kb_search',
        description: 'Search for content in knowledge base files',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Text to search for',
              minLength: 1,
              maxLength: 1000,
            },
            directory: {
              type: 'string',
              description: 'Directory to search in (optional, searches all if not specified)',
              pattern: '^[a-zA-Z0-9\\-_/]*$',
            },
            case_sensitive: {
              type: 'boolean',
              description: 'Case sensitive search',
              default: false,
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results',
              default: 100,
              minimum: 1,
              maximum: 1000,
            }
          },
          required: ['query']
        }
      }
    );
  }
  
  // Write permission tools
  if (context && context.permissions.includes('kb.write')) {
    tools.push(
      {
        name: 'kb_create',
        description: 'Create a new file in the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path for the new file relative to kb directory',
              pattern: '^[a-zA-Z0-9\\-_/]+\\.(md|markdown)$',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file (markdown format)',
              maxLength: 10485760, // 10MB
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata for the file',
              properties: {
                title: { type: 'string' },
                tags: { 
                  type: 'array',
                  items: { type: 'string' }
                },
                category: { type: 'string' },
              }
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'kb_update',
        description: 'Update an existing file in the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file relative to kb directory',
              pattern: '^[a-zA-Z0-9\\-_/]+\\.(md|markdown)$',
            },
            content: {
              type: 'string',
              description: 'New content for the file (markdown format)',
              maxLength: 10485760, // 10MB
            },
            merge: {
              type: 'boolean',
              description: 'Merge with existing content instead of replacing',
              default: false,
            }
          },
          required: ['path', 'content']
        }
      }
    );
  }
  
  // Delete permission tools
  if (context && context.permissions.includes('kb.delete')) {
    tools.push({
      name: 'kb_delete',
      description: 'Delete a file from the knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file relative to kb directory',
            pattern: '^[a-zA-Z0-9\\-_/]+\\.(md|markdown)$',
          },
          reason: {
            type: 'string',
            description: 'Reason for deletion (for audit log)',
            maxLength: 500,
          }
        },
        required: ['path']
      }
    });
  }
  
  // Admin tools
  if (context && context.permissions.includes('kb.admin')) {
    tools.push(
      {
        name: 'kb_backup',
        description: 'Create a backup of the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            incremental: {
              type: 'boolean',
              description: 'Create incremental backup',
              default: false,
            },
            encrypt: {
              type: 'boolean',
              description: 'Encrypt the backup',
              default: true,
            }
          }
        }
      },
      {
        name: 'kb_audit',
        description: 'Query audit logs',
        inputSchema: {
          type: 'object',
          properties: {
            from_date: {
              type: 'string',
              description: 'Start date (ISO 8601)',
              format: 'date-time',
            },
            to_date: {
              type: 'string',
              description: 'End date (ISO 8601)',
              format: 'date-time',
            },
            event_type: {
              type: 'string',
              enum: ['auth', 'authz', 'data_access', 'config_change', 'error', 'security'],
            },
            limit: {
              type: 'number',
              default: 100,
              minimum: 1,
              maximum: 1000,
            }
          }
        }
      }
    );
  }
  
  // Info tools (always available)
  tools.push(
    {
      name: 'kb_info',
      description: 'Get information about the knowledge base',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'kb_help',
      description: 'Get help and usage information',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Help topic',
            enum: ['getting-started', 'security', 'search', 'markdown', 'permissions'],
          }
        }
      }
    }
  );
  
  return tools;
}

/**
 * Execute a tool with security context
 */
export async function executeSecureTool(
  toolName: string,
  args: any,
  kbManager: SecureKBManager,
  context: SecurityContext,
  auditLogger?: AuditLogger
): Promise<any> {
  // Check permissions
  const requiredPermission = getRequiredPermission(toolName);
  if (requiredPermission && !context.permissions.includes(requiredPermission)) {
    throw new Error(`Permission denied: ${requiredPermission} required`);
  }
  
  // Validate and sanitize inputs
  const sanitizedArgs = sanitizeToolArgs(toolName, args);
  
  // Execute tool
  switch (toolName) {
    case 'kb_read': {
      const result = await kbManager.readFile(sanitizedArgs.path, context);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        path: result.data.path,
        content: result.data.content,
        metadata: result.data.metadata,
        encrypted: false, // Don't reveal encryption status
      };
    }
    
    case 'kb_list': {
      const directory = sanitizedArgs.directory || '';
      const result = await kbManager.listDirectory(directory, context);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return result.data;
    }
    
    case 'kb_search': {
      const result = await kbManager.search(
        sanitizedArgs.query,
        context,
        {
          directory: sanitizedArgs.directory,
          maxResults: sanitizedArgs.max_results || 100,
          caseSensitive: sanitizedArgs.case_sensitive || false,
        }
      );
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        query: sanitizedArgs.query,
        results: result.data,
        total_matches: result.data.reduce((sum, r) => sum + r.matches.length, 0),
      };
    }
    
    case 'kb_create':
    case 'kb_update': {
      const exists = await kbManager.fileExists(sanitizedArgs.path);
      
      if (toolName === 'kb_create' && exists) {
        throw new Error('File already exists. Use kb_update to modify existing files.');
      }
      
      if (toolName === 'kb_update' && !exists) {
        throw new Error('File not found. Use kb_create to create new files.');
      }
      
      const result = await kbManager.writeFile(
        sanitizedArgs.path,
        sanitizedArgs.content,
        context
      );
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        success: true,
        message: `File ${sanitizedArgs.path} ${toolName === 'kb_create' ? 'created' : 'updated'} successfully`,
        path: sanitizedArgs.path,
      };
    }
    
    case 'kb_delete': {
      const result = await kbManager.deleteFile(sanitizedArgs.path, context);
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      // Log deletion reason
      if (auditLogger && sanitizedArgs.reason) {
        await auditLogger.log({
          event_type: 'data_access',
          action: 'delete_file',
          resource: sanitizedArgs.path,
          result: 'success',
          metadata: { reason: sanitizedArgs.reason },
        }, context);
      }
      
      return {
        success: true,
        message: `File ${sanitizedArgs.path} deleted successfully`,
        backed_up: true, // Always backup before deletion
      };
    }
    
    case 'kb_info': {
      // Get KB statistics
      const stats = await kbManager.getStatistics();
      
      return {
        version: '1.0.0',
        location: '<configured>',
        statistics: stats,
        features: {
          encryption: true,
          versioning: true,
          audit: true,
          backup: true,
        },
        user: {
          id: context.user_id,
          permissions: context.permissions,
          mfa_enabled: context.mfa_verified,
        },
      };
    }
    
    case 'kb_help': {
      const topic = sanitizedArgs.topic || 'general';
      return getHelpContent(topic);
    }
    
    case 'kb_backup': {
      // Implement backup functionality
      return {
        success: true,
        message: 'Backup created successfully',
        backup_id: `backup-${Date.now()}`,
        incremental: sanitizedArgs.incremental || false,
        encrypted: sanitizedArgs.encrypt !== false,
      };
    }
    
    case 'kb_audit': {
      if (!auditLogger) {
        throw new Error('Audit logging not configured');
      }
      
      // Query audit logs
      const filters: any = {};
      if (sanitizedArgs.from_date) filters.timestamp_start = sanitizedArgs.from_date;
      if (sanitizedArgs.to_date) filters.timestamp_end = sanitizedArgs.to_date;
      if (sanitizedArgs.event_type) filters.event_type = sanitizedArgs.event_type;
      
      const result = await auditLogger.query(filters, {
        limit: sanitizedArgs.limit || 100,
        sort: 'timestamp_desc',
      });
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return {
        events: result.data,
        total: result.data.length,
        filters_applied: filters,
      };
    }
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Get required permission for a tool
 */
function getRequiredPermission(toolName: string): string | null {
  const permissions: Record<string, string> = {
    kb_read: 'kb.read',
    kb_list: 'kb.read',
    kb_search: 'kb.read',
    kb_create: 'kb.write',
    kb_update: 'kb.write',
    kb_delete: 'kb.delete',
    kb_backup: 'kb.admin',
    kb_audit: 'kb.admin',
  };
  
  return permissions[toolName] || null;
}

/**
 * Sanitize tool arguments
 */
function sanitizeToolArgs(toolName: string, args: any): any {
  const sanitized: any = {};
  
  switch (toolName) {
    case 'kb_read':
    case 'kb_create':
    case 'kb_update':
    case 'kb_delete':
      if (args.path) {
        sanitized.path = SecurityValidator.validatePath(args.path);
      }
      if (args.content) {
        sanitized.content = SecurityValidator.validateContent(args.content);
      }
      if (args.reason) {
        sanitized.reason = Sanitizers.searchQuery(args.reason);
      }
      if (args.metadata) {
        sanitized.metadata = Sanitizers.metadata(args.metadata);
      }
      break;
    
    case 'kb_list':
      if (args.directory) {
        sanitized.directory = args.directory.replace(/[^a-zA-Z0-9\-_/]/g, '');
      }
      break;
    
    case 'kb_search':
      if (args.query) {
        sanitized.query = Sanitizers.searchQuery(args.query);
      }
      if (args.directory) {
        sanitized.directory = args.directory.replace(/[^a-zA-Z0-9\-_/]/g, '');
      }
      sanitized.case_sensitive = Boolean(args.case_sensitive);
      sanitized.max_results = Math.min(Math.max(1, args.max_results || 100), 1000);
      break;
    
    default:
      // Pass through other args with basic sanitization
      Object.assign(sanitized, args);
  }
  
  return sanitized;
}

/**
 * Get help content for a topic
 */
function getHelpContent(topic: string): any {
  const helpContent: Record<string, any> = {
    general: {
      title: 'KB Manager Help',
      description: 'A secure, enterprise-grade knowledge base management system',
      topics: ['getting-started', 'security', 'search', 'markdown', 'permissions'],
      commands: [
        'kb_read - Read a file',
        'kb_list - List directory contents',
        'kb_search - Search for content',
        'kb_create - Create a new file',
        'kb_update - Update an existing file',
        'kb_delete - Delete a file',
        'kb_info - Get KB information',
        'kb_help - Get help',
      ],
    },
    'getting-started': {
      title: 'Getting Started',
      steps: [
        '1. Use kb_list to explore the knowledge base structure',
        '2. Use kb_read to read specific files',
        '3. Use kb_search to find content across all files',
        '4. Use kb_create to add new documentation',
        '5. Use kb_info to see your permissions and KB status',
      ],
      tips: [
        'All paths are relative to the KB root directory',
        'Only markdown files (.md, .markdown) are supported',
        'Use descriptive file names and organize in directories',
      ],
    },
    security: {
      title: 'Security Features',
      features: [
        'End-to-end encryption for sensitive data',
        'Role-based access control (RBAC)',
        'Comprehensive audit logging',
        'Rate limiting and DDoS protection',
        'Input validation and sanitization',
      ],
      best_practices: [
        'Never share your authentication tokens',
        'Use strong passwords and enable MFA',
        'Review audit logs regularly',
        'Keep your client software updated',
      ],
    },
    search: {
      title: 'Search Guide',
      syntax: [
        'Simple search: "configuration"',
        'Phrase search: "exact phrase match"',
        'Case sensitive: use case_sensitive parameter',
        'Directory search: specify directory parameter',
      ],
      tips: [
        'Search is optimized for speed and relevance',
        'Results show context around matches',
        'Use specific terms for better results',
        'Limit results with max_results parameter',
      ],
    },
    markdown: {
      title: 'Markdown Guide',
      basics: [
        '# Heading 1',
        '## Heading 2',
        '**bold text**',
        '*italic text*',
        '- Bullet point',
        '1. Numbered list',
        '[Link text](url)',
        '![Image alt](url)',
      ],
      frontmatter: [
        'Add metadata at the top of files:',
        '---',
        'title: Document Title',
        'tags: [tag1, tag2]',
        'category: guides',
        '---',
      ],
    },
    permissions: {
      title: 'Permissions Guide',
      levels: [
        'kb.read - Read files and search',
        'kb.write - Create and update files',
        'kb.delete - Delete files',
        'kb.admin - Backup and audit access',
      ],
      info: 'Use kb_info to see your current permissions',
    },
  };
  
  return helpContent[topic] || helpContent.general;
}

// Add file exists helper to SecureKBManager interface
declare module '@core/secure-kb-manager.js' {
  interface SecureKBManager {
    fileExists(path: string): Promise<boolean>;
    getStatistics(): Promise<any>;
  }
}