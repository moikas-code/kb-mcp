/**
 * Migration Tool: File-based KB to Graph-based KB
 * Converts existing markdown files to graph-based knowledge representation
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { KBManager } from '@core/kb-manager.js';
import { GraphKBManager } from '@core/graph-kb-manager.js';
import { UnifiedMemoryConfig } from '@graph/index.js';
import { NodeType, EdgeType } from '@graph/types.js';
import { Result } from '@types/index.js';

export interface MigrationConfig {
  source_path: string;
  graph_config: UnifiedMemoryConfig;
  batch_size?: number;
  create_relationships?: boolean;
  extract_entities?: boolean;
  generate_embeddings?: boolean;
  dry_run?: boolean;
}

export interface MigrationStats {
  total_files: number;
  processed_files: number;
  failed_files: number;
  total_nodes: number;
  total_edges: number;
  processing_time_ms: number;
  errors: string[];
}

export class FileToGraphMigrator {
  private sourceKB: KBManager;
  private targetKB: GraphKBManager;
  private config: MigrationConfig;
  private stats: MigrationStats;

  constructor(config: MigrationConfig) {
    this.config = {
      batch_size: 10,
      create_relationships: true,
      extract_entities: true,
      generate_embeddings: true,
      dry_run: false,
      ...config,
    };
    
    this.sourceKB = new KBManager(config.source_path);
    this.targetKB = new GraphKBManager(config.graph_config);
    
    this.stats = {
      total_files: 0,
      processed_files: 0,
      failed_files: 0,
      total_nodes: 0,
      total_edges: 0,
      processing_time_ms: 0,
      errors: [],
    };
  }

  /**
   * Run the migration
   */
  async migrate(): Promise<Result<MigrationStats>> {
    const startTime = Date.now();
    
    try {
      console.log('Starting migration from file-based KB to graph-based KB...');
      
      // Initialize target KB
      if (!this.config.dry_run) {
        const initResult = await this.targetKB.initialize();
        if (!initResult.success) {
          return {
            success: false,
            error: `Failed to initialize target KB: ${initResult.error}`,
          };
        }
      }
      
      // Get all markdown files
      const files = await this.getAllMarkdownFiles();
      this.stats.total_files = files.length;
      
      console.log(`Found ${files.length} files to migrate`);
      
      // Process files in batches
      for (let i = 0; i < files.length; i += this.config.batch_size!) {
        const batch = files.slice(i, i + this.config.batch_size!);
        await this.processBatch(batch);
        
        console.log(`Processed ${Math.min(i + this.config.batch_size!, files.length)}/${files.length} files`);
      }
      
      // Create relationships between nodes
      if (this.config.create_relationships && !this.config.dry_run) {
        await this.createRelationships();
      }
      
      // Extract entities and create entity nodes
      if (this.config.extract_entities && !this.config.dry_run) {
        await this.extractEntities();
      }
      
      this.stats.processing_time_ms = Date.now() - startTime;
      
      console.log('Migration completed successfully!');
      console.log(`Processed: ${this.stats.processed_files}/${this.stats.total_files} files`);
      console.log(`Failed: ${this.stats.failed_files} files`);
      console.log(`Total nodes: ${this.stats.total_nodes}`);
      console.log(`Total edges: ${this.stats.total_edges}`);
      console.log(`Processing time: ${this.stats.processing_time_ms}ms`);
      
      return {
        success: true,
        data: this.stats,
      };
    } catch (error) {
      this.stats.processing_time_ms = Date.now() - startTime;
      
      return {
        success: false,
        error: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    } finally {
      if (!this.config.dry_run) {
        await this.targetKB.shutdown();
      }
    }
  }

  /**
   * Get all markdown files from source
   */
  private async getAllMarkdownFiles(): Promise<string[]> {
    const pattern = path.join(this.config.source_path, 'kb', '**/*.md');
    const files = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/.git/**'],
    });
    
    return files.map(file => path.relative(path.join(this.config.source_path, 'kb'), file));
  }

  /**
   * Process a batch of files
   */
  private async processBatch(files: string[]): Promise<void> {
    const promises = files.map(file => this.processFile(file));
    await Promise.all(promises);
  }

  /**
   * Process a single file
   */
  private async processFile(filePath: string): Promise<void> {
    try {
      // Read file from source
      const kbFile = await this.sourceKB.readFile(filePath);
      
      if (this.config.dry_run) {
        console.log(`[DRY RUN] Would migrate: ${filePath}`);
        this.stats.processed_files++;
        return;
      }
      
      // Parse content and extract information
      const parsed = matter(kbFile.content);
      const content = parsed.content;
      const metadata = {
        ...parsed.data,
        ...kbFile.metadata,
      };
      
      // Create document node
      await this.targetKB.writeFile(filePath, content, metadata);
      
      // Extract and create additional nodes
      await this.extractConceptsFromContent(content, filePath);
      await this.extractFactsFromContent(content, filePath);
      await this.extractEventsFromContent(content, filePath);
      
      this.stats.processed_files++;
      this.stats.total_nodes += 1; // At least the document node
      
    } catch (error) {
      this.stats.failed_files++;
      this.stats.errors.push(`Failed to process ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error(`Failed to process ${filePath}:`, error);
    }
  }

  /**
   * Extract concepts from content
   */
  private async extractConceptsFromContent(content: string, filePath: string): Promise<void> {
    // Extract headings as concepts
    const headings = this.extractHeadings(content);
    
    for (const heading of headings) {
      await this.targetKB.memory.store(heading.text, {
        type: NodeType.CONCEPT,
        category: 'extracted',
        source_file: filePath,
        heading_level: heading.level,
        metadata: {
          extraction_method: 'heading_extraction',
          source: filePath,
        },
      });
      
      this.stats.total_nodes++;
    }
  }

  /**
   * Extract facts from content
   */
  private async extractFactsFromContent(content: string, filePath: string): Promise<void> {
    // Look for statements that appear to be facts
    const sentences = this.extractSentences(content);
    
    for (const sentence of sentences) {
      if (this.isFactualStatement(sentence)) {
        await this.targetKB.memory.store(sentence, {
          type: NodeType.FACT,
          verified: false,
          source_file: filePath,
          metadata: {
            extraction_method: 'pattern_matching',
            source: filePath,
          },
        });
        
        this.stats.total_nodes++;
      }
    }
  }

  /**
   * Extract events from content
   */
  private async extractEventsFromContent(content: string, filePath: string): Promise<void> {
    // Look for temporal patterns
    const events = this.extractTemporalEvents(content);
    
    for (const event of events) {
      await this.targetKB.memory.store(event.description, {
        type: NodeType.EVENT,
        timestamp: event.timestamp,
        source_file: filePath,
        metadata: {
          extraction_method: 'temporal_extraction',
          source: filePath,
        },
      });
      
      this.stats.total_nodes++;
    }
  }

  /**
   * Create relationships between nodes
   */
  private async createRelationships(): Promise<void> {
    console.log('Creating relationships between nodes...');
    
    // Get all document nodes
    const docsResult = await this.targetKB.memory.graph.findNodesByType(NodeType.DOCUMENT);
    
    if (!docsResult.success || !docsResult.data) {
      console.warn('Failed to get document nodes for relationship creation');
      return;
    }
    
    // Create relationships based on content similarity and references
    for (const doc of docsResult.data) {
      // Find similar documents
      const similarDocs = await this.targetKB.findRelated(doc.path, 5);
      
      for (const similarDoc of similarDocs) {
        // Create similarity relationship
        await this.targetKB.memory.graph.createEdge(
          doc.id,
          similarDoc.metadata.id || '',
          EdgeType.SIMILAR_TO,
          {
            weight: 0.7,
            metadata: {
              relationship_type: 'content_similarity',
              created_by: 'migration',
            },
          }
        );
        
        this.stats.total_edges++;
      }
    }
  }

  /**
   * Extract entities from content
   */
  private async extractEntities(): Promise<void> {
    console.log('Extracting entities from content...');
    
    // Get all nodes
    const allNodesResult = await this.targetKB.memory.graph.query(
      'MATCH (n) WHERE n.content IS NOT NULL RETURN n'
    );
    
    if (!allNodesResult.success || !allNodesResult.data) {
      console.warn('Failed to get nodes for entity extraction');
      return;
    }
    
    for (const row of allNodesResult.data) {
      const node = row.n;
      const entities = this.extractEntitiesFromText(node.content);
      
      for (const entity of entities) {
        // Create entity node
        const entityResult = await this.targetKB.memory.store(entity.name, {
          type: NodeType.ENTITY,
          entity_type: entity.type,
          metadata: {
            extraction_method: 'named_entity_recognition',
            source_node: node.id,
          },
        });
        
        if (entityResult.success) {
          // Create relationship
          await this.targetKB.memory.graph.createEdge(
            node.id,
            entityResult.data.id,
            EdgeType.CONTAINS,
            {
              weight: 0.8,
              metadata: {
                relationship_type: 'entity_mention',
                created_by: 'migration',
              },
            }
          );
          
          this.stats.total_nodes++;
          this.stats.total_edges++;
        }
      }
    }
  }

  /**
   * Extract headings from content
   */
  private extractHeadings(content: string): Array<{ text: string; level: number }> {
    const headings: Array<{ text: string; level: number }> = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(#+)\s+(.+)$/);
      
      if (match) {
        headings.push({
          text: match[2],
          level: match[1].length,
        });
      }
    }
    
    return headings;
  }

  /**
   * Extract sentences from content
   */
  private extractSentences(content: string): string[] {
    // Remove markdown formatting
    const cleanContent = content
      .replace(/#+\s*/g, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
    
    // Split into sentences
    return cleanContent
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  /**
   * Check if a sentence is a factual statement
   */
  private isFactualStatement(sentence: string): boolean {
    // Simple heuristics for factual statements
    const factualPatterns = [
      /\bis\b/,
      /\bare\b/,
      /\bwas\b/,
      /\bwere\b/,
      /\bhas\b/,
      /\bhave\b/,
      /\bcan\b/,
      /\bwill\b/,
      /\bmust\b/,
      /\bshould\b/,
    ];
    
    return factualPatterns.some(pattern => pattern.test(sentence.toLowerCase()));
  }

  /**
   * Extract temporal events from content
   */
  private extractTemporalEvents(content: string): Array<{ description: string; timestamp: string }> {
    const events: Array<{ description: string; timestamp: string }> = [];
    const lines = content.split('\n');
    
    const datePattern = /\b(\d{4}[-/]\d{2}[-/]\d{2})\b/;
    const eventPattern = /\b(happened|occurred|started|began|ended|finished|created|updated|released)\b/i;
    
    for (const line of lines) {
      const dateMatch = line.match(datePattern);
      const eventMatch = line.match(eventPattern);
      
      if (dateMatch && eventMatch) {
        events.push({
          description: line.trim(),
          timestamp: new Date(dateMatch[1]).toISOString(),
        });
      }
    }
    
    return events;
  }

  /**
   * Extract entities from text
   */
  private extractEntitiesFromText(text: string): Array<{ name: string; type: string }> {
    const entities: Array<{ name: string; type: string }> = [];
    
    // Simple entity extraction patterns
    const patterns = [
      { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, type: 'person' },
      { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+\b/g, type: 'organization' },
      { pattern: /\b[A-Z][A-Z][A-Z]+\b/g, type: 'acronym' },
      { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, type: 'date' },
      { pattern: /\b\d+\.\d+\.\d+\b/g, type: 'version' },
    ];
    
    for (const { pattern, type } of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({
            name: match,
            type,
          });
        }
      }
    }
    
    return entities;
  }

  /**
   * Get migration statistics
   */
  getStats(): MigrationStats {
    return { ...this.stats };
  }
}