# Sharp Dependency Installation Issue

## Problem
The `sharp` image processing library is causing installation issues for global npm/bun installations. This dependency comes from `@xenova/transformers` which is only used for vector embeddings in the graph backend.

## Impact
- Users getting installation errors when running `npm install -g kb-mcp`
- Bun installations fail with native compilation errors
- Users who only need filesystem backend are forced to install heavy ML dependencies

## Current Workaround
```bash
# Install with ignored scripts
npm install -g kb-mcp --ignore-scripts

# Or use the installation script
curl -sSL https://raw.githubusercontent.com/moikas-code/kb-mcp/master/scripts/install-global.sh | bash
```

## Proposed Solution
1. Make `@xenova/transformers` an optional dependency
2. Lazy-load it only when graph backend with vector search is used
3. Provide clear error message if vector search is attempted without the dependency

## Implementation Notes
- The dependency is only imported in `src/graph/vector-memory.ts`
- Could use dynamic import: `await import('@xenova/transformers')`
- Add try-catch to provide helpful error message
- Document that vector search requires additional installation step

## Priority
Medium - affects user experience but has workarounds