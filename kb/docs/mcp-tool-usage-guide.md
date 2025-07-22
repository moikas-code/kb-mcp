# MCP Tool Usage Guide - Accurate Tool Invocation

## 🎯 Purpose
This guide ensures accurate and consistent usage of MCP (Model Context Protocol) tools across all development environments and AI assistants.

## 🔧 Tool Name Standards

### KB-MCP Tools (Knowledge Base Management)
**Correct Format**: `kb-mcp_[tool_name]`

| Correct Tool Name | Purpose | Example Usage |
|------------------|---------|---------------|
| `kb-mcp_kb_read` | Read KB files | Read documentation, status files |
| `kb-mcp_kb_update` | Create/update KB files | Document findings, update status |
| `kb-mcp_kb_delete` | Delete KB files | Remove outdated documentation |
| `kb-mcp_kb_list` | List KB directory contents | Browse KB structure |
| `kb-mcp_kb_search` | Search KB content | Find existing solutions |
| `kb-mcp_kb_status` | Get implementation status | Check project completion |
| `kb-mcp_kb_issues` | Get known issues | Review current problems |
| `kb-mcp_kb_backend_info` | Backend information | Check storage backend |
| `kb-mcp_kb_semantic_search` | Semantic search (graph only) | Advanced content discovery |
| `kb-mcp_kb_graph_query` | Graph queries (graph only) | Complex relationship queries |

### Moidvk Tools (Development & Analysis)
**Correct Format**: `moidvk_[tool_name]`

| Category | Correct Tool Name | Purpose |
|----------|------------------|---------|
| **Code Quality** | `moidvk_check_code_practices` | JS/TS ESLint analysis |
| | `moidvk_rust_code_practices` | Rust Clippy analysis |
| | `moidvk_python_code_analyzer` | Python Ruff analysis |
| **Formatting** | `moidvk_format_code` | Prettier formatting |
| | `moidvk_rust_formatter` | Rust rustfmt |
| | `moidvk_python_formatter` | Python Black |
| **Security** | `moidvk_scan_security_vulnerabilities` | Dependency scanning |
| | `moidvk_check_safety_rules` | NASA JPL safety rules |
| | `moidvk_rust_safety_checker` | Rust memory safety |
| | `moidvk_python_security_scanner` | Python Bandit analysis |
| **Production** | `moidvk_check_production_readiness` | JS/TS production checks |
| | `moidvk_rust_production_readiness` | Rust production checks |
| | `moidvk_js_test_analyzer` | Test quality analysis |
| **Performance** | `moidvk_rust_performance_analyzer` | Rust performance |
| | `moidvk_python_performance_analyzer` | Python performance |
| | `moidvk_js_performance_analyzer` | JS/TS performance |

## ❌ Common Tool Name Errors

### Incorrect Formats to Avoid:
- `Mcp__kb__kb_update` ❌ (Wrong casing, double underscores)
- `kb_update` ❌ (Missing namespace prefix)
- `mcp_kb_update` ❌ (Wrong namespace format)
- `KB_MCP_kb_update` ❌ (Wrong casing)
- `moidvk__check_code_practices` ❌ (Double underscores)
- `mcp__moidvk__format_code` ❌ (Wrong namespace format)

### Correct Format Examples:
- `kb-mcp_kb_update` ✅
- `moidvk_check_code_practices` ✅
- `moidvk_format_code` ✅

## 🔍 Tool Discovery & Validation

### Before Using Any MCP Tool:
1. **Verify tool availability** in your MCP client
2. **Check exact tool name** - case sensitive, exact underscores
3. **Validate required parameters** - don't guess parameter names
4. **Test with simple operation** first

### Tool Name Verification Commands:
```bash
# List available MCP tools (if supported by client)
mcp list-tools

# Check specific tool schema
mcp describe-tool kb-mcp_kb_read
```

## 📋 Parameter Standards

### Required vs Optional Parameters
- **Always provide required parameters** - tools will fail without them
- **Don't guess optional parameters** - omit if unsure
- **Use exact parameter names** - case sensitive

### Common Parameter Patterns:
```json
{
  "path": "relative/path/to/file.md",     // KB file paths
  "content": "markdown content here",      // File content
  "code": "source code to analyze",       // Code analysis
  "filename": "optional-context.js",      // Optional context
  "limit": 50,                            // Pagination limit
  "offset": 0                             // Pagination offset
}
```

## 🚨 Error Handling

### When Tool Names Don't Work:
1. **Check exact spelling** - no typos, correct case
2. **Verify MCP server is running** - kb-mcp, moidvk servers
3. **Restart MCP client** - clear cached tool registry
4. **Check server logs** - look for connection issues

### Common Error Messages:
- "Tool not found" → Check tool name spelling
- "Missing required parameter" → Add required params
- "Invalid parameter" → Check parameter names/types
- "Server not responding" → Restart MCP servers

## 🔄 Best Practices

### Tool Usage Workflow:
1. **Start with KB tools** - Check existing knowledge first
2. **Use appropriate analysis tools** - Match language/framework
3. **Format code before completion** - Always run formatters
4. **Update KB with findings** - Document discoveries
5. **Validate with security tools** - Run vulnerability scans

### Tool Combination Patterns:
```
Analysis → Formatting → Security → Documentation
kb-mcp_kb_read → moidvk_check_code_practices → moidvk_format_code → kb-mcp_kb_update
```

## 🎯 Prompt Template for Accurate Tool Usage

Use this template when instructing AI assistants:

```
CRITICAL: Use exact MCP tool names with correct formatting:

KB-MCP Tools: kb-mcp_[tool_name]
- kb-mcp_kb_read, kb-mcp_kb_update, kb-mcp_kb_search, etc.

Moidvk Tools: moidvk_[tool_name]  
- moidvk_check_code_practices, moidvk_format_code, etc.

NEVER use:
- Wrong casing (Mcp__, KB_MCP_)
- Double underscores (mcp__kb__, moidvk__)
- Missing namespaces (kb_update, format_code)

ALWAYS:
1. Verify tool name spelling exactly
2. Provide all required parameters
3. Check tool availability before use
4. Handle errors gracefully with alternatives
```

## 📚 Reference Links
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [KB-MCP Documentation](../README.md)
- [Moidvk Tool Reference](https://github.com/moidvk/mcp-tools)

---
*Last Updated: 2025-01-22*
*Version: 1.0*