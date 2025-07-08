# KB-MCP Build & Distribution Guide

## Overview

KB-MCP is distributed through multiple channels to accommodate different user needs:
- **NPM**: For Node.js developers and easy global installation
- **GitHub Releases**: Pre-compiled binaries for all platforms
- **Docker Hub**: Production-ready containers
- **Source**: Direct installation from GitHub

## Build System

### Technology Stack
- **Language**: TypeScript (compiled to ES2022)
- **Runtime**: Node.js 18+ 
- **Package Manager**: npm
- **Binary Compiler**: pkg (for standalone executables)
- **Container**: Docker with multi-stage builds

### Build Process

1. **TypeScript Compilation**
   ```bash
   npm run build
   ```
   - Compiles TypeScript to JavaScript
   - Generates type definitions
   - Creates source maps

2. **Binary Generation**
   ```bash
   node scripts/build-binary.js --platform=<platform> --arch=<arch>
   # or for all platforms:
   node scripts/build-all-binaries.js
   ```
   - Creates standalone executables
   - No Node.js required on target system
   - Includes all dependencies

3. **Docker Images**
   ```bash
   ./scripts/docker-build.sh --push
   ```
   - Multi-architecture support (AMD64, ARM64)
   - Alpine-based for minimal size
   - Production security hardening

## Distribution Channels

### 1. NPM Package Registry

**Installation:**
```bash
npm install -g kb-mcp
```

**What's Included:**
- Compiled JavaScript files
- TypeScript definitions
- CLI executable
- MCP server

**Publishing Process:**
```bash
npm run release        # Patch release (1.0.x)
npm run release:minor  # Minor release (1.x.0)
npm run release:major  # Major release (x.0.0)
```

### 2. GitHub Releases

**Installation:**
```bash
# Using install script
curl -fsSL https://raw.githubusercontent.com/moikas-code/kb-mcp/main/install.sh | bash

# Manual download
wget https://github.com/moikas-code/kb-mcp/releases/latest/download/kb-mcp-linux-x64
chmod +x kb-mcp-linux-x64
sudo mv kb-mcp-linux-x64 /usr/local/bin/kb
```

**Available Binaries:**
- `kb-mcp-linux-x64` - Linux x64
- `kb-mcp-linux-arm64` - Linux ARM64
- `kb-mcp-darwin-x64` - macOS Intel
- `kb-mcp-darwin-arm64` - macOS Apple Silicon
- `kb-mcp-win32-x64.exe` - Windows x64

**Each Release Includes:**
- Binary executables
- SHA256 checksums
- Release notes
- Source code archives

### 3. Docker Hub

**Installation:**
```bash
# Latest stable
docker pull moikascode/kb-mcp:latest

# Specific version
docker pull moikascode/kb-mcp:1.0.0

# Alpine variant
docker pull moikascode/kb-mcp:alpine
```

**Running:**
```bash
# Using docker-compose
docker-compose up -d

# Direct run
docker run -d \
  -p 3000:3000 \
  -v kb-data:/app/kb \
  moikascode/kb-mcp:latest
```

### 4. Source Installation

**Installation:**
```bash
git clone https://github.com/moikas-code/kb-mcp.git
cd kb-mcp
npm install
npm run build
npm link
```

## Auto-Update System

KB-MCP includes a built-in auto-update system that:

### Features
- Checks GitHub releases for new versions
- Verifies SHA256 checksums
- Supports gradual rollout
- Allows rollback on failure
- Respects user preferences

### Usage
```bash
# Check for updates
kb update check

# Install available update
kb update install

# Configure auto-updates
kb update config --enable true --interval 4
```

### Update Flow
1. Check GitHub API for latest release
2. Compare with current version using semver
3. Download platform-specific binary
4. Verify checksum
5. Create backup of current version
6. Atomic replacement
7. Restart application

### Security
- All binaries are checksum verified
- HTTPS only for downloads
- Signed releases (GPG)
- Rollback on verification failure

## CI/CD Pipeline

### GitHub Actions Workflows

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on every push and PR
   - Tests on multiple Node versions
   - Security scanning
   - Code quality checks

2. **Release Workflow** (`.github/workflows/release.yml`)
   - Triggered by version tags
   - Builds all distribution formats
   - Publishes to all channels
   - Creates GitHub release

### Release Automation

When a tag is pushed:
1. Run all tests
2. Build TypeScript
3. Generate binaries for all platforms
4. Build Docker images
5. Publish to NPM
6. Push to Docker Hub
7. Create GitHub release with assets

## Version Management

### Versioning Scheme
- Follows [Semantic Versioning](https://semver.org/)
- Format: `MAJOR.MINOR.PATCH`
- Pre-releases: `1.0.0-beta.1`

### Version Locations
- `package.json` - Source of truth
- Binary metadata - Embedded version
- Docker tags - Match npm versions
- Git tags - `v` prefix (e.g., `v1.0.0`)

## Platform Support

### Officially Supported
- **Windows**: Windows 10/11 (x64)
- **macOS**: 10.15+ (Intel & Apple Silicon)
- **Linux**: Ubuntu 20.04+, RHEL 8+, Alpine
- **Docker**: Any Docker-compatible platform

### Node.js Versions
- Minimum: Node.js 18
- Recommended: Node.js 20
- Tested: 18, 20, 22

## Installation Methods Summary

### For Developers
```bash
npm install -g kb-mcp
```

### For System Administrators
```bash
# Download binary
curl -LO https://github.com/moikas-code/kb-mcp/releases/latest/download/kb-mcp-linux-x64
chmod +x kb-mcp-linux-x64
sudo mv kb-mcp-linux-x64 /usr/local/bin/kb
```

### For Containers
```bash
docker run -d -p 3000:3000 moikascode/kb-mcp:latest
```

### For Enterprise
- Use private npm registry
- Mirror Docker images
- Distribute binaries via internal systems
- Customize `docker-compose.yml`

## Troubleshooting

### NPM Installation Issues
```bash
# Clear npm cache
npm cache clean --force

# Use different registry
npm install -g kb-mcp --registry https://registry.npmjs.org/
```

### Binary Execution Issues
```bash
# Check architecture
uname -m

# Make executable
chmod +x kb-mcp-*

# Check dependencies (Linux)
ldd kb-mcp-linux-x64
```

### Docker Issues
```bash
# Check logs
docker logs kb-mcp

# Verify image
docker inspect moikascode/kb-mcp:latest
```

## Security Considerations

### Binary Distribution
- All binaries are built in CI environment
- SHA256 checksums provided
- Consider GPG signing for verification

### NPM Security
- 2FA enabled on npm account
- Automated vulnerability scanning
- Lock file committed

### Docker Security
- Non-root user in container
- Minimal base image (Alpine)
- Security scanning in CI
- Regular base image updates

## Future Enhancements

### Planned Distribution Methods
- Homebrew formula for macOS
- Snap package for Linux
- Chocolatey package for Windows
- APT/YUM repositories

### Planned Features
- Delta updates for binaries
- Automatic rollback
- Update channels (stable/beta/nightly)
- Offline update packages