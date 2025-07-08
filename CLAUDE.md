
### External References  
- [MCP Specification](https://modelcontextprotocol.io/docs)

## Memory Management for Claude Code

### Documentation Workflow
- Store all project analysis docs in `/kb/` directory
- Update `kb/active` when bugs are found or fixed
- Update `kb/status` when features are completed
- Delete outdated docs when no longer needed

### Current Version: v0.5.0-alpha
- **Overall**: ~85% complete with security issues resolved
- **Focus**: Module system repair → Standard library expansion
- **Achievement**: All critical security vulnerabilities resolved with comprehensive DoS protection

## CLI Commands

### Security and Optimization
- `/audit` - Perform a Security (SOC2 Compliant), and Optimization Audit of the provided file or files; Ensure they are ready for Production.
- `/implement` - Implement a production-ready implementation of the provided text; Refer to and update the @kb documentation for tracking and guidance
- `/scan` - Audit the entire codebase, create any issue that have been added to the KB, and report back on the completion status of the project;

## MCP Server Integration

- Always use the kb-mcp or the kb CLI to manage the knowledgebase that provides Claude Code with persistent memory and context about the project.

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

### Configuration
MCP server is configured at: `~/.config/Claude/claude_desktop_config.json`
Test the server: `./test-mcp.sh`

### Usage Examples
- "Show me the current implementation status" → Uses `kb_status`
- "What are the known issues?" → Uses `kb_issues`
- "Update the roadmap with this milestone" → Uses `kb_update`
- "Search for async implementation details" → Uses `kb_search`

## Github Rules
- Never Author Commits as Claude Code