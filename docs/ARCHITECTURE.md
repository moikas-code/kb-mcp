# KB-MCP Architecture Guide

This document explains the internal architecture and code organization of KB-MCP, helping developers understand how the system works and how to extend it.

## Table of Contents
- [System Overview](#system-overview)
- [Core Architecture](#core-architecture)
- [Key Components](#key-components)
- [Data Flow](#data-flow)
- [Code Organization](#code-organization)
- [Extension Points](#extension-points)
- [Performance Considerations](#performance-considerations)

## System Overview

KB-MCP is built as a modular, extensible platform with these design principles:

1. **Dual Storage Architecture**: Supports both filesystem and graph database backends
2. **Plugin-based Analysis**: Modular analyzers for different aspects
3. **Streaming Processing**: Handle large codebases efficiently
4. **Intelligent Caching**: Multi-level caching with smart invalidation
5. **MCP Protocol**: AI assistant integration via Model Context Protocol

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ analyze │ │benchmark│ │ optimize │ │ mcp server   │   │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └──────┬───────┘   │
└───────┼───────────┼───────────┼──────────────┼────────────┘
        │           │           │              │
┌───────▼───────────▼───────────▼──────────────▼────────────┐
│                    Orchestration Layer                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │          Unified Analysis Orchestrator               │  │
│  │  • Pipeline Management  • Intelligent Routing        │  │
│  │  • Task Scheduling      • Result Aggregation         │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│                    Analysis Engine Layer                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Parser  │ │ Pattern  │ │   Debt   │ │     NLQ     │  │
│  │  (AST)   │ │ Detector │ │ Analyzer │ │ Processor   │  │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│  ┌──────────────────────┐ ┌───────────────────────────┐  │
│  │ Relationship Extractor│ │    Incremental Analyzer   │  │
│  └──────────────────────┘ └───────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│                 Processing & Optimization                   │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────┐   │
│  │  Parallel   │ │    Batch    │ │   Analysis Cache  │   │
│  │  Processor  │ │  Processor  │ │  (Memory + Disk)  │   │
│  └─────────────┘ └─────────────┘ └───────────────────┘   │
└────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│                    Storage Layer                            │
│  ┌─────────────────────┐     ┌─────────────────────────┐  │
│  │  Filesystem Backend │     │    Graph Backend        │  │
│  │  • File Storage     │     │  • FalkorDB (Graph)    │  │
│  │  • JSON/YAML/MD     │     │  • Redis (Cache)       │  │
│  │  • Versioning       │     │  • Vector Embeddings   │  │
│  └─────────────────────┘     └─────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│                 External Integrations                       │
│  ┌─────────────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │ MOIDVK Adapter  │ │ Git Integr.  │ │ IDE Plugins   │  │
│  └─────────────────┘ └──────────────┘ └───────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## Core Architecture

### 1. Storage Abstraction Layer

The system uses a **Backend Manager** pattern to abstract storage:

```typescript
// src/core/backend-manager.ts
export class BackendManager {
  private currentBackend: StorageBackend;
  
  async switchBackend(type: 'filesystem' | 'graph'): Promise<Result<void>> {
    // Handles migration between backends
    const data = await this.currentBackend.export();
    this.currentBackend = this.createBackend(type);
    await this.currentBackend.import(data);
  }
}
```

**Key Interfaces:**
- `StorageBackend`: Common interface for all backends
- `FilesystemBackend`: Traditional file-based storage
- `GraphBackend`: FalkorDB-powered graph storage

### 2. Analysis Engine

The core analysis engine (`src/analysis/analysis-engine.ts`) coordinates multiple analyzers:

```typescript
export class AnalysisEngine {
  constructor(
    private memory: UnifiedMemory,
    private config: AnalysisConfig
  ) {
    this.setupAnalyzers();
  }

  async analyzeFile(path: string, content: string): Promise<AnalysisResult> {
    // 1. Parse AST
    const ast = await this.parser.parse(content, language);
    
    // 2. Extract entities and relationships
    const entities = await this.extractEntities(ast);
    const relationships = await this.extractRelationships(ast, entities);
    
    // 3. Run specialized analyzers
    const patterns = await this.patternDetector.analyze(ast);
    const debt = await this.debtAnalyzer.analyze(ast, content);
    
    // 4. Generate insights
    const insights = await this.generateInsights(entities, patterns, debt);
    
    // 5. Store in memory system
    await this.memory.store(entities, relationships);
    
    return { entities, relationships, patterns, debt, insights };
  }
}
```

### 3. Unified Memory System

The memory system (`src/graph/unified-memory.ts`) provides intelligent storage:

```typescript
export class UnifiedMemory {
  graph: GraphMemory;      // Entity relationships
  vector: VectorMemory;    // Semantic embeddings
  temporal: TemporalMemory;// Time-based tracking
  working: WorkingMemory;  // Session-based storage
  
  async query(nlQuery: string): Promise<QueryResult> {
    // 1. Convert NL to graph query
    const graphQuery = await this.nlqProcessor.convert(nlQuery);
    
    // 2. Execute across memory types
    const graphResults = await this.graph.query(graphQuery);
    const vectorResults = await this.vector.search(nlQuery);
    
    // 3. Merge and rank results
    return this.mergeResults(graphResults, vectorResults);
  }
}
```

## Key Components

### 1. Parser System (`src/parsers/`)

Uses tree-sitter for robust AST parsing:

```typescript
export class LanguageParser {
  private parser: Parser;
  private language: Language;
  
  async parse(content: string): Promise<AST> {
    const tree = this.parser.parse(content);
    return this.transformToCommonAST(tree);
  }
}
```

**Supported Languages:**
- TypeScript/JavaScript (`typescript-parser.ts`)
- Python (`python-parser.ts`)
- Rust (`rust-parser.ts`)
- Go, Java, C/C++ (extensible)

### 2. Pattern Detection (`src/analysis/pattern-detector.ts`)

Detects design patterns, anti-patterns, and code smells:

```typescript
export class PatternDetector {
  private patterns: Map<string, PatternMatcher>;
  
  async detectPatterns(ast: AST, language: string): Promise<Pattern[]> {
    const detectedPatterns: Pattern[] = [];
    
    // Walk AST and match patterns
    ast.walk((node) => {
      for (const [name, matcher] of this.patterns) {
        if (matcher.matches(node, ast)) {
          detectedPatterns.push({
            type: matcher.type,
            name,
            confidence: matcher.calculateConfidence(node),
            location: node.location
          });
        }
      }
    });
    
    return detectedPatterns;
  }
}
```

### 3. Parallel Processing (`src/analysis/parallel-processor.ts`)

Handles concurrent analysis with worker threads:

```typescript
export class ParallelProcessor {
  private workerPool: Worker[];
  private taskQueue: AnalysisTask[];
  
  async submitTask(task: AnalysisTask): Promise<string> {
    // Assign to least loaded worker
    const worker = this.selectWorker();
    return await worker.process(task);
  }
  
  async streamAnalysis(tasks: AnalysisTask[]): AsyncGenerator<Result[]> {
    // Process in chunks with streaming results
    for (const chunk of this.chunkTasks(tasks)) {
      yield await this.processChunk(chunk);
    }
  }
}
```

### 4. Natural Language Query Processor (`src/analysis/nlq-processor.ts`)

Converts natural language to graph queries:

```typescript
export class NaturalLanguageQueryProcessor {
  async processQuery(query: string): Promise<QueryResult> {
    // 1. Extract intent and entities
    const intent = this.extractIntent(query);
    const entities = this.extractEntities(query);
    
    // 2. Build graph query
    const cypherQuery = this.buildCypherQuery(intent, entities);
    
    // 3. Execute and explain
    const results = await this.memory.graph.query(cypherQuery);
    const explanation = this.generateExplanation(intent, results);
    
    return { results, explanation, cypherQuery };
  }
}
```

### 5. Caching System (`src/analysis/analysis-cache.ts`)

Multi-level caching with intelligent invalidation:

```typescript
export class AnalysisCache {
  private memoryCache: LRUCache<string, CacheEntry>;
  private diskCache: DiskCache;
  
  async get(key: CacheKey): Promise<T | null> {
    // Check memory first
    const memResult = this.memoryCache.get(key);
    if (memResult && !this.isExpired(memResult)) {
      return memResult.value;
    }
    
    // Check disk cache
    const diskResult = await this.diskCache.get(key);
    if (diskResult && !this.isExpired(diskResult)) {
      // Promote to memory
      this.memoryCache.set(key, diskResult);
      return diskResult.value;
    }
    
    return null;
  }
  
  async invalidateByFileChange(filePath: string): Promise<void> {
    // Smart invalidation based on dependencies
    const dependencies = await this.findDependencies(filePath);
    for (const dep of dependencies) {
      await this.invalidate(dep);
    }
  }
}
```

## Data Flow

### 1. Analysis Flow

```
User Input → CLI Command → Orchestrator → Analysis Pipeline
                                              ↓
                                        Parse & Extract
                                              ↓
                                        Pattern Detection
                                              ↓
                                        Debt Analysis
                                              ↓
                                        Store Results
                                              ↓
                                        Generate Output
```

### 2. Query Flow

```
Natural Language Query → NLQ Processor → Intent Extraction
                                              ↓
                                        Cypher Generation
                                              ↓
                                        Graph Query
                                              ↓
                                        Vector Search
                                              ↓
                                        Result Merging
                                              ↓
                                        Response Generation
```

## Code Organization

```
kb-mcp/
├── src/
│   ├── analysis/           # Core analysis components
│   │   ├── analysis-engine.ts
│   │   ├── pattern-detector.ts
│   │   ├── technical-debt-analyzer.ts
│   │   ├── nlq-processor.ts
│   │   ├── parallel-processor.ts
│   │   └── unified-orchestrator.ts
│   ├── parsers/           # Language parsers
│   │   ├── base-parser.ts
│   │   ├── typescript-parser.ts
│   │   └── python-parser.ts
│   ├── graph/             # Graph database layer
│   │   ├── unified-memory.ts
│   │   ├── graph-memory.ts
│   │   ├── vector-memory.ts
│   │   └── connection.ts
│   ├── core/              # Core utilities
│   │   ├── backend-manager.ts
│   │   ├── config.ts
│   │   └── types.ts
│   ├── cli/               # CLI commands
│   │   ├── commands/
│   │   └── kb-cli.ts
│   ├── mcp/               # MCP server
│   │   ├── server.ts
│   │   └── tools.ts
│   └── integrations/      # External integrations
│       └── moidvk-adapter.ts
├── tests/                 # Test suites
├── docs/                  # Documentation
└── scripts/              # Build and utility scripts
```

## Extension Points

### 1. Adding a New Language

```typescript
// src/parsers/rust-parser.ts
export class RustParser extends BaseParser {
  async parse(content: string): Promise<AST> {
    // Initialize tree-sitter Rust parser
    const parser = new Parser();
    parser.setLanguage(Rust);
    
    // Parse and transform
    const tree = parser.parse(content);
    return this.transformToCommonAST(tree);
  }
  
  extractEntities(ast: AST): Entity[] {
    // Rust-specific entity extraction
    return ast.findAll('struct', 'enum', 'trait', 'impl');
  }
}

// Register in parser factory
ParserFactory.register('rust', RustParser);
```

### 2. Adding a New Pattern

```typescript
// src/patterns/custom-pattern.ts
export class SingletonPattern extends PatternMatcher {
  matches(node: ASTNode, context: AST): boolean {
    return node.type === 'class' &&
           this.hasPrivateConstructor(node) &&
           this.hasStaticInstance(node) &&
           this.hasGetInstanceMethod(node);
  }
  
  calculateConfidence(node: ASTNode): number {
    // Scoring logic
    return 0.95;
  }
}

// Register pattern
PatternRegistry.register('Singleton', new SingletonPattern());
```

### 3. Adding a New Analyzer

```typescript
// src/analysis/security-analyzer.ts
export class SecurityAnalyzer implements Analyzer {
  async analyze(ast: AST, content: string): Promise<SecurityIssues> {
    const issues: SecurityIssue[] = [];
    
    // Check for hardcoded secrets
    const secrets = await this.findHardcodedSecrets(content);
    issues.push(...secrets);
    
    // Check for SQL injection
    const sqlInjections = await this.findSQLInjections(ast);
    issues.push(...sqlInjections);
    
    return { issues, severity: this.calculateSeverity(issues) };
  }
}

// Register in analysis engine
AnalysisEngine.registerAnalyzer('security', new SecurityAnalyzer());
```

## Performance Considerations

### 1. Streaming Architecture

For large codebases, KB-MCP uses streaming:

```typescript
async *analyzeProjectStream(path: string): AsyncGenerator<FileResult> {
  const files = await this.discoverFiles(path);
  
  for (const batch of this.batchFiles(files, 100)) {
    const results = await Promise.all(
      batch.map(file => this.analyzeFile(file))
    );
    
    for (const result of results) {
      yield result;
    }
  }
}
```

### 2. Incremental Analysis

Only re-analyze changed files:

```typescript
export class IncrementalAnalyzer {
  private fileHashes: Map<string, string>;
  
  async shouldAnalyze(file: string): Promise<boolean> {
    const currentHash = await this.computeHash(file);
    const previousHash = this.fileHashes.get(file);
    
    if (currentHash !== previousHash) {
      this.fileHashes.set(file, currentHash);
      return true;
    }
    
    return false;
  }
}
```

### 3. Memory Management

Automatic memory monitoring and cleanup:

```typescript
export class MemoryManager {
  monitor(): void {
    setInterval(() => {
      const usage = process.memoryUsage();
      
      if (usage.heapUsed > this.threshold) {
        this.emit('memory-pressure');
        this.triggerCleanup();
      }
    }, 30000);
  }
  
  async triggerCleanup(): Promise<void> {
    // Clear caches
    await this.cache.evictLRU(0.3); // Evict 30%
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}
```

## Integration Points

### 1. MOIDVK Integration

The MOIDVK adapter provides intelligent tool routing:

```typescript
export class MoidvkAdapter {
  async executeTool(tool: MoidvkToolCall): Promise<Result> {
    // Decide routing based on context
    const routing = await this.makeRoutingDecision(tool);
    
    switch (routing.selectedTool) {
      case 'moidvk':
        return await this.executeMoidvkTool(tool);
      case 'kb-mcp':
        return await this.executeKBTool(tool);
      case 'hybrid':
        return await this.executeHybrid(tool);
    }
  }
}
```

### 2. MCP Protocol

Exposes KB-MCP as an MCP server:

```typescript
export class MCPServer {
  async handleToolCall(tool: string, args: any): Promise<any> {
    switch (tool) {
      case 'kb_analyze':
        return await this.orchestrator.analyze({
          type: 'file',
          target: args.path,
          options: args.options
        });
      
      case 'kb_query':
        return await this.orchestrator.analyze({
          type: 'query',
          target: args.query
        });
    }
  }
}
```

## Best Practices

1. **Use Streaming**: For large operations, always use streaming APIs
2. **Enable Caching**: Dramatically improves performance
3. **Incremental Analysis**: Use file watching for real-time feedback
4. **Worker Pools**: Configure based on CPU cores
5. **Memory Limits**: Set appropriate limits for your system

## Contributing

To extend KB-MCP:

1. Follow the existing patterns
2. Add comprehensive tests
3. Update type definitions
4. Document new features
5. Benchmark performance impact

---

This architecture enables KB-MCP to provide powerful code intelligence while remaining performant and extensible. The modular design allows for easy enhancement and integration with other tools like MOIDVK.