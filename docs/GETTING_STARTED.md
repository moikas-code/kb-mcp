# Getting Started with KB-MCP

KB-MCP (Knowledge Base - Model Context Protocol) is an enterprise-grade code intelligence platform that provides deep insights into your codebase through advanced analysis, pattern detection, and natural language queries.

## Table of Contents
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Core Features](#core-features)
- [Advanced Features](#advanced-features)
- [Configuration](#configuration)
- [Integration with MOIDVK](#integration-with-moidvk)
- [Troubleshooting](#troubleshooting)

## Quick Start

Get up and running in 3 minutes:

```bash
# Clone the repository
git clone <repository-url> kb-mcp
cd kb-mcp

# Install dependencies
npm install  # or bun install

# Build the project
npm run build

# Initialize KB-MCP in your project
cd /path/to/your/project
kb init

# Analyze your first file
kb analyze file src/index.ts
```

## Installation

### Prerequisites

- **Node.js** >= 18.0.0 or **Bun** >= 1.0.0
- **Git** for version control integration
- **Docker** (optional, for graph database features)

### Install Methods

#### 1. Global Installation (Recommended)
```bash
npm install -g @moikas/kb-mcp
# or
bun install -g @moikas/kb-mcp
```

#### 2. Local Development
```bash
git clone <repository-url> kb-mcp
cd kb-mcp
npm install
npm run build
npm link  # Makes 'kb' command available globally
```

#### 3. As a Project Dependency
```bash
npm install --save-dev @moikas/kb-mcp
# Add to package.json scripts:
# "analyze": "kb analyze project"
```

## Basic Usage

### 1. Initialize KB-MCP

```bash
# Basic setup (filesystem storage)
kb init

# Enterprise setup (with graph database)
kb init --template enterprise
```

This creates:
- `.kbconfig.yaml` - Configuration file
- `kb/` - Knowledge base directory
- `.cache/kb-mcp/` - Cache directory

### 2. Analyze Code

#### Single File Analysis
```bash
# Analyze a TypeScript file
kb analyze file src/components/Button.tsx

# Analyze with specific options
kb analyze file src/utils/api.ts --patterns --debt --insights
```

#### Project Analysis
```bash
# Analyze entire project
kb analyze project

# Analyze specific directory
kb analyze project src/

# With progress bar and custom options
kb analyze project . --progress --exclude "test/**"
```

### 3. Natural Language Queries

Ask questions about your codebase:

```bash
# Find complex functions
kb analyze query "What are the most complex functions?"

# Find patterns
kb analyze query "Show me all singleton patterns"

# Find dependencies
kb analyze query "Which modules depend on the database layer?"
```

### 4. Pattern Detection

```bash
# Detect all patterns
kb analyze patterns .

# Filter by pattern type
kb analyze patterns src/ --type anti-pattern

# Set confidence threshold
kb analyze patterns . --min-confidence 0.8
```

### 5. Technical Debt Analysis

```bash
# Analyze technical debt
kb analyze debt .

# Filter by priority
kb analyze debt . --priority high

# Export debt report
kb analyze debt . --output debt-report.md --format markdown
```

## Core Features

### 1. Code Analysis Engine

KB-MCP uses tree-sitter for AST parsing, providing:
- **Language Support**: TypeScript, JavaScript, Python, Rust, Go, Java
- **Entity Extraction**: Classes, functions, interfaces, modules
- **Relationship Mapping**: Dependencies, inheritance, calls
- **Complexity Metrics**: Cyclomatic complexity, cognitive complexity

### 2. Pattern Detection

Automatically detects:
- **Design Patterns**: Singleton, Factory, Observer, etc.
- **Anti-patterns**: God Class, Spaghetti Code, Copy-Paste
- **Code Smells**: Long methods, large classes, feature envy

### 3. Technical Debt Tracking

Identifies and quantifies:
- TODO/FIXME comments with context
- Debug code and console statements
- Missing error handling
- Incomplete implementations
- Documentation gaps

### 4. Natural Language Processing

Query your codebase naturally:
- Semantic understanding of queries
- Context-aware responses
- Code examples and explanations
- Actionable suggestions

### 5. Real-time Monitoring

```bash
# Watch for changes
kb analyze watch src/

# Real-time analysis with incremental updates
kb analyze watch . --incremental
```

## Advanced Features

### 1. Graph Database Mode

Enable advanced features with graph database:

```bash
# Start graph database
docker-compose -f docker-compose.local.yml up -d

# Configure for graph mode
kb config set storage.backend graph

# Use semantic search
kb search "authentication logic" --semantic

# Explore knowledge graph
kb graph connections --depth 3
```

### 2. Performance Benchmarking

```bash
# Run benchmarks
kb benchmark run

# Compare performance
kb benchmark compare baseline.json

# Profile specific operation
kb benchmark profile file --path src/large-file.ts
```

### 3. Workflow Optimization

```bash
# Optimize development workflow
kb optimize workflow . --goals "reduce bugs,improve performance"

# Optimize cache
kb optimize cache --max-age 24

# Tune performance settings
kb optimize performance --profile
```

### 4. MCP Server Mode

Use KB-MCP with AI assistants:

```bash
# Start as MCP server (stdio)
kb mcp

# Start with WebSocket
kb mcp --transport websocket --port 3000
```

Configure in Claude Desktop:
```json
{
  "mcpServers": {
    "kb-mcp": {
      "command": "kb",
      "args": ["mcp"]
    }
  }
}
```

## Configuration

### Basic Configuration (.kbconfig.yaml)

```yaml
# Storage backend
backend:
  type: filesystem  # or 'graph'
  filesystem:
    root_path: ./kb
    enable_versioning: true

# Analysis settings
analysis:
  depth: standard  # quick, standard, comprehensive
  languages:
    - typescript
    - javascript
    - python
  patterns:
    detect_anti_patterns: true
    detect_design_patterns: true

# Performance
cache:
  enabled: true
  ttl: 3600
  max_size: 100MB

# Logging
logging:
  level: info
  file: .cache/kb-mcp/kb-mcp.log
```

### Environment Variables

```bash
# Core settings
export KB_STORAGE_BACKEND=filesystem
export KB_ANALYSIS_DEPTH=comprehensive
export KB_CACHE_ENABLED=true

# Graph database (if using)
export FALKORDB_HOST=localhost
export FALKORDB_PORT=6380
export REDIS_HOST=localhost
export REDIS_PORT=6379
```

## Integration with MOIDVK

KB-MCP seamlessly integrates with MOIDVK for enhanced capabilities:

```bash
# Check MOIDVK integration
kb moidvk status

# Test integration
kb moidvk test

# Analyze with hybrid approach
kb analyze file src/app.ts --moidvk

# Get tool recommendations
kb moidvk recommend
```

### Benefits of Integration
- **KB-MCP**: Graph intelligence, relationships, NLQ
- **MOIDVK**: Specialized tools, security scanning, formatting
- **Together**: Optimal tool selection, enhanced insights

## Common Workflows

### 1. Daily Development
```bash
# Morning: Check technical debt
kb analyze debt . --priority high

# During coding: Real-time analysis
kb analyze watch src/

# Before commit: Pattern check
kb analyze patterns . --type anti-pattern
```

### 2. Code Review
```bash
# Analyze PR changes
kb analyze file src/new-feature.ts --insights

# Check for patterns
kb analyze patterns src/new-feature.ts

# Generate report
kb analyze project src/feature/ --output review.md
```

### 3. Refactoring
```bash
# Find refactoring candidates
kb analyze query "Show me functions with high complexity"

# Track improvements
kb benchmark run --category core
# ... refactor ...
kb benchmark compare
```

## Troubleshooting

### Common Issues

1. **"kb: command not found"**
   ```bash
   # Ensure global installation
   npm install -g @moikas/kb-mcp
   # Or use npx
   npx kb analyze file src/index.ts
   ```

2. **"No configuration found"**
   ```bash
   # Initialize first
   kb init
   ```

3. **Graph database connection failed**
   ```bash
   # Start databases
   docker-compose -f docker-compose.local.yml up -d
   # Check status
   docker ps
   ```

4. **Analysis too slow**
   ```bash
   # Use quick analysis
   kb analyze project --depth quick
   # Enable caching
   kb config set cache.enabled true
   ```

### Getting Help

```bash
# Show help
kb --help
kb analyze --help

# Check status
kb status

# View logs
tail -f .cache/kb-mcp/kb-mcp.log
```

## Next Steps

1. **Explore Advanced Analysis**
   - Set up graph database for semantic search
   - Configure custom patterns
   - Create analysis workflows

2. **Integrate with Your Workflow**
   - Add pre-commit hooks
   - Set up CI/CD integration
   - Configure IDE extensions

3. **Optimize Performance**
   - Run benchmarks
   - Tune worker settings
   - Enable incremental analysis

4. **Learn More**
   - Read [Architecture Guide](./ARCHITECTURE.md)
   - Explore [API Documentation](./API.md)
   - Join community discussions

---

Ready to unlock deep insights into your codebase? Start with `kb init` and explore the power of code intelligence! 🚀