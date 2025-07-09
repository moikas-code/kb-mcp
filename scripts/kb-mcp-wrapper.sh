#!/bin/bash
# kb-mcp wrapper script for automatic project detection and isolation
# This wrapper ensures kb-mcp uses the correct configuration based on the current directory

# Find the nearest .kbconfig.yaml by traversing up from current directory
find_config() {
    local dir="${KB_PROJECT_ROOT:-$PWD}"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/.kbconfig.yaml" ]]; then
            echo "$dir"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    return 1
}

# Check if we're in a project with .kbconfig.yaml
if PROJECT_ROOT=$(find_config); then
    echo "[kb-mcp-wrapper] Using project config at: $PROJECT_ROOT/.kbconfig.yaml" >&2
    export KB_CONFIG_PATH="$PROJECT_ROOT/.kbconfig.yaml"
    export KB_PROJECT_ROOT="$PROJECT_ROOT"
    cd "$PROJECT_ROOT" # Ensure we're in the project root
else
    echo "[kb-mcp-wrapper] No project config found, using default behavior" >&2
    # Don't set KB_CONFIG_PATH to let kb-mcp use its default logic
fi

# Execute kb with all arguments
exec kb "$@"