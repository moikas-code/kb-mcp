/**
 * MCP Tool implementations for Script KB
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KBManager } from './kb-manager.js';

export function createTools(_kbManager: KBManager): Tool[] {
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
    }
  ];
}

/**
 * Execute a tool with the given arguments
 */
export async function executeTool(
  toolName: string,
  args: any,
  kbManager: KBManager
): Promise<any> {
  switch (toolName) {
    case 'kb_read': {
      const file = await kbManager.readFile(args.path);
      return {
        path: file.path,
        content: file.content,
        metadata: file.metadata
      };
    }

    case 'kb_list': {
      const directory = args.directory || '';
      const listing = await kbManager.listDirectory(directory);
      return listing;
    }

    case 'kb_update': {
      // Validate category if creating a new file
      if (!await kbManager.exists(args.path)) {
        if (!kbManager.isValidCategory(args.path)) {
          const categories = kbManager.getCategories();
          throw new Error(
            `Invalid category. File must be in one of: ${categories.join(', ')}`
          );
        }
      }
      
      await kbManager.writeFile(args.path, args.content);
      return {
        success: true,
        message: `File ${args.path} updated successfully`
      };
    }

    case 'kb_delete': {
      await kbManager.deleteFile(args.path);
      return {
        success: true,
        message: `File ${args.path} deleted successfully`
      };
    }

    case 'kb_search': {
      const results = await kbManager.search(args.query, args.directory);
      return {
        query: args.query,
        results: results,
        totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0)
      };
    }

    case 'kb_status': {
      try {
        const statusFile = await kbManager.readFile('status/OVERALL_STATUS.md');
        return {
          content: statusFile.content,
          metadata: statusFile.metadata,
          summary: extractStatusSummary(statusFile.content)
        };
      } catch (error) {
        return {
          error: 'Status file not found',
          suggestion: 'Check status/OVERALL_STATUS.md'
        };
      }
    }

    case 'kb_issues': {
      try {
        const issuesFile = await kbManager.readFile('active/KNOWN_ISSUES.md');
        return {
          content: issuesFile.content,
          metadata: issuesFile.metadata,
          summary: extractIssuesSummary(issuesFile.content)
        };
      } catch (error) {
        return {
          error: 'Known issues file not found',
          suggestion: 'Check active/KNOWN_ISSUES.md'
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Extract a summary from the status file
 */
function extractStatusSummary(content: string): any {
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
function extractIssuesSummary(content: string): any {
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