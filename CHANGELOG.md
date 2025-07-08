# Changelog

All notable changes to KB-MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2025-07-08

### Added
- **Configurable Backend System**: Users can now choose between file-based and graph-based storage
- **Backend Management Tools**: New MCP tools for backend switching and health monitoring
- **Unified Storage Interface**: Common API for both filesystem and graph backends  
- **Data Migration**: Seamless migration between storage backends
- **Configuration Management**: YAML-based configuration with `.kbconfig.yaml`
- **Health Monitoring**: Backend health checks and status reporting

### Enhanced
- **MCP Tools**: All existing tools now work with both storage backends
- **Storage Flexibility**: Automatic fallback from graph to filesystem if graph unavailable
- **User Choice**: Simple file storage (default) or advanced graph features (optional)

### Technical
- `StorageBackend` interface for unified storage operations
- `BackendManager` for configuration and switching
- `FilesystemBackend` and `GraphBackend` implementations
- Enhanced error handling and status reporting

## [1.0.1] - 2025-07-08

### Fixed
- Removed false SOC2 compliance claims
- Added honest security roadmap documentation
- Updated CLI help text to reflect current capabilities

## [1.0.0] - 2025-07-08

### Added
- Initial release of KB-MCP
- Enterprise-grade knowledge base management system
- Model Context Protocol (MCP) server implementation
- Graph-based memory system using FalkorDB
- Vector embeddings and semantic search
- Temporal memory with time-based queries
- Working memory for session management
- SOC2-compliant security features
- Multi-factor authentication (MFA) with TOTP
- AES-256-GCM encryption for data at rest
- Comprehensive audit logging
- Rate limiting and DDoS protection
- Auto-update system with secure verification
- Multi-platform support (Windows, macOS, Linux)
- Docker support with production-ready images
- CLI with comprehensive commands
- GDPR compliance features

### Security
- Fixed MFA bypass vulnerability
- Fixed encryption salt handling
- Removed default admin credentials
- Implemented secure key management
- Added vector similarity optimization
- Added database connection pooling
- Implemented memory leak detection

## [1.0.0] - 2025-01-08

### Added
- First stable release
- Complete feature set for production use
- Comprehensive documentation
- Enterprise deployment guides

### Changed
- Package name from @secure/kb-manager to kb-mcp
- Repository moved to https://github.com/moikas-code/kb-mcp

### Fixed
- All critical security vulnerabilities resolved
- Performance optimizations implemented
- Memory management improvements

[Unreleased]: https://github.com/moikas-code/kb-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/moikas-code/kb-mcp/releases/tag/v1.0.0