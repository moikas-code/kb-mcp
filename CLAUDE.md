# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KB-MCP is an enterprise-grade knowledge base management system that operates as both a CLI tool and MCP (Model Context Protocol) server. It features configurable storage backends (filesystem and graph database), enterprise security frameworks, and SOC2 compliance readiness.

## Development Commands

### Building and Development
```bash
bun run build           # TypeScript compilation to dist/
bun run dev             # Start MCP server in development mode
bun run dev:cli         # Start CLI in development mode  
bun run dev:basic-cli   # Start basic CLI (minimal dependencies)
```

### Testing
```bash
bun test                    # Full test suite with coverage
bun run test:security       # Security-focused tests only
bun run test:compliance     # Compliance tests only
bun run test:integration    # Integration tests only
```

### Code Quality
```bash
bun run lint                # ESLint with TypeScript rules
bun run type-check          # TypeScript type checking without emit
bun audit --production      # Security audit of dependencies
```

### Specialized Commands
```bash
bun run version             # Build standalone CLI for releases
bun run release             # Version bump (patch) and publish
bun run release:minor       # Minor version bump and publish
bun run release:major       # Major version bump and publish
```

## Architecture Overview

### Dual Backend System
The system uses a **configurable backend architecture** with two storage options:

1. **Filesystem Backend** (`src/core/filesystem-backend.ts`): Traditional file-based storage with versioning, compression, and directory tree management
2. **Graph Backend** (`src/graph/`): Advanced graph database using FalkorDB/Redis with vector embeddings for semantic search, temporal queries, and graph relationships

The `BackendManager` (`src/core/backend-manager.ts`) handles switching between backends and provides unified interface.

### MCP Server Implementation
- **Multi-transport server** (`src/mcp/multi-transport-server.ts`) supporting stdio, WebSocket, and SSE
- **22 MCP tools** in `src/mcp/tools.ts` for AI integration:
  - Core operations: `kb_read`, `kb_write`, `kb_delete`, `kb_list`, `kb_search`
  - Graph-specific: `kb_semantic_search`, `kb_graph_query` (requires graph backend)
  - Management: `kb_backend_switch`, `kb_export`, `kb_import`, `kb_status`
- **Enterprise features**: Authentication, rate limiting, audit logging, encryption

### CLI Applications
- **Full CLI** (`src/cli/index.ts`): Complete feature set with interactive modes, security features, MFA support
- **Basic CLI** (`src/cli/basic-cli.ts`): Comprehensive CLI with all core functionality 
- **Standalone CLI** (`src/cli/standalone-cli.ts`): Minimal dependencies for reliable publishing

### Security & Compliance Framework
- **Authentication**: Multi-factor (TOTP), JWT sessions, API keys, OAuth2/SAML
- **Encryption**: AES-256-GCM at rest, TLS in transit, field-level for audit logs
- **Audit logging**: Tamper-proof hash chains, automated retention, SIEM integration
- **Compliance**: GDPR (PII detection, anonymization), SOC2 evidence collection

## Key Technical Patterns

