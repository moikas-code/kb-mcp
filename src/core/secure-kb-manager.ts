/**
 * Secure Knowledge Base Manager
 * Enhanced version with security, audit logging, and encryption
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import simpleGit from 'simple-git';
import { 
  KBFile, 
  KBDirectory, 
  SearchResult, 
  SecurityContext,
  AuditEvent,
  Result,
  EncryptedData
} from '../types/index.js';
import { 
  SecurityValidator, 
  EncryptionService, 
  RateLimiter,
  Sanitizers,
  KBSecurityError 
} from './security.js';
import { AuditLogger } from './audit.js';

export interface SecureKBManagerOptions {
  kbPath: string;
  encryptionKey?: string;
  enableAudit?: boolean;
  enableVersioning?: boolean;
  enableEncryption?: boolean;
  rateLimiting?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Secure KB Manager with full security features
 */
export class SecureKBManager {
  private readonly options: Required<SecureKBManagerOptions>;
  private readonly auditLogger?: AuditLogger;
  private readonly git?: ReturnType<typeof simpleGit>;
  
  constructor(options: SecureKBManagerOptions) {
    this.options = {
      kbPath: options.kbPath,
      encryptionKey: options.encryptionKey || '',
      enableAudit: options.enableAudit ?? true,
      enableVersioning: options.enableVersioning ?? true,
      enableEncryption: options.enableEncryption ?? false,
      rateLimiting: options.rateLimiting || {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
      },
    };
    
    // Initialize audit logger if enabled
    if (this.options.enableAudit) {
      this.auditLogger = new AuditLogger(
        {
          audit: {
            enabled: true,
            retention_days: 548,
            destinations: ['file'],
            encryption_required: true,
          },
          gdpr: {
            pii_detection: true,
            anonymization_delay: '24h',
            right_to_erasure: true,
            data_portability: true,
          },
          data_classification: {
            enabled: true,
            levels: ['public', 'internal', 'confidential', 'restricted'],
            default_level: 'internal',
          },
        },
        path.join(this.options.kbPath, '.audit'),
        this.options.encryptionKey
      );
    }
    
    // Initialize git if versioning is enabled
    if (this.options.enableVersioning) {
      this.git = simpleGit(this.options.kbPath);
    }
  }

