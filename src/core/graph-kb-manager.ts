/**
 * Graph-based Knowledge Base Manager
 * Replaces file-based storage with graph-based persistent memory
 */

import { UnifiedMemory, UnifiedMemoryConfig } from '@graph/index.js';
import { Node, NodeType, SearchOptions, GraphQueryResult } from '@graph/types.js';
import { Result } from '../types/index.js';
import { KBFile, KBDirectory, SearchResult, KBCategory, KB_CATEGORIES } from './types.js';

export class GraphKBManager {
  private memory: UnifiedMemory;
  private initialized = false;

  constructor(config: UnifiedMemoryConfig) {
    this.memory = new UnifiedMemory(config);
  }

  /**
   * Initialize the graph-based KB
   */
  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return { success: true, data: undefined };
    }

    const result = await this.memory.initialize();
    
    if (result.success) {
      this.initialized = true;
    }
    
    return result;
  }

  /**
   * Check if a file exists in the knowledge graph
   */
  async exists(filePath: string): Promise<boolean> {
    const result = await this.memory.graph.query(
      'MATCH (d:Document {path: $path}) RETURN d',
      { path: filePath }
    );
    
    return result.success && result.data && result.data.length > 0;
  }

  /**
   * Read a file from the knowledge graph
   */
  async readFile(filePath: string): Promise<KBFile> {
    this.ensureInitialized();
    
    const result = await this.memory.graph.query(
      'MATCH (d:Document {path: $path}) RETURN d',
      { path: filePath }
    );
    
    if (!result.success || !result.data || result.data.length === 0) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const node = result.data[0].d;
    
    // Update access information
    await this.memory.graph.reinforce(node.id);
    
    return {
      path: filePath,
      content: node.content,
      metadata: {
        title: node.title,
        author: node.author,
        summary: node.summary,
        keywords: node.keywords,
        language: node.language,
        created: node.created_at,
        lastUpdated: node.updated_at,
        ...node.metadata,
      },
    };
  }

  /**
   * Write or update a file in the knowledge graph
   */
  async writeFile(filePath: string, content: string, metadata?: Record<string, any>): Promise<void> {
    this.ensureInitialized();
    
    // Check if file already exists
    const exists = await this.exists(filePath);
    
    if (exists) {
      // Update existing document
      const existingResult = await this.memory.graph.query(
        'MATCH (d:Document {path: $path}) RETURN d',
        { path: filePath }
      );
      
      if (existingResult.success && existingResult.data && existingResult.data.length > 0) {
        const nodeId = existingResult.data[0].d.id;
        
        await this.memory.graph.update(nodeId, {
          content,
          title: metadata?.title || this.extractTitle(content),
          summary: metadata?.summary || this.extractSummary(content),
          keywords: metadata?.keywords || this.extractKeywords(content),
          updated_at: new Date().toISOString(),
          metadata: metadata || {},
        });
      }
    } else {
      // Create new document
      await this.memory.store(content, {
        type: NodeType.DOCUMENT,
        path: filePath,
        title: metadata?.title || this.extractTitle(content),
        author: metadata?.author,
        summary: metadata?.summary || this.extractSummary(content),
        keywords: metadata?.keywords || this.extractKeywords(content),
        language: metadata?.language || 'en',
        metadata: metadata || {},
      });
    }
  }

  /**
   * Delete a file from the knowledge graph
   */
  async deleteFile(filePath: string): Promise<void> {
    this.ensureInitialized();
    
    const result = await this.memory.graph.query(
      'MATCH (d:Document {path: $path}) RETURN d.id as id',
      { path: filePath }
    );
    
    if (!result.success || !result.data || result.data.length === 0) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const nodeId = result.data[0].id;
    await this.memory.graph.forget(nodeId);
  }

  /**
   * List files in a directory structure
   */
  async listDirectory(dirPath: string = ''): Promise<KBDirectory> {
    this.ensureInitialized();
    
    // Get all documents
    const result = await this.memory.graph.query(
      'MATCH (d:Document) RETURN d.path as path, d.title as title ORDER BY d.path'
    );
    
    if (!result.success || !result.data) {
      throw new Error('Failed to list directory');
    }
    
    // Build directory structure
    const files: string[] = [];
    const subdirectories: Map<string, KBDirectory> = new Map();
    
    for (const row of result.data) {
      const fullPath = row.path;
      
      // Filter by directory path
      if (dirPath && !fullPath.startsWith(dirPath)) {
        continue;
      }
      
      // Get relative path
      const relativePath = dirPath ? fullPath.substring(dirPath.length + 1) : fullPath;
      
      if (relativePath.includes('/')) {
        // This is in a subdirectory
        const parts = relativePath.split('/');
        const subDirName = parts[0];
        
        if (!subdirectories.has(subDirName)) {
          subdirectories.set(subDirName, {
            name: subDirName,
            path: dirPath ? `${dirPath}/${subDirName}` : subDirName,
            files: [],
            subdirectories: [],
          });
        }
      } else {
        // This is a file in the current directory
        files.push(relativePath);
      }
    }
    
    // Recursively build subdirectories
    const subdirectoriesArray: KBDirectory[] = [];
    for (const [subDirName, subDir] of subdirectories) {
      const fullSubDir = await this.listDirectory(subDir.path);
      subdirectoriesArray.push(fullSubDir);
    }
    
    return {
      name: dirPath ? dirPath.split('/').pop() || dirPath : 'root',
      path: dirPath,
      files: files.sort(),
      subdirectories: subdirectoriesArray.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Search for content in the knowledge graph
   */
  async search(query: string, directory?: string): Promise<SearchResult[]> {
    this.ensureInitialized();
    
    // Use hybrid search for better results
    const searchOptions: SearchOptions = {
      limit: 50,
      semantic_threshold: 0.7,
    };
    
    if (directory) {
      // Add path filtering
      searchOptions.node_types = [NodeType.DOCUMENT];
    }
    
    const result = await this.memory.search(query, {
      ...searchOptions,
      useVector: true,
      useGraph: true,
    });
    
    if (!result.success) {
      throw new Error(`Search failed: ${result.error}`);
    }
    
    const searchResults: SearchResult[] = [];
    
    for (const node of result.data.nodes) {
      if (node.type === NodeType.DOCUMENT) {
        const doc = node as any;
        
        // Filter by directory if specified
        if (directory && !doc.path.startsWith(directory)) {
          continue;
        }
        
        // Find matches in content
        const matches = this.findMatches(doc.content, query);
        
        if (matches.length > 0) {
          searchResults.push({
            file: doc.path,
            matches,
          });
        }
      }
    }
    
    return searchResults;
  }

  /**
   * Get semantic search results
   */
  async semanticSearch(query: string, limit: number = 10): Promise<{
    nodes: Node[];
    similarities: number[];
  }> {
    this.ensureInitialized();
    
    const result = await this.memory.vector.semanticSearch(query, limit);
    
    if (!result.success) {
      throw new Error(`Semantic search failed: ${result.error}`);
    }
    
    return {
      nodes: result.data.map(item => item.node),
      similarities: result.data.map(item => item.similarity),
    };
  }

  /**
   * Find related documents
   */
  async findRelated(filePath: string, limit: number = 10): Promise<KBFile[]> {
    this.ensureInitialized();
    
    // Get the document node
    const docResult = await this.memory.graph.query(
      'MATCH (d:Document {path: $path}) RETURN d',
      { path: filePath }
    );
    
    if (!docResult.success || !docResult.data || docResult.data.length === 0) {
      throw new Error(`Document not found: ${filePath}`);
    }
    
    const doc = docResult.data[0].d;
    
    // Find related nodes
    const relatedResult = await this.memory.graph.findRelated(doc.id, 2);
    
    if (!relatedResult.success) {
      throw new Error(`Failed to find related documents: ${relatedResult.error}`);
    }
    
    const relatedFiles: KBFile[] = [];
    
    for (const node of relatedResult.data.nodes) {
      if (node.type === NodeType.DOCUMENT && node.id !== doc.id) {
        const relatedDoc = node as any;
        relatedFiles.push({
          path: relatedDoc.path,
          content: relatedDoc.content,
          metadata: {
            title: relatedDoc.title,
            author: relatedDoc.author,
            summary: relatedDoc.summary,
            keywords: relatedDoc.keywords,
            language: relatedDoc.language,
            created: relatedDoc.created_at,
            lastUpdated: relatedDoc.updated_at,
            ...relatedDoc.metadata,
          },
        });
      }
    }
    
    return relatedFiles.slice(0, limit);
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    total_documents: number;
    total_concepts: number;
    total_facts: number;
    total_connections: number;
    memory_usage: any;
  }> {
    this.ensureInitialized();
    
    const stats = await this.memory.getStats();
    
    if (!stats.success) {
      throw new Error(`Failed to get stats: ${stats.error}`);
    }
    
    return {
      total_documents: stats.data.graph.total_nodes || 0,
      total_concepts: 0, // Calculate from node types
      total_facts: 0,    // Calculate from node types
      total_connections: stats.data.graph.total_edges || 0,
      memory_usage: stats.data,
    };
  }

  /**
   * Get categories (maintained for compatibility)
   */
  getCategories(): readonly KBCategory[] {
    return KB_CATEGORIES;
  }

  /**
   * Validate category (maintained for compatibility)
   */
  isValidCategory(filePath: string): boolean {
    const parts = filePath.split('/');
    if (parts.length === 0) return true;
    
    const category = parts[0] as KBCategory;
    return KB_CATEGORIES.includes(category);
  }

  /**
   * Export knowledge graph
   */
  async exportGraph(format: 'json' | 'cypher' | 'graphml' = 'json'): Promise<string> {
    this.ensureInitialized();
    
    const result = await this.memory.export(format);
    
    if (!result.success) {
      throw new Error(`Export failed: ${result.error}`);
    }
    
    return result.data;
  }

  /**
   * Import knowledge graph
   */
  async importGraph(data: string, format: 'json' | 'cypher' | 'graphml' = 'json'): Promise<void> {
    this.ensureInitialized();
    
    const result = await this.memory.import(data, format);
    
    if (!result.success) {
      throw new Error(`Import failed: ${result.error}`);
    }
  }

  /**
   * Shutdown the memory system
   */
  async shutdown(): Promise<void> {
    await this.memory.shutdown();
    this.initialized = false;
  }

  /**
   * Ensure the system is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('GraphKBManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Extract title from content
   */
  private extractTitle(content: string): string {
    const lines = content.split('\n');
    
    // Look for first heading
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.substring(2).trim();
      }
    }
    
    // Use first line if no heading found
    return lines[0]?.trim().substring(0, 50) || 'Untitled';
  }

  /**
   * Extract summary from content
   */
  private extractSummary(content: string): string {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    // Skip title line and get first paragraph
    let startIndex = 0;
    if (nonEmptyLines[0]?.trim().startsWith('# ')) {
      startIndex = 1;
    }
    
    const summaryLines = nonEmptyLines.slice(startIndex, startIndex + 3);
    return summaryLines.join(' ').substring(0, 200) + '...';
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - in production, use NLP
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Get word frequencies
    const frequencies: Record<string, number> = {};
    for (const word of words) {
      frequencies[word] = (frequencies[word] || 0) + 1;
    }
    
    // Return top keywords
    return Object.entries(frequencies)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Find matches in content
   */
  private findMatches(content: string, query: string): SearchResult['matches'] {
    const lines = content.split('\n');
    const matches: SearchResult['matches'] = [];
    const queryLower = query.toLowerCase();
    
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(queryLower)) {
        // Get context (2 lines before and after)
        const contextStart = Math.max(0, index - 2);
        const contextEnd = Math.min(lines.length - 1, index + 2);
        const context = lines.slice(contextStart, contextEnd + 1).join('\n');
        
        matches.push({
          line: index + 1,
          content: line,
          context,
        });
      }
    });
    
    return matches;
  }
}