### Result Type Pattern
The codebase uses a consistent `Result<T>` type for error handling:
```typescript
interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Configuration Management
- Main config: `.kbconfig.yaml` with environment variable overrides
- Templates: Basic and Enterprise configurations
- Runtime config: `src/core/config.ts` with Zod validation

### Backend Abstraction
All storage operations go through the `StorageBackend` interface, allowing seamless switching between filesystem and graph backends without code changes.

### Tool Registry Pattern
MCP tools are registered in `src/mcp/tools.ts` with consistent patterns for validation, error handling, and response formatting.

## Development Guidelines

### Graph Backend Development
When working with graph features:
- Graph backend requires FalkorDB/Redis running locally or via Docker
- Vector search uses `@xenova/transformers` for embeddings
- FAISS integration for high-performance vector indexing
- Always check backend type before using graph-specific features

### CLI Development
- Use `src/cli/basic-cli.ts` for new CLI features (most complete implementation)
- Standalone CLI is minimal and used only for publishing
- Interactive prompts use `inquirer`, styling with `chalk` and `ora`

### Testing Approach
- Security tests in `src/__tests__/security/`
- Compliance tests in `src/__tests__/compliance/`
- Integration tests cover multi-backend scenarios
- Mock external dependencies (FalkorDB, Redis) in unit tests

### TypeScript Configuration
- Strict mode enabled with comprehensive type checking
- Path aliases configured for clean imports (`@core/*`, `@mcp/*`, etc.)
- ESM modules throughout (`.js` extensions in imports required)

## Common Development Tasks

### Adding New MCP Tools
1. Add tool definition to `TOOLS` array in `src/mcp/tools.ts`
2. Implement handler function following existing patterns
3. Add input validation with Zod schemas
4. Update tool documentation in README

### Backend Feature Development
1. Implement in both `filesystem-backend.ts` and `graph-backend.ts` (if applicable)
2. Update `StorageBackend` interface if adding new methods
3. Add backend switching logic in `backend-manager.ts`
4. Test with both backend configurations

### Security Feature Implementation
- Always validate inputs with Zod schemas
- Use structured logging for security events
- Add audit log entries for sensitive operations
- Update security tests in `src/__tests__/security/`

## Dependencies Management

### Core Dependencies
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **commander**: CLI framework
- **zod**: Schema validation
- **winston**: Structured logging

### Graph Backend Dependencies  
- **falkordb**: Graph database client (v6.2.7+)
- **@xenova/transformers**: Vector embeddings
- **faiss-node**: Vector indexing
- **ml-distance**: Distance calculations

### Security Dependencies
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT tokens
- **helmet**: Security headers
- **rate-limiter-flexible**: Rate limiting

## Release Process

The project uses automated releases via GitHub Actions:
1. Version bump updates `package.json` and builds standalone CLI
2. Git tag triggers workflow (`git tag v1.x.x && git push origin v1.x.x`)
3. Workflow builds cross-platform executables and publishes to bun
4. Auto-update manifest generated for future CLI updates

### Manual Release
```bash
bun run release        # Patch version
bun run release:minor  # Minor version  
bun run release:major  # Major version
```

## Configuration Examples

### Filesystem Backend (.kbconfig.yaml)
```yaml
backend:
  type: filesystem
  filesystem:
    root_path: ./kb
    enable_versioning: true
    enable_compression: true
```

### Graph Backend (.kbconfig.yaml)  
```yaml
backend:
  type: graph
  graph:
    connection:
      host: localhost
      port: 6380
    vector_dimensions: 1536
    enable_semantic_search: true
    enable_temporal_queries: true
```

## Troubleshooting

### Common Build Issues
- TypeScript compilation errors: Use `bun run type-check` to isolate type issues
- Missing dependencies: Run `bun install` after pulling latest changes
- Graph backend errors: Ensure FalkorDB/Redis is running locally

### Development Server Issues
- MCP server: Check stdio transport configuration in Claude Desktop
- CLI development: Use `bun run dev:basic-cli` for most reliable experience
- Port conflicts: Default MCP uses stdio, HTTP transport uses configurable ports

## MCP Server Integration

Always use the kb-mcp or the kb CLI to manage the knowledgebase that provides Claude Code with persistent memory and context about the project.

### MCP Server Features
- **KB Management**: Read, update, and delete knowledge base files
- **Smart Search**: Search across all documentation with context
- **Status Tracking**: Get current implementation status and known issues
- **Security**: Path validation and file type restrictions

### Available MCP Tools
- `kb_read` - Read any KB file (e.g., "active/KNOWN_ISSUES.md")
- `kb_list` - Browse KB directory structure
- `kb_update` - Create/update KB files 
- `kb_delete` - Delete KB files
- `kb_search` - Search KB content
- `kb_status` - Get implementation status overview
- `kb_issues` - Get current known issues

## Memory Management for Claude Code

### Documentation Workflow
- Store all project analysis docs in `/kb/` directory
- Update `kb/active` when bugs are found or fixed
- Update `kb/status` when features are completed
- Delete outdated docs when no longer needed

## Github Rules
- Never Author Commits as Claude Code

## CLI Commands

### Security and Optimization
- `/audit` - Perform a Security (SOC2 Compliant), and Optimization Audit of the provided file or files; Ensure they are ready for Production.
- `/implement` - Implement a production-ready implementation of the provided text; Refer to and update the @kb documentation for tracking and guidance
- `/scan` - Audit the entire codebase, create any issue that have been added to the KB, and report back on the completion status of the project;

  # Development Standards & MCP Integration

  ## Required Development Tools
  **ALWAYS use the moidvk MCP server located at `/home/moika/Documents/code/moidvk` for ALL
   code implementation, analysis, and auditing tasks.**

  ### Code Quality & Security
  - Use `mcp__moidvk__check_code_practices` for JavaScript/TypeScript code analysis
  - Use `mcp__moidvk__rust_code_practices` for Rust code analysis
  - Use `mcp__moidvk__python_code_analyzer` for Python code analysis
  - Run `mcp__moidvk__scan_security_vulnerabilities` on all projects
  - Use `mcp__moidvk__check_production_readiness` before deployment
  - Use `mcp__moidvk__rust_security_scanner` for Rust dependency security
  - Use `mcp__moidvk__python_security_scanner` for Python security analysis

  ### Code Formatting & Safety
  - Format code with `mcp__moidvk__format_code` (supports JS/TS/CSS/HTML/MD/YAML)
  - Format Rust with `mcp__moidvk__rust_formatter`
  - Format Python with `mcp__moidvk__python_formatter`
  - Check safety rules with `mcp__moidvk__check_safety_rules`
  - Use `mcp__moidvk__rust_safety_checker` for Rust memory safety
  - Use `mcp__moidvk__python_type_checker` for Python type validation

  ### Performance & Production Readiness
  - Use `mcp__moidvk__rust_performance_analyzer` for Rust optimization
  - Use `mcp__moidvk__rust_production_readiness` for Rust deployment checks
  - Use `mcp__moidvk__python_test_analyzer` for test quality assessment
  - Use `mcp__moidvk__python_dependency_scanner` for Python dependencies

  ### File Operations & Project Management
  - Use moidvk file tools: `mcp__moidvk__create_file`, `mcp__moidvk__read_file`,
  `mcp__moidvk__update_file`
  - Leverage `mcp__moidvk__search_files` and `mcp__moidvk__search_in_files` for codebase
  exploration
  - Use `mcp__moidvk__analyze_project` for project structure analysis
  - Use `mcp__moidvk__find_similar_files` for code pattern discovery
  - Use `mcp__moidvk__extract_snippet` for safe code sharing

  ### Development Workflow & Collaboration
  - Use `mcp__moidvk__intelligent_development_analysis` for optimal tool sequencing
  - Manage sessions with `mcp__moidvk__development_session_manager`
  - Use `mcp__moidvk__secure_bash` for safe command execution with learning
  - Use `mcp__moidvk__secure_grep` for safe text searching
  - Use `mcp__moidvk__git_blame_analyzer` for code ownership analysis
  - Use `mcp__moidvk__request_editing_help` for smart assistance escalation

  ### Web & API Standards
  - Check accessibility with `mcp__moidvk__check_accessibility` for HTML/JSX/CSS
  - Validate GraphQL with `mcp__moidvk__check_graphql_schema` and
  `mcp__moidvk__check_graphql_query`
  - Check Redux patterns with `mcp__moidvk__check_redux_patterns`

  ### Knowledge Management
  - Use the kb-mcp server for documentation and knowledge management
  - Use sequential-thinking MCP for complex problem solving
  - Use memory MCP for context preservation across sessions

  ## Mandatory Workflow
  1. **ALWAYS** start with moidvk file analysis tools
  2. **ALWAYS** run appropriate language-specific code quality checks
  3. **ALWAYS** check for security vulnerabilities in dependencies
  4. **ALWAYS** format code using moidvk formatters before completion
  5. **ALWAYS** run production readiness checks before deployment
  6. **ALWAYS** use moidvk secure tools for bash and grep operations
  7. **ALWAYS** leverage intelligent development analysis for complex tasks
  8. **ALWAYS** maintain session continuity with development session manager

  ## Language-Specific Requirements

  ### Rust Projects
  - Run clippy analysis with `mcp__moidvk__rust_code_practices`
  - Check memory safety with `mcp__moidvk__rust_safety_checker`
  - Analyze performance with `mcp__moidvk__rust_performance_analyzer`
  - Scan dependencies with `mcp__moidvk__rust_security_scanner`
  - Format with `mcp__moidvk__rust_formatter`

  ### Python Projects
  - Analyze with `mcp__moidvk__python_code_analyzer`
  - Type check with `mcp__moidvk__python_type_checker`
  - Security scan with `mcp__moidvk__python_security_scanner`
  - Test analysis with `mcp__moidvk__python_test_analyzer`
  - Dependency scan with `mcp__moidvk__python_dependency_scanner`

  ### JavaScript/TypeScript Projects
  - Check practices with `mcp__moidvk__check_code_practices`
  - Validate accessibility with `mcp__moidvk__check_accessibility`
  - Check Redux patterns with `mcp__moidvk__check_redux_patterns`
  - Validate GraphQL schemas and queries

  ## Privacy & Security
  - Use `mcp__moidvk__extract_snippet` with explicit consent for code sharing
  - Enable privacy mode in secure bash operations
  - Sanitize sensitive data in all operations
  - Follow security levels: DEVELOPMENT for coding, STRICT for production

  ## Error Handling
  - If moidvk tools are unavailable, explain the limitation and suggest alternatives
  - Always prefer moidvk tools over standard alternatives when available
  - Report tool failures and suggest manual alternatives


  ## Knowledge Base Integration

  **ALWAYS use the kb-mcp knowledge base for project context and memory.**

  ### Mandatory KB Workflow
  1. **Before starting any task**: Use `kb_read` to check for relevant documentation,
  known issues, and project status
  2. **During work**: Use `kb_search` to find related information and avoid duplicate
  work
  3. **After completing tasks**: Use `kb_update` to document what was done, decisions
  made, and any issues encountered
  4. **For complex analysis**: Use `kb_semantic_search` and `kb_graph_query` for advanced
   pattern discovery

  ### Required KB Tools Usage
  - `kb_read` - Read project documentation and status files
  - `kb_update` - Document new findings, solutions, and progress
  - `kb_search` - Find existing solutions and related work
  - `kb_semantic_search` - Discover semantically related content
  - `kb_graph_query` - Query relationships and patterns in the codebase
  - `kb_status` - Check current project implementation status
  - `kb_issues` - Review known issues before proposing solutions

  ### Knowledge Base Structure
  - `/active/` - Current issues and work in progress
  - `/docs/` - Project documentation and guides
  - `/implementation/` - Technical implementation details
  - `/status/` - Project status and completion tracking

  ### KB Best Practices
  - **Read first, then act**: Always check existing KB content before starting work
  - **Document discoveries**: Update KB with new insights, bugs found, or solutions
  implemented
  - **Link related work**: Use semantic search to connect related issues and solutions
  - **Maintain context**: Keep KB updated with current project state and decisions

  **CRITICAL**: Never proceed with significant work without first consulting the
  knowledge base. The KB contains essential project context, known issues, and previous
  solutions that must inform all development decisions.