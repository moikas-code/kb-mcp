/**
 * Knowledge Base management utilities
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { KBFile, KBDirectory, SearchResult, KBCategory, KB_CATEGORIES } from './types.js';

export class KBManager {
  private readonly kbPath: string;

  constructor(projectRoot: string) {
    this.kbPath = path.join(projectRoot, 'kb');
  }

  /**
   * Validate and normalize a path within the KB directory
   */
  private validatePath(filePath: string): string {
    // Remove any leading slashes
    const cleanPath = filePath.replace(/^\/+/, '');
    
    // Resolve the full path
    const fullPath = path.resolve(this.kbPath, cleanPath);
    
    // Ensure the path is within the KB directory
    if (!fullPath.startsWith(this.kbPath)) {
      throw new Error('Path traversal attempt detected');
    }
    
    return fullPath;
  }

  /**
   * Check if a path exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.validatePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file from the KB
   */
  async readFile(filePath: string): Promise<KBFile> {
    const fullPath = this.validatePath(filePath);
    
    // Ensure it's a markdown file
    if (!fullPath.endsWith('.md')) {
      throw new Error('Only markdown files are allowed');
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const parsed = matter(content);
    
    return {
      path: filePath,
      content: parsed.content,
      metadata: parsed.data
    };
  }

  /**
   * Write or update a file in the KB
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.validatePath(filePath);
    
    // Ensure it's a markdown file
    if (!fullPath.endsWith('.md')) {
      throw new Error('Only markdown files are allowed');
    }

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Add metadata if not present
    const parsed = matter(content);
    if (!parsed.data.lastUpdated) {
      parsed.data.lastUpdated = new Date().toISOString().split('T')[0];
    }

    // Write the file with frontmatter
    const output = matter.stringify(parsed.content, parsed.data);
    await fs.writeFile(fullPath, output, 'utf-8');
  }

  /**
   * Delete a file from the KB
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.validatePath(filePath);
    
    // Ensure it's a markdown file
    if (!fullPath.endsWith('.md')) {
      throw new Error('Only markdown files are allowed');
    }

    await fs.unlink(fullPath);
  }

  /**
   * List files in a directory
   */
  async listDirectory(dirPath: string = ''): Promise<KBDirectory> {
    const fullPath = this.validatePath(dirPath);
    
    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const files: string[] = [];
    const subdirectories: KBDirectory[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(entry.name);
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subDir = await this.listDirectory(path.join(dirPath, entry.name));
        subdirectories.push(subDir);
      }
    }

    return {
      name: path.basename(fullPath),
      path: dirPath,
      files: files.sort(),
      subdirectories: subdirectories.sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  /**
   * Search for content in KB files
   */
  async search(query: string, directory?: string): Promise<SearchResult[]> {
    const searchPath = directory ? this.validatePath(directory) : this.kbPath;
    const pattern = path.join(searchPath, '**/*.md');
    
    const files = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**']
    });

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      const matches: SearchResult['matches'] = [];

      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(queryLower)) {
          // Get context (2 lines before and after)
          const contextStart = Math.max(0, index - 2);
          const contextEnd = Math.min(lines.length - 1, index + 2);
          const context = lines.slice(contextStart, contextEnd + 1).join('\n');

          matches.push({
            line: index + 1,
            content: line,
            context
          });
        }
      });

      if (matches.length > 0) {
        const relativePath = path.relative(this.kbPath, file);
        results.push({
          file: relativePath,
          matches
        });
      }
    }

    return results;
  }

  /**
   * Get a list of valid KB categories
   */
  getCategories(): readonly KBCategory[] {
    return KB_CATEGORIES;
  }

  /**
   * Validate if a path belongs to a valid category
   */
  isValidCategory(filePath: string): boolean {
    const parts = filePath.split('/');
    if (parts.length === 0) return true;
    
    const category = parts[0] as KBCategory;
    return KB_CATEGORIES.includes(category);
  }
}