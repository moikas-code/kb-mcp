# Using Graph Database Locally with KB-MCP

This guide explains how to use the full graph database features of KB-MCP on your local machine.

## Why Use Graph Database Locally?

While the default file-based storage is perfect for getting started, the graph database provides:

- **Semantic Search**: Find related content using AI embeddings
- **Knowledge Graphs**: Visualize connections between documents
- **Temporal Queries**: Search by time ranges and evolution
- **Better Performance**: For large knowledge bases
- **Advanced Features**: Contradictions detection, insight generation

## Quick Setup

### 1. Automated Setup (Recommended)

```bash
# Run the setup script
./scripts/setup-local-graph.sh

# Source the environment
source .env.local

# Start using with graph features
kb serve
```

### 2. Manual Setup

#### Step 1: Start Databases

```bash
# Start FalkorDB and Redis
docker-compose -f docker-compose.local.yml up -d

# Verify they're running
docker ps
```

#### Step 2: Configure KB-MCP

```bash
# Copy graph configuration
cp .kbconfig.graph.yaml .kbconfig.yaml

# Set environment variables
export FALKORDB_HOST=localhost
export FALKORDB_PORT=6380
export FALKORDB_PASSWORD=localdev123
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=localdev123
export KB_STORAGE_BACKEND=graph
```

#### Step 3: Initialize with Graph Backend

```bash
# For new knowledge base
kb init --template enterprise --backend graph

# Or configure existing KB
kb config set storage.backend graph
kb config set graph.falkordb.host localhost
kb config set graph.falkordb.port 6380
```

## Configuration Options

### Basic Graph Configuration

```yaml
# .kbconfig.yaml
storage:
  backend: graph  # Enable graph storage

graph:
  falkordb:
    host: localhost
    port: 6380
    password: localdev123
```

### Advanced Features

```yaml
graph:
  memory:
    # Enable vector embeddings for semantic search
    enable_vector: true
    vector:
      embedding_model: Xenova/all-MiniLM-L6-v2
      
    # Enable temporal memory
    enable_temporal: true
    
    # Auto-consolidation of memories
    consolidation:
      enabled: true
      threshold: 5
      interval: 300000  # 5 minutes
      
    # Contradiction detection
    contradiction_detection: true
    
    # Automatic insight generation
    insight_generation: true
```

## Usage Examples

### 1. Semantic Search

```bash
# Find documents semantically similar to a query
kb search "machine learning algorithms" --semantic

# Search with similarity threshold
kb search "neural networks" --semantic --threshold 0.7
```

### 2. Time-Based Queries

```bash
# Find documents modified in the last week
kb search --time-range "7 days ago" "now"

# Find documents from specific period
kb search --from "2024-01-01" --to "2024-12-31"
```

### 3. Knowledge Graph Exploration

```bash
# Find related documents
kb graph related "docs/ai-overview.md"

# Show document connections
kb graph connections --depth 2

# Find contradictions
kb graph contradictions
```

### 4. Working Memory (Session-Based)

```bash
# Start a session with working memory
kb session start "research-task"

# Add notes to working memory
kb write session:note1.md "Quick thought about the research"

# End session and consolidate
kb session end --consolidate
```

## Managing the Local Setup

### Start Databases

```bash
docker-compose -f docker-compose.local.yml up -d
```

### Stop Databases

```bash
docker-compose -f docker-compose.local.yml down
```

### View Logs

```bash
# All logs
docker-compose -f docker-compose.local.yml logs -f

# Just FalkorDB
docker logs kb-falkordb-local -f

# Just Redis
docker logs kb-redis-local -f
```

### Reset Databases

```bash
# Stop and remove all data
docker-compose -f docker-compose.local.yml down -v

# Start fresh
docker-compose -f docker-compose.local.yml up -d
```

## Resource Requirements

- **Memory**: ~512MB for databases + application
- **Disk**: ~100MB initial, grows with content
- **CPU**: Minimal, except during indexing
- **Docker**: Required for database containers

## Switching Between File and Graph

### From File to Graph

```bash
# Export current file-based KB
kb export --format json --output kb-backup.json

# Switch to graph backend
kb config set storage.backend graph

# Import into graph
kb import kb-backup.json
```

### From Graph to File

```bash
# Export from graph
kb export --format json --output kb-graph.json

# Switch to file backend
kb config set storage.backend filesystem

# Import to files
kb import kb-graph.json
```

## Troubleshooting

### Connection Issues

```bash
# Test FalkorDB connection
redis-cli -h localhost -p 6380 -a localdev123 ping

# Test Redis connection
redis-cli -h localhost -p 6379 -a localdev123 ping
```

### Performance Issues

```bash
# Check memory usage
kb stats memory

# Optimize graph
kb graph optimize

# Clear caches
kb cache clear
```

### Common Errors

1. **"Connection refused"**
   - Ensure Docker containers are running
   - Check ports aren't already in use

2. **"Authentication failed"**
   - Verify passwords match in `.env.local`
   - Check environment variables are set

3. **"Graph not initialized"**
   - Run `kb init --backend graph`
   - Or `kb graph init`

## Best Practices

1. **Development**: Use file-based storage for simplicity
2. **Testing Features**: Use local graph setup
3. **Production**: Use Docker Compose full stack
4. **Backups**: Regular exports with `kb export`

## Security Notes

- Change default passwords in production
- Use strong encryption keys
- Don't commit `.env` files
- Use Docker secrets for sensitive data

## Next Steps

- Explore semantic search capabilities
- Set up automated insights generation
- Configure vector embeddings for your domain
- Enable temporal analysis for audit trails