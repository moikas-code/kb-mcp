#!/bin/bash
# Global installation script for kb-mcp
# Handles sharp dependency issues

echo "Installing kb-mcp globally..."

# Try npm first (more reliable for native dependencies)
if command -v npm &> /dev/null; then
    echo "Using npm for installation..."
    npm install -g @moikas/kb-mcp@latest --ignore-scripts
    
    if [ $? -eq 0 ]; then
        echo "✓ Successfully installed kb-mcp"
        echo "Run 'kb --version' to verify installation"
    else
        echo "✗ npm installation failed, trying alternative method..."
        
        # Alternative: Install without optional dependencies
        npm install -g @moikas/kb-mcp@latest --no-optional --ignore-scripts
    fi
else
    echo "npm not found. Please install Node.js and npm first."
    exit 1
fi