#!/bin/bash

# KB-MCP Universal Installer
# Detects platform and installs the appropriate version

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO="moikas-code/kb-mcp"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="kb"

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════╗"
    echo "║        KB-MCP Installer v1.0.0        ║"
    echo "║   Enterprise Knowledge Base Manager   ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

detect_platform() {
    local os=""
    local arch=""
    
    # Detect OS
    case "$(uname -s)" in
        Linux*)     os="linux";;
        Darwin*)    os="darwin";;
        CYGWIN*|MINGW*|MSYS*) os="windows";;
        *)          
            print_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac
    
    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64";;
        aarch64|arm64)  arch="arm64";;
        *)              
            print_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac
    
    echo "${os}-${arch}"
}

check_dependencies() {
    local deps=("curl" "tar" "gzip")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        print_error "Missing required dependencies: ${missing[*]}"
        print_info "Please install them and try again"
        exit 1
    fi
}

get_latest_version() {
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    local version
    
    print_info "Fetching latest version..."
    
    version=$(curl -s "$api_url" | grep '"tag_name":' | sed -E 's/.*"v?([^"]+)".*/\1/')
    
    if [ -z "$version" ]; then
        print_error "Failed to fetch latest version"
        exit 1
    fi
    
    echo "$version"
}

download_binary() {
    local version=$1
    local platform=$2
    local download_url="https://github.com/${REPO}/releases/download/v${version}/kb-mcp-${platform}"
    
    if [[ "$platform" == *"windows"* ]]; then
        download_url="${download_url}.exe"
    fi
    
    local temp_dir=$(mktemp -d)
    local binary_path="${temp_dir}/kb-mcp"
    
    print_info "Downloading KB-MCP ${version} for ${platform}..."
    
    if ! curl -L -o "$binary_path" "$download_url" --progress-bar; then
        print_error "Failed to download binary"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    # Download checksum
    local checksum_url="${download_url}.sha256"
    local checksum_path="${temp_dir}/kb-mcp.sha256"
    
    if curl -s -L -o "$checksum_path" "$checksum_url" 2>/dev/null; then
        print_info "Verifying checksum..."
        
        # Verify checksum
        local expected_checksum=$(cat "$checksum_path" | awk '{print $1}')
        local actual_checksum=$(sha256sum "$binary_path" | awk '{print $1}')
        
        if [ "$expected_checksum" != "$actual_checksum" ]; then
            print_error "Checksum verification failed"
            rm -rf "$temp_dir"
            exit 1
        fi
        
        print_success "Checksum verified"
    else
        print_warning "Checksum file not found, skipping verification"
    fi
    
    echo "$binary_path"
}

install_binary() {
    local binary_path=$1
    local install_path="${INSTALL_DIR}/${BINARY_NAME}"
    
    # Check if we need sudo
    if [ -w "$INSTALL_DIR" ]; then
        SUDO=""
    else
        SUDO="sudo"
        print_info "Administrator privileges required for installation"
    fi
    
    # Make binary executable
    chmod +x "$binary_path"
    
    # Install binary
    print_info "Installing to ${install_path}..."
    
    if ! $SUDO mv "$binary_path" "$install_path"; then
        print_error "Failed to install binary"
        exit 1
    fi
    
    print_success "KB-MCP installed successfully!"
}

install_via_npm() {
    print_info "Installing via npm..."
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        print_info "Please install Node.js and npm from https://nodejs.org"
        exit 1
    fi
    
    if npm install -g kb-mcp; then
        print_success "KB-MCP installed successfully via npm!"
        return 0
    else
        print_error "npm installation failed"
        return 1
    fi
}

main() {
    print_header
    
    # Parse arguments
    local method="auto"
    local version=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --npm)
                method="npm"
                shift
                ;;
            --binary)
                method="binary"
                shift
                ;;
            --version)
                version="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --npm       Install via npm"
                echo "  --binary    Install pre-compiled binary"
                echo "  --version   Specify version to install"
                echo "  --help      Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Check for existing installation
    if command -v kb &> /dev/null; then
        local current_version=$(kb --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        print_warning "KB-MCP is already installed (version: ${current_version:-unknown})"
        read -p "Do you want to reinstall? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Installation cancelled"
            exit 0
        fi
    fi
    
    # Install based on method
    case $method in
        npm)
            install_via_npm
            ;;
        binary)
            check_dependencies
            platform=$(detect_platform)
            
            if [ -z "$version" ]; then
                version=$(get_latest_version)
            fi
            
            binary_path=$(download_binary "$version" "$platform")
            install_binary "$binary_path"
            
            # Cleanup
            rm -rf "$(dirname "$binary_path")"
            ;;
        auto)
            # Try npm first, fall back to binary
            if command -v npm &> /dev/null; then
                print_info "npm detected, attempting npm installation..."
                if install_via_npm; then
                    exit 0
                fi
                print_info "Falling back to binary installation..."
            fi
            
            check_dependencies
            platform=$(detect_platform)
            
            if [ -z "$version" ]; then
                version=$(get_latest_version)
            fi
            
            binary_path=$(download_binary "$version" "$platform")
            install_binary "$binary_path"
            
            # Cleanup
            rm -rf "$(dirname "$binary_path")"
            ;;
    esac
    
    # Verify installation
    if command -v kb &> /dev/null; then
        print_success "Installation complete!"
        echo
        print_info "Run 'kb --help' to get started"
        print_info "Run 'kb init' to initialize a new knowledge base"
    else
        print_error "Installation verification failed"
        exit 1
    fi
}

# Run main function
main "$@"