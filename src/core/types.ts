/**
 * Core types for KB-MCP storage system
 */

// Knowledge Base Categories
export const KB_CATEGORIES = ['active', 'completed', 'legacy', 'status', 'compliance', 'architecture', 'general'] as const;
export type KBCategory = typeof KB_CATEGORIES[number];

// Knowledge Base File Structure
export interface KBFile {
  path: string;
  content: string;
  metadata: Record<string, any>;
  category: KBCategory;
  size: number;
  modified: string;
  created: string;
}

// Knowledge Base Directory Structure
export interface KBDirectory {
  path: string;
  files: KBFile[];
  categories: Record<KBCategory, KBFile[]>;
  total_files: number;
  total_size: number;
}

// Search Results
export interface SearchResult {
  file: KBFile;
  score: number;
  matches: { line: number; content: string; context: string; }[];
  snippet: string;
}

// Implementation Status
export interface ImplementationStatus {
  overall_completion: number;
  phases: Array<{
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    completion: number;
    notes?: string;
  }>;
  critical_issues: number;
  last_updated: string;
}

// Known Issues
export interface KnownIssue {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
}

// Backend Export Format
export interface BackendExport {
  backend_type: 'filesystem' | 'graph';
  version: string;
  exported_at: string;
  files: Array<{
    path: string;
    content: string;
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
  }>;
  metadata: {
    total_files: number;
    total_size: number;
    categories: typeof KB_CATEGORIES;
  };
}