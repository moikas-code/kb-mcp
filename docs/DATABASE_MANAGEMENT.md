# Database Management in KB-MCP

KB-MCP can automatically manage local Docker instances for graph database features, similar to how Supabase CLI works. Each project gets its own isolated database containers.

## Quick Start

### For New Projects

```bash
# Initialize with graph database (auto-starts containers)
kb init --template enterprise
> Primary storage backend: Graph Database (Advanced features, requires FalkorDB)

# Database starts automatically!
# Configuration is saved to .kbconfig.yaml
# Ready to use graph features
```

### For Existing Projects

```bash
# Start database for current project
kb db start

# Status check
kb db status

# Use graph features
kb serve
```

## How It Works

### Project Isolation
Each project gets unique:
- **Container names**: `kb_abc12345_falkordb`, `kb_abc12345_redis`
- **Ports**: Automatically assigned to avoid conflicts
- **Volumes**: Project-specific data volumes
- **Networks**: Isolated Docker networks

### Automatic Configuration
When you run `kb db start`:
1. Generates project ID from current directory path
2. Creates project-specific Docker Compose file
3. Starts containers with unique ports
4. Updates `.kbconfig.yaml` with connection details
5. Ready to use!

## Commands

### Database Management

```bash
# Start database for current project
kb db start

# Stop database
kb db stop

# Check status of current project and all others
kb db status

# Reset database (delete all data)
kb db reset

# View logs
kb db logs
kb db logs --follow
kb db logs --service falkordb
```

### Project Status Example

```bash
$ kb db status

Database Status
────────────────────────────────────────
Project: my-ai-research
Project ID: abc12345
Status: Running

Containers:
  FalkorDB: ✓
  Redis: ✓

Ports:
  FalkorDB: localhost:6847
  Redis: localhost:7642

Other KB Projects:
  docs-project: running
  notes-app: stopped
  research-2024: running
```

## Benefits

### Like Supabase CLI
- **Zero Config**: Just run `kb db start`
- **Project Isolation**: Each project has its own database
- **Auto Port Assignment**: No conflicts between projects
- **Persistent Data**: Data survives restarts
- **Easy Cleanup**: `kb db stop` when done

### Multiple Projects
You can have multiple KB projects running simultaneously:

```bash
# Project 1: ~/work/ai-research
cd ~/work/ai-research
kb db start  # Gets ports 6847, 7642

# Project 2: ~/personal/notes  
cd ~/personal/notes
kb db start  # Gets ports 6912, 7458

# Both run independently with separate data!
```

## Advanced Usage

### Configuration Override
The auto-generated `.kbconfig.yaml` includes:

```yaml
storage:
  backend: graph

graph:
  falkordb:
    host: localhost
    port: 6847        # Auto-assigned
    password: dev_kb_abc12345
  redis:
    host: localhost
    port: 7642        # Auto-assigned
    password: dev_kb_abc12345
  project_id: kb_abc12345
```

### Manual Docker Compose
Each project gets a compose file at:
```
~/.kb-mcp/projects/kb_abc12345/docker-compose.yml
```

You can customize it if needed, then:
```bash
docker-compose -f ~/.kb-mcp/projects/kb_abc12345/docker-compose.yml up -d
```

### Data Location
Data is stored in Docker volumes:
- `kb_abc12345_falkordb_data`
- `kb_abc12345_redis_data`

Access via:
```bash
docker volume inspect kb_abc12345_falkordb_data
```

## Migration Scenarios

### From File-Based to Graph

```bash
# Current file-based project
cd my-existing-project

# Export current data
kb export --format json --output backup.json

# Switch to graph database
kb db start  # Starts containers
kb config set storage.backend graph

# Import data into graph
kb import backup.json
```

### Between Projects

```bash
# Export from project A
cd project-a
kb export --format json --output data.json

# Import to project B
cd project-b
kb db start
kb import data.json
```

## Resource Management

### What's Running?
```bash
# Check all KB containers
docker ps | grep kb_

# See all KB volumes
docker volume ls | grep kb_
```

### Cleanup
```bash
# Stop and remove specific project
kb db stop && docker volume prune

# Remove all KB containers and data
docker container prune
docker volume prune
```

### Resource Usage
Per project:
- **Memory**: ~200MB (FalkorDB + Redis)
- **Disk**: ~50MB initial + your data
- **CPU**: Minimal when idle

## Troubleshooting

### Port Conflicts
Ports are auto-assigned, but if conflicts occur:
```bash
# Check what's using a port
lsof -i :6847

# Reset with different ports
kb db reset
```

### Container Issues
```bash
# View logs
kb db logs --follow

# Restart containers
kb db stop && kb db start

# Full reset
kb db reset
```

### Connection Problems
```bash
# Test connections manually
redis-cli -h localhost -p 6847 -a dev_kb_abc12345 ping
redis-cli -h localhost -p 7642 -a dev_kb_abc12345 ping
```

## Comparison with File-Based

| Feature | File-Based | Graph Database |
|---------|------------|----------------|
| Setup | Zero | `kb db start` |
| Features | Basic | Advanced AI features |
| Performance | Good for small | Better for large |
| Search | Text search | Semantic + graph |
| Memory | Low | ~200MB per project |
| Offline | Yes | Requires containers |
| Multi-project | Separate directories | Isolated databases |

## Best Practices

1. **Development**: Use file-based for simple notes
2. **Research**: Use graph database for complex projects
3. **Teams**: Use full Docker stack with shared databases
4. **Cleanup**: Run `kb db stop` when done with a project
5. **Backups**: Regular `kb export` for important data

This design gives you the power of graph databases with the simplicity of local development!