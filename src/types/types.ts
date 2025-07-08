/**
 * Core KB data types
 */

export interface KBFile {
  path: string;
  content: string;
  metadata?: {
    title?: string;
    category?: string;
    status?: string;
    lastUpdated?: string;
    author?: string;
    tags?: string[];
    version?: string;
    classification?: string;  // For data classification
  };
}

export interface KBDirectory {
  name: string;
  path: string;
  files: string[];
  subdirectories: KBDirectory[];
}

export interface SearchResult {
  file: string;
  matches: Array<{
    line: number;
    content: string;
    context: string;
  }>;
}

export interface StatusReport {
  overall: {
    completion: number;
    phase: string;
    blockers: string[];
  };
  components: Record<string, {
    status: string;
    completion: number;
    notes?: string;
  }>;
}

export interface KnownIssue {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  description: string;
  workaround?: string;
}

export const KB_CATEGORIES = [
  'active',
  'completed',
  'legacy',
  'status',
  'compliance',
  'architecture'
] as const;

export type KBCategory = typeof KB_CATEGORIES[number];