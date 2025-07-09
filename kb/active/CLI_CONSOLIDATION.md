# CLI Consolidation Issues

## Problem Statement
The project has multiple CLI implementations that need to be consolidated:
1. src/cli/index.ts - Main CLI with SecureKBManager (filesystem only)
2. src/cli/basic-cli.ts - Basic implementation 
3. src/cli/simple-cli.ts - Simple version
4. src/cli/standalone-cli.ts - Minimal for publishing

## Issues to Address

### Issue 1: Multiple CLI Versions
- **Status**: Active
- **Priority**: High
- **Description**: We have 4 different CLI implementations causing confusion and maintenance overhead

### Issue 2: Backend Manager Not Available in CLI
- **Status**: Active  
- **Priority**: High
- **Description**: The CLI uses SecureKBManager which only supports filesystem, while MCP server has full BackendManager with graph support

### Issue 3: Feature Parity
- **Status**: Active
- **Priority**: High
- **Description**: Different CLIs have different features - need to consolidate into one with all features

## Proposed Solution
1. Keep src/cli/index.ts as the main implementation
2. Add BackendManager support to replace SecureKBManager
3. Remove all alternate CLI versions
4. Update build and packaging to use single CLI

## Implementation Plan
- [ ] Analyze feature differences between CLIs
- [ ] Update main CLI to use BackendManager
- [ ] Remove alternate CLI files
- [ ] Update package.json and build scripts
- [ ] Test unified implementation
- [ ] Update documentation