  /**
   * Initialize the KB directory
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Create KB directory
      await fs.mkdir(this.options.kbPath, { recursive: true });
      
      // Create audit directory
      if (this.options.enableAudit) {
        await fs.mkdir(path.join(this.options.kbPath, '.audit'), { recursive: true });
      }
      
      // Initialize git repository
      if (this.options.enableVersioning && this.git) {
        const isRepo = await this.git.checkIsRepo();
        if (!isRepo) {
          await this.git.init();
          await this.git.add('.gitignore');
          await this.git.commit('Initial KB repository');
        }
      }
      
      // Create default .gitignore
      const gitignorePath = path.join(this.options.kbPath, '.gitignore');
      const gitignoreContent = `.audit/\n.encryption/\n*.key\n*.bak\n`;
      await fs.writeFile(gitignorePath, gitignoreContent, 'utf8');
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'InitializationError',
          message: `Failed to initialize KB: ${error}`,
          code: 'INIT_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Read a file with security checks and audit logging
   */
  async readFile(
    filePath: string,
    context: SecurityContext
  ): Promise<Result<KBFile>> {
    // Rate limiting
    if (this.checkRateLimit(context)) {
      return {
        success: false,
        error: {
          name: 'RateLimitError',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          isOperational: true,
        }
      };
    }
    
    try {
      // Validate path
      const validPath = SecurityValidator.validatePath(filePath);
      const fullPath = this.resolvePath(validPath);
      
      // Check file exists
      const exists = await this.fileExists(fullPath);
      if (!exists) {
        await this.logAudit({
          event_type: 'data_access',
          action: 'read_file',
          resource: filePath,
          result: 'failure',
          metadata: { reason: 'file_not_found' },
        }, context);
        
        return {
          success: false,
          error: {
            name: 'NotFoundError',
            message: 'File not found',
            code: 'FILE_NOT_FOUND',
            statusCode: 404,
            isOperational: true,
          }
        };
      }
      
      // Read file content
      let content = await fs.readFile(fullPath, 'utf-8');
      
      // Decrypt if needed
      if (this.options.enableEncryption && this.isEncrypted(content)) {
        const decrypted = await this.decryptContent(content);
        if (!decrypted.success) {
          await this.logAudit({
            event_type: 'security',
            action: 'decrypt_file',
            resource: filePath,
            result: 'failure',
            severity: 'high',
          }, context);
          
          return decrypted;
        }
        content = decrypted.data;
      }
      
      // Parse frontmatter
      const parsed = matter(content);
      
      // Sanitize metadata
      const sanitizedMetadata = Sanitizers.metadata(parsed.data);
      
      // Log successful access
      await this.logAudit({
        event_type: 'data_access',
        action: 'read_file',
        resource: filePath,
        result: 'success',
        metadata: {
          file_size: Buffer.byteLength(content, 'utf8'),
          has_metadata: Object.keys(parsed.data).length > 0,
        },
      }, context);
      
      return {
        success: true,
        data: {
          path: filePath,
          content: parsed.content,
          metadata: sanitizedMetadata,
        },
      };
    } catch (error) {
      await this.logAudit({
        event_type: 'error',
        action: 'read_file',
        resource: filePath,
        result: 'error',
        metadata: { error: String(error) },
      }, context);
      
      return {
        success: false,
        error: {
          name: 'ReadError',
          message: `Failed to read file: ${error}`,
          code: 'READ_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Write a file with security checks and versioning
   */
  async writeFile(
    filePath: string,
    content: string,
    context: SecurityContext
  ): Promise<Result<void>> {
    // Rate limiting
    if (this.checkRateLimit(context)) {
      return {
        success: false,
        error: {
          name: 'RateLimitError',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          isOperational: true,
        }
      };
    }
    
    try {
      // Validate inputs
      const validPath = SecurityValidator.validatePath(filePath);
      const validContent = SecurityValidator.validateContent(content);
      const fullPath = this.resolvePath(validPath);
      
      // Check if this is an update or create
      const exists = await this.fileExists(fullPath);
      const action = exists ? 'update_file' : 'create_file';
      
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Parse and enhance metadata
      const parsed = matter(validContent);
      parsed.data.lastUpdated = new Date().toISOString();
      parsed.data.updatedBy = context.user_id;
      
      if (!exists) {
        parsed.data.createdAt = parsed.data.lastUpdated;
        parsed.data.createdBy = context.user_id;
      }
      
      // Prepare content
      let finalContent = matter.stringify(parsed.content, parsed.data);
      
      // Encrypt if enabled
      if (this.options.enableEncryption && this.options.encryptionKey) {
        const encrypted = await EncryptionService.encrypt(
          finalContent,
          this.options.encryptionKey,
          filePath
        );
        finalContent = JSON.stringify(encrypted);
      }
      
      // Create backup if updating
      if (exists && this.options.enableVersioning) {
        const backupPath = `${fullPath}.bak.${Date.now()}`;
        await fs.copyFile(fullPath, backupPath);
      }
      
      // Write file
      await fs.writeFile(fullPath, finalContent, 'utf-8');
      
      // Version control
      if (this.options.enableVersioning && this.git) {
        await this.git.add(validPath);
        await this.git.commit(`${action}: ${validPath} by ${context.user_id}`);
      }
      
      // Log audit event
      await this.logAudit({
        event_type: 'data_access',
        action,
        resource: filePath,
        result: 'success',
        metadata: {
          file_size: Buffer.byteLength(finalContent, 'utf8'),
          encrypted: this.options.enableEncryption,
          versioned: this.options.enableVersioning,
        },
      }, context);
      
      return { success: true, data: undefined };
    } catch (error) {
      await this.logAudit({
        event_type: 'error',
        action: 'write_file',
        resource: filePath,
        result: 'error',
        metadata: { error: String(error) },
      }, context);
      
      return {
        success: false,
        error: {
          name: 'WriteError',
          message: `Failed to write file: ${error}`,
          code: 'WRITE_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Delete a file with security checks
   */
  async deleteFile(
    filePath: string,
    context: SecurityContext
  ): Promise<Result<void>> {
    // Rate limiting
    if (this.checkRateLimit(context)) {
      return {
        success: false,
        error: {
          name: 'RateLimitError',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          isOperational: true,
        }
      };
    }
    
    try {
      // Validate path
      const validPath = SecurityValidator.validatePath(filePath);
      const fullPath = this.resolvePath(validPath);
      
      // Check file exists
      const exists = await this.fileExists(fullPath);
      if (!exists) {
        return {
          success: false,
          error: {
            name: 'NotFoundError',
            message: 'File not found',
            code: 'FILE_NOT_FOUND',
            statusCode: 404,
            isOperational: true,
          }
        };
      }
      
      // Create backup before deletion
      if (this.options.enableVersioning) {
        const backupDir = path.join(this.options.kbPath, '.deleted');
        await fs.mkdir(backupDir, { recursive: true });
        
        const backupPath = path.join(
          backupDir,
          `${path.basename(fullPath)}.${Date.now()}`
        );
        await fs.copyFile(fullPath, backupPath);
      }
      
      // Delete file
      await fs.unlink(fullPath);
      
      // Version control
      if (this.options.enableVersioning && this.git) {
        await this.git.rm(validPath);
        await this.git.commit(`Delete: ${validPath} by ${context.user_id}`);
      }
      
      // Log audit event
      await this.logAudit({
        event_type: 'data_access',
        action: 'delete_file',
        resource: filePath,
        result: 'success',
        severity: 'high',
        metadata: {
          backup_created: this.options.enableVersioning,
        },
      }, context);
      
      return { success: true, data: undefined };
    } catch (error) {
      await this.logAudit({
        event_type: 'error',
        action: 'delete_file',
        resource: filePath,
        result: 'error',
        metadata: { error: String(error) },
      }, context);
      
      return {
        success: false,
        error: {
          name: 'DeleteError',
          message: `Failed to delete file: ${error}`,
          code: 'DELETE_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * List directory contents with security
   */
  async listDirectory(
    dirPath: string = '',
    context: SecurityContext
  ): Promise<Result<KBDirectory>> {
    // Rate limiting
    if (this.checkRateLimit(context)) {
      return {
        success: false,
        error: {
          name: 'RateLimitError',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          isOperational: true,
        }
      };
    }
    
    try {
      const fullPath = this.resolvePath(dirPath);
      
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: {
            name: 'NotDirectoryError',
            message: 'Path is not a directory',
            code: 'NOT_DIRECTORY',
            statusCode: 400,
            isOperational: true,
          }
        };
      }
      
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      const files: string[] = [];
      const subdirectories: KBDirectory[] = [];
      
      for (const entry of entries) {
        // Skip hidden files and audit/backup directories
        if (entry.name.startsWith('.')) continue;
        
        if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(entry.name);
        } else if (entry.isDirectory()) {
          const subDirResult = await this.listDirectory(
            path.join(dirPath, entry.name),
            context
          );
          if (subDirResult.success) {
            subdirectories.push(subDirResult.data);
          }
        }
      }
      
      // Log audit event
      await this.logAudit({
        event_type: 'data_access',
        action: 'list_directory',
        resource: dirPath || '/',
        result: 'success',
        metadata: {
          file_count: files.length,
          directory_count: subdirectories.length,
        },
      }, context);
      
      return {
        success: true,
        data: {
          name: path.basename(fullPath) || 'root',
          path: dirPath,
          files: files.sort(),
          subdirectories: subdirectories.sort((a, b) => 
            a.name.localeCompare(b.name)
          ),
        },
      };
    } catch (error) {
      await this.logAudit({
        event_type: 'error',
        action: 'list_directory',
        resource: dirPath || '/',
        result: 'error',
        metadata: { error: String(error) },
      }, context);
      
      return {
        success: false,
        error: {
          name: 'ListError',
          message: `Failed to list directory: ${error}`,
          code: 'LIST_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Search with security and performance limits
   */
  async search(
    query: string,
    context: SecurityContext,
    options?: {
      directory?: string;
      maxResults?: number;
      caseSensitive?: boolean;
    }
  ): Promise<Result<SearchResult[]>> {
    // Rate limiting (more restrictive for search)
    if (RateLimiter.isRateLimited(
      context.user_id,
      'search',
      10, // 10 searches
      60000 // per minute
    )) {
      return {
        success: false,
        error: {
          name: 'RateLimitError',
          message: 'Search rate limit exceeded',
          code: 'SEARCH_RATE_LIMIT',
          statusCode: 429,
          isOperational: true,
        }
      };
    }
    
    try {
      // Sanitize query
      const sanitizedQuery = Sanitizers.searchQuery(query);
      if (!sanitizedQuery) {
        return {
          success: false,
          error: {
            name: 'ValidationError',
            message: 'Invalid search query',
            code: 'INVALID_QUERY',
            statusCode: 400,
            isOperational: true,
          }
        };
      }
      
      const searchPath = options?.directory
        ? this.resolvePath(options.directory)
        : this.options.kbPath;
      
      const pattern = path.join(searchPath, '**/*.md');
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/.audit/**'],
      });
      
      const results: SearchResult[] = [];
      const maxResults = options?.maxResults || 100;
      const queryLower = options?.caseSensitive
        ? sanitizedQuery
        : sanitizedQuery.toLowerCase();
      
      let totalMatches = 0;
      
      fileLoop: for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        
        // Decrypt if needed
        let searchContent = content;
        if (this.options.enableEncryption && this.isEncrypted(content)) {
          const decrypted = await this.decryptContent(content);
          if (!decrypted.success) continue;
          searchContent = decrypted.data;
        }
        
        const lines = searchContent.split('\n');
        const matches: SearchResult['matches'] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = options?.caseSensitive
            ? lines[i]
            : lines[i].toLowerCase();
          
          if (line.includes(queryLower)) {
            // Get context
            const contextStart = Math.max(0, i - 2);
            const contextEnd = Math.min(lines.length - 1, i + 2);
            const context = lines
              .slice(contextStart, contextEnd + 1)
              .join('\n');
            
            matches.push({
              line: i + 1,
              content: lines[i].substring(0, 200), // Limit line length
              context: context.substring(0, 500), // Limit context
            });
            
            totalMatches++;
            if (totalMatches >= maxResults) {
              break fileLoop;
            }
          }
        }
        
        if (matches.length > 0) {
          const relativePath = path.relative(this.options.kbPath, file);
          results.push({
            file: relativePath,
            matches,
          });
        }
      }
      
      // Log audit event
      await this.logAudit({
        event_type: 'data_access',
        action: 'search',
        resource: options?.directory || '/',
        result: 'success',
        metadata: {
          query: sanitizedQuery.substring(0, 100),
          result_count: results.length,
          match_count: totalMatches,
        },
      }, context);
      
      return { success: true, data: results };
    } catch (error) {
      await this.logAudit({
        event_type: 'error',
        action: 'search',
        resource: options?.directory || '/',
        result: 'error',
        metadata: { error: String(error) },
      }, context);
      
      return {
        success: false,
        error: {
          name: 'SearchError',
          message: `Search failed: ${error}`,
          code: 'SEARCH_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  // Helper methods

  private resolvePath(relativePath: string): string {
    const fullPath = path.resolve(this.options.kbPath, relativePath);
    
    // Ensure path is within KB directory
    if (!fullPath.startsWith(this.options.kbPath)) {
      throw new KBSecurityError(
        'Path traversal detected',
        'PATH_TRAVERSAL'
      );
    }
    
    return fullPath;
  }

  private async fileExists(fullPath: string): Promise<boolean> {
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private isEncrypted(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      return parsed.algorithm && parsed.ciphertext && parsed.iv;
    } catch {
      return false;
    }
  }

  private async decryptContent(content: string): Promise<Result<string>> {
    if (!this.options.encryptionKey) {
      return {
        success: false,
        error: {
          name: 'DecryptionError',
          message: 'Encryption key not configured',
          code: 'NO_ENCRYPTION_KEY',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
    
    try {
      const encrypted = JSON.parse(content) as EncryptedData;
      const decrypted = await EncryptionService.decrypt(
        encrypted,
        this.options.encryptionKey
      );
      return { success: true, data: decrypted };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DecryptionError',
          message: `Failed to decrypt content: ${error}`,
          code: 'DECRYPTION_FAILED',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  private checkRateLimit(context: SecurityContext): boolean {
    return RateLimiter.isRateLimited(
      context.user_id,
      'kb_operation',
      this.options.rateLimiting.maxRequests,
      this.options.rateLimiting.windowMs
    );
  }

  private async logAudit(
    event: Partial<AuditEvent>,
    context: SecurityContext
  ): Promise<void> {
    if (this.auditLogger) {
      await this.auditLogger.log(event, context);
    }
  }
}