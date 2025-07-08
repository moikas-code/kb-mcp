/**
 * Filesystem Storage Backend
 * Implements file-based storage for the KB system
 */

import { promises as fs } from 'fs';
import path from 'path';
// Note: Using require for compatibility with current setup
const glob = require('glob');
const matter = require('gray-matter');
import { StorageBackend, SearchOptions, BackendConfig } from './storage-interface.js';
import { KBFile, KBDirectory, SearchResult, KBCategory, KB_CATEGORIES, ImplementationStatus, KnownIssue, BackendExport } from './types.js';
import { Result } from '../types/index.js';

export class FilesystemBackend implements StorageBackend {
  private readonly kbPath: string;
  private initialized = false;

  constructor(private config: BackendConfig) {
    if (config.type !== 'filesystem') {
      throw new Error('Invalid backend type for FilesystemBackend');
    }
    this.kbPath = config.filesystem?.root_path || path.join(process.cwd(), 'kb');
  }

  async initialize(): Promise<Result<void>> {
    try {
      await fs.access(this.kbPath);
      this.initialized = true;
      return { success: true, data: undefined };
    } catch (error) {
      try {
        await fs.mkdir(this.kbPath, { recursive: true });
        this.initialized = true;
        return { success: true, data: undefined };
      } catch (mkdirError) {
        return {
          success: false,
          error: {
            name: 'InitializationError',
            message: `Failed to initialize filesystem backend: ${mkdirError}`,
            code: 'FS_INIT_FAILED',
            statusCode: 500,
            isOperational: true
          }
        };
      }
    }
  }

  async healthCheck(): Promise<Result<{ status: string; details: Record<string, any> }>> {
    try {
      const stats = await fs.stat(this.kbPath);
      const files = await glob('**/*.md', { cwd: this.kbPath });
      
      return {
        success: true,
        data: {
          status: 'healthy',
          details: {
            backend_type: 'filesystem',
            kb_path: this.kbPath,
            accessible: true,
            total_files: files.length,
            last_modified: stats.mtime,
            size_on_disk: stats.size
          }
        }
      };
    } catch (error) {
      return {
        success: true,
        data: {
          status: 'unhealthy',
          details: {
            backend_type: 'filesystem',
            kb_path: this.kbPath,
            accessible: false,
            error: error.message
          }
        }
      };
    }
  }

  getBackendType(): 'filesystem' | 'graph' {
    return 'filesystem';
  }

  getConfiguration(): Record<string, any> {
    return {
      type: 'filesystem',
      kb_path: this.kbPath,
      versioning: this.config.filesystem?.enable_versioning || false,
      compression: this.config.filesystem?.enable_compression || false
    };
  }

  /**
   * Validate and normalize a path within the KB directory
   */
  private validatePath(filePath: string): string {
    const cleanPath = filePath.replace(/^\/+/, '');
    const fullPath = path.resolve(this.kbPath, cleanPath);
    
    if (!fullPath.startsWith(this.kbPath)) {
      throw new Error('Path traversal attempt detected');
    }
    
    return fullPath;
  }

