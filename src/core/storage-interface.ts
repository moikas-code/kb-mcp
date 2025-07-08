/**
 * Unified Storage Interface
 * Provides a common interface for both file-based and graph-based storage
 */

import { KBFile, KBDirectory, SearchResult, KBCategory } from './types.js';
import { Result } from '@types/index.js';

export interface StorageBackend {
  /**
   * Initialize the storage backend
   */
  initialize(): Promise<Result<void>>;

  /**
   * Check if the backend is healthy and operational
   */
  healthCheck(): Promise<Result<{ status: string; details: Record<string, any> }>>;

  /**
   * Read a file from storage
   */
  readFile(path: string): Promise<Result<KBFile>>;

  /**
   * Write a file to storage
   */
  writeFile(path: string, content: string, metadata?: Record<string, any>): Promise<Result<void>>;

  /**
   * Delete a file from storage
   */
  deleteFile(path: string): Promise<Result<void>>;

  /**
   * List files in a directory
   */
  listFiles(directory?: string): Promise<Result<KBDirectory>>;

  /**
   * Search for content across all files
   */
  searchContent(query: string, options?: SearchOptions): Promise<Result<SearchResult[]>>;

  /**
   * Get current implementation status
   */
  getStatus(): Promise<Result<ImplementationStatus>>;

  /**
   * Get known issues
   */
  getIssues(): Promise<Result<KnownIssue[]>>;

  /**
   * Get backend type for identification
   */
  getBackendType(): 'filesystem' | 'graph';

  /**
   * Get backend-specific configuration
   */
  getConfiguration(): Record<string, any>;

  /**
   * Export data for migration to another backend
   */
  exportData(): Promise<Result<BackendExport>>;

  /**
   * Import data from another backend
   */
  importData(data: BackendExport): Promise<Result<void>>;
}

export interface SearchOptions {
  limit?: number;
  category?: KBCategory;
  includeContent?: boolean;
  fuzzy?: boolean;
}

export interface ImplementationStatus {
  overall_completion: number;
  phases: Array<{
    name: string;
    status: 'completed' | 'in_progress' | 'pending' | 'blocked';
    completion: number;
    notes?: string;
  }>;
  critical_issues: number;
  last_updated: string;
}

export interface KnownIssue {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
  updated_at: string;
}

export interface BackendExport {
  backend_type: 'filesystem' | 'graph';
  version: string;
  exported_at: string;
  files: Array<{
    path: string;
    content: string;
    metadata: Record<string, any>;
    created_at?: string;
    updated_at?: string;
  }>;
  metadata: {
    total_files: number;
    total_size: number;
    categories: KBCategory[];
  };
}

export interface BackendConfig {
  type: 'filesystem' | 'graph';
  filesystem?: {
    root_path: string;
    enable_versioning: boolean;
    enable_compression: boolean;
  };
  graph?: {
    connection: {
      host: string;
      port: number;
      password?: string;
      database?: string;
    };
    vector_dimensions: number;
    enable_temporal_queries: boolean;
    enable_semantic_search: boolean;
  };
}