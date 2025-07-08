#!/bin/bash

# Test script for Script KB MCP Server
# Usage: ./test-mcp.sh [command]

set -e

cd "$(dirname "$0")"

export SCRIPT_PROJECT_ROOT="/home/moika/code/script"

case "${1:-help}" in
    "build")
        echo "Building MCP server..."
        npm run build
        ;;
    "start")
        echo "Starting MCP server..."
        npm run dev
        ;;
    "test-list")
        echo "Testing tools list..."
        echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node dist/index.js
        ;;
    "test-kb-list")
        echo "Testing kb_list tool..."
        echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "kb_list", "arguments": {}}}' | node dist/index.js
        ;;
    "test-kb-status")
        echo "Testing kb_status tool..."
        echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "kb_status", "arguments": {}}}' | node dist/index.js
        ;;
    "test-kb-issues")
        echo "Testing kb_issues tool..."
        echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "kb_issues", "arguments": {}}}' | node dist/index.js
        ;;
    "help"|*)
        echo "Script KB MCP Server Test Helper"
        echo ""
        echo "Commands:"
        echo "  build        - Build the TypeScript project"
        echo "  start        - Start the MCP server in development mode"
        echo "  test-list    - Test tools list functionality"
        echo "  test-kb-list - Test kb_list tool"
        echo "  test-kb-status - Test kb_status tool"
        echo "  test-kb-issues - Test kb_issues tool"
        echo ""
        echo "Config file: ~/.config/Claude/claude_desktop_config.json"
        echo "Server path: /home/moika/code/script/script-kb-mcp/dist/index.js"
        ;;
esac