  /**
   * Categorize a file based on its path
   */
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
      const fullPath = this.validatePath(filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      
      // Parse frontmatter if it exists
      const parsed = matter(content);
      
      return {
        success: true,
        data: {
          path: filePath,
          content: parsed.content,
          metadata: parsed.data,
          category: this.categorizeFile(filePath),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'FileReadError',
          message: `Failed to read file ${filePath}: ${error.message}`,
          code: 'FILE_READ_FAILED',
          statusCode: 404,
          isOperational: true
        }
      };
    }
  }

  async writeFile(filePath: string, content: string, metadata?: Record<string, any>): Promise<Result<void>> {
    try {
      const fullPath = this.validatePath(filePath);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Add frontmatter if metadata is provided
      let finalContent = content;
      if (metadata && Object.keys(metadata).length > 0) {
        finalContent = matter.stringify(content, metadata);
      }
      
      await fs.writeFile(fullPath, finalContent, 'utf-8');
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'FileWriteError',
          message: `Failed to write file ${filePath}: ${error.message}`,
          code: 'FILE_WRITE_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async deleteFile(filePath: string): Promise<Result<void>> {
    try {
      const fullPath = this.validatePath(filePath);
      await fs.unlink(fullPath);
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'FileDeleteError',
          message: `Failed to delete file ${filePath}: ${error.message}`,
          code: 'FILE_DELETE_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async listFiles(directory?: string): Promise<Result<KBDirectory>> {
    try {
      const searchPath = directory ? this.validatePath(directory) : this.kbPath;
      const pattern = path.join(searchPath, '**/*.md');
      const files = await glob(pattern, { ignore: ['node_modules/**', '.git/**'] });
      
      const kbFiles: KBFile[] = [];
      
      for (const file of files) {
        const relativePath = path.relative(this.kbPath, file);
        const stats = await fs.stat(file);
        
        // Read just the frontmatter for metadata
        const content = await fs.readFile(file, 'utf-8');
        const parsed = matter(content);
        
        kbFiles.push({
          path: relativePath,
          content: parsed.content,
          metadata: parsed.data,
          category: this.categorizeFile(relativePath),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString()
        });
      }
      
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
      
      kbFiles.forEach(file => {
        categorizedFiles[file.category].push(file);
      });
      
      return {
        success: true,
        data: {
          path: directory || '',
          files: kbFiles,
          categories: categorizedFiles,
          total_files: kbFiles.length,
          total_size: kbFiles.reduce((sum, file) => sum + file.size, 0)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DirectoryListError',
          message: `Failed to list directory ${directory || 'root'}: ${error.message}`,
          code: 'DIR_LIST_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async searchContent(query: string, options: SearchOptions = {}): Promise<Result<SearchResult[]>> {
    try {
      const { limit = 50, category, includeContent = true, fuzzy = false } = options;
      
      // Get all files first
      const listResult = await this.listFiles();
      if (!listResult.success) {
        return listResult;
      }
      
      const files = listResult.data.files;
      const results: SearchResult[] = [];
      
      for (const file of files) {
        // Filter by category if specified
        if (category && file.category !== category) {
          continue;
        }
        
        // Search in content and metadata
        const searchableText = includeContent 
          ? `${file.content} ${JSON.stringify(file.metadata)}`
          : JSON.stringify(file.metadata);
        
        const queryLower = query.toLowerCase();
        const textLower = searchableText.toLowerCase();
        
        let score = 0;
        let matches: string[] = [];
        
        if (fuzzy) {
          // Simple fuzzy search - count partial matches
          const queryWords = queryLower.split(/\s+/);
          queryWords.forEach(word => {
            if (textLower.includes(word)) {
              score += 1;
              matches.push(word);
            }
          });
        } else {
          // Exact phrase search
          if (textLower.includes(queryLower)) {
            score = 1;
            matches = [query];
          }
        }
        
        if (score > 0) {
          results.push({
            file,
            score,
            matches,
            snippet: this.extractSnippet(file.content, query)
          });
        }
      }
      
      // Sort by score (descending) and limit results
      results.sort((a, b) => b.score - a.score);
      
      return {
        success: true,
        data: results.slice(0, limit)
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'SearchError',
          message: `Search failed: ${error.message}`,
          code: 'SEARCH_FAILED',
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
      // Read status files to determine implementation status
      const statusFiles = [
        'status/OVERALL_STATUS.md',
        'status/ERROR_HANDLING_STATUS.md',
        'active/KNOWN_ISSUES.md'
      ];
      
      let overallCompletion = 80; // Default based on Script language status
      const phases = [
        { name: 'Lexer', status: 'completed' as const, completion: 100 },
        { name: 'Parser', status: 'completed' as const, completion: 99 },
        { name: 'Type System', status: 'completed' as const, completion: 98 },
        { name: 'Semantic Analysis', status: 'completed' as const, completion: 99 },
        { name: 'Code Generation', status: 'in_progress' as const, completion: 85 },
        { name: 'Runtime', status: 'in_progress' as const, completion: 60 },
        { name: 'Standard Library', status: 'in_progress' as const, completion: 30 },
        { name: 'Module System', status: 'blocked' as const, completion: 25, notes: 'BROKEN - blocks multi-file projects' }
      ];
      
      // Try to read actual status if available
      try {
        const statusResult = await this.readFile('status/OVERALL_STATUS.md');
        if (statusResult.success && statusResult.data.content) {
          // Parse completion percentage from content
          const match = statusResult.data.content.match(/Overall Completion.*?(\d+)%/i);
          if (match) {
            overallCompletion = parseInt(match[1]);
          }
        }
      } catch {
        // Use default if can't read status file
      }
      
      return {
        success: true,
        data: {
          overall_completion: overallCompletion,
          phases,
          critical_issues: 3, // Based on known issues
          last_updated: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'StatusError',
          message: `Failed to get status: ${error.message}`,
          code: 'STATUS_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async getIssues(): Promise<Result<KnownIssue[]>> {
    try {
      const issuesResult = await this.readFile('active/KNOWN_ISSUES.md');
      
      if (!issuesResult.success) {
        return {
          success: true,
          data: [] // Return empty array if no issues file
        };
      }
      
      // Parse known issues from markdown content
      const content = issuesResult.data.content;
      const issues: KnownIssue[] = [];
      
      // Simple parsing - look for critical issues section
      const criticalSection = content.match(/## 🚨 Critical Issues.*?(?=##|$)/s);
      if (criticalSection) {
        const issueMatches = criticalSection[0].match(/###? (.+)/g);
        if (issueMatches) {
          issueMatches.forEach((match, index) => {
            const title = match.replace(/###? /, '').trim();
            issues.push({
              id: `critical-${index + 1}`,
              title,
              description: `Critical issue in Script language implementation`,
              severity: 'critical',
              category: 'implementation',
              status: 'open',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          });
        }
      }
      
      return {
        success: true,
        data: issues
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'IssuesError',
          message: `Failed to get issues: ${error.message}`,
          code: 'ISSUES_FAILED',
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
        backend_type: 'filesystem',
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
          name: 'ExportError',
          message: `Failed to export data: ${error.message}`,
          code: 'EXPORT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  async importData(data: BackendExport): Promise<Result<void>> {
    try {
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
          name: 'ImportError',
          message: `Failed to import data: ${error.message}`,
          code: 'IMPORT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }
}