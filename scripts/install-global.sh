#!/bin/bash
# Robust global install for kb-mcp

set -e

echo "Installing kb-mcp globally..."

# Check for Node.js and npm
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js (v18+)."
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo "npm not found. Please install npm."
    exit 1
fi

# Check for build tools (Linux/WSL2)
if [[ "$OSTYPE" == "linux-gnu"* ]] || grep -q Microsoft /proc/version 2>/dev/null; then
    if ! dpkg -s build-essential python3 make g++ &> /dev/null; then
        echo "Installing build tools (requires sudo)..."
        sudo apt-get update
        sudo apt-get install -y build-essential python3 make g++
    fi
fi

# Remove any global Bun install
if command -v bun &> /dev/null; then
    echo "Removing global Bun install of kb-mcp (if present)..."
    bun remove -g @moikas/kb-mcp || true
fi

echo "Using npm for installation..."
npm install -g @moikas/kb-mcp@latest --ignore-scripts || {
    echo "✗ npm installation failed, trying alternative method..."
    npm install -g @moikas/kb-mcp@latest --no-optional --ignore-scripts
}

echo "Rebuilding sharp (v0.32) for your environment..."
npm rebuild -g sharp@0.32 --unsafe-perm || true

echo "✓ Successfully installed kb-mcp (or attempted all fixes)"
echo "Run 'kb --version' to verify installation."
echo "If you still have issues, try a local install (see README)."