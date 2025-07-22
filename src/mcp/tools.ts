/**
 * MCP Tool implementations for Script KB
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { BackendManager } from "../core/backend-manager.js";

export function createTools(_backendManager: BackendManager): Tool[] {
  return [
    {
      name: "kb_read",
      description: "Read a file from the Script language knowledge base",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              'Path to the file relative to kb/ directory (e.g., "active/KNOWN_ISSUES.md")',
          },
        },
        required: ["path"],
      },
    },
    {
      name: "kb_list",
      description: "List files and directories in the Script knowledge base",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description:
              "Directory path relative to kb/ (optional, defaults to root)",
            default: "",
          },
        },
      },
    },
    {
      name: "kb_update",
      description: "Create or update a file in the Script knowledge base",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file relative to kb/ directory",
          },
          content: {
            type: "string",
            description: "Content to write to the file (markdown format)",
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "kb_delete",
      description: "Delete a file from the Script knowledge base",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file relative to kb/ directory",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "kb_search",
      description: "Search for content in Script knowledge base files",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for",
          },
          directory: {
            type: "string",
            description:
              "Directory to search in (optional, searches all kb/ if not specified)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "kb_status",
      description:
        "Get the current implementation status of the Script language",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "kb_issues",
      description:
        "Get the current known issues in the Script language implementation",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "kb_backend_info",
      description:
        "Get information about the current storage backend and available options",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "kb_backend_switch",
      description: "Switch between storage backends (filesystem or graph)",
      inputSchema: {
        type: "object",
        properties: {
          backend_type: {
            type: "string",
            enum: ["filesystem", "graph"],
            description: "Backend type to switch to",
          },
          migrate_data: {
            type: "boolean",
            description: "Whether to migrate existing data to the new backend",
            default: false,
          },
        },
        required: ["backend_type"],
      },
    },
    {
      name: "kb_backend_health",
      description: "Check the health status of the current storage backend",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "kb_create",
      description:
        "Create a new file in the knowledge base (alias for kb_update)",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file relative to kb/ directory",
          },
          content: {
            type: "string",
            description: "Content to write to the file (markdown format)",
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "kb_semantic_search",
      description:
        "Perform semantic search using vector embeddings (graph backend only)",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language query for semantic search",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
            default: 10,
          },
          threshold: {
            type: "number",
            description: "Similarity threshold (0-1)",
            default: 0.7,
          },
        },
        required: ["query"],
      },
    },
    {
      name: "kb_graph_query",
      description:
        "Execute a custom graph query using Cypher syntax (graph backend only)",
      inputSchema: {
        type: "object",
        properties: {
          cypher: {
            type: "string",
            description: "Cypher query to execute",
          },
          params: {
            type: "object",
            description: "Parameters for the query",
            default: {},
          },
        },
        required: ["cypher"],
      },
    },

    // Code Analysis Tools
    {
      name: "analyze_codebase",
      description:
        "Analyze a codebase to extract entities, relationships, and generate insights",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the project directory to analyze",
          },
          includeTests: {
            type: "boolean",
            description: "Whether to include test files in analysis",
            default: false,
          },
          languages: {
            type: "array",
            items: { type: "string" },
            description:
              'Programming languages to analyze (e.g., ["typescript", "javascript"])',
            default: ["typescript", "javascript"],
          },
          maxDepth: {
            type: "number",
            description: "Maximum directory depth to scan",
            default: 10,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "find_function_calls",
      description:
        "Find all functions that call a specific function and trace call relationships",
      inputSchema: {
        type: "object",
        properties: {
          functionName: {
            type: "string",
            description: "Name of the function to trace calls for",
          },
          filePath: {
            type: "string",
            description: "Optional: specific file path to search in",
          },
          includeIndirect: {
            type: "boolean",
            description: "Include indirect calls (callers of callers)",
            default: false,
          },
          maxDepth: {
            type: "number",
            description: "Maximum depth for indirect calls",
            default: 3,
          },
        },
        required: ["functionName"],
      },
    },

    {
      name: "get_class_hierarchy",
      description:
        "Get the inheritance hierarchy for a class, including parents and children",
      inputSchema: {
        type: "object",
        properties: {
          className: {
            type: "string",
            description: "Name of the class to analyze",
          },
          filePath: {
            type: "string",
            description:
              "Optional: specific file path where the class is defined",
          },
          includeInterfaces: {
            type: "boolean",
            description: "Include implemented interfaces in the hierarchy",
            default: true,
          },
          maxDepth: {
            type: "number",
            description: "Maximum inheritance depth to traverse",
            default: 5,
          },
        },
        required: ["className"],
      },
    },

    {
      name: "impact_analysis",
      description:
        "Analyze the impact of changing a code entity (function, class, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          entityName: {
            type: "string",
            description: "Name of the entity to analyze impact for",
          },
          entityType: {
            type: "string",
            enum: ["function", "class", "interface", "type", "variable"],
            description: "Type of the entity",
          },
          filePath: {
            type: "string",
            description: "File path where the entity is defined",
          },
          changeType: {
            type: "string",
            enum: ["modify", "delete", "rename"],
            description: "Type of change being considered",
            default: "modify",
          },
        },
        required: ["entityName", "entityType", "filePath"],
      },
    },

    {
      name: "find_similar_code",
      description:
        "Find code patterns similar to a given code snippet using semantic search",
      inputSchema: {
        type: "object",
        properties: {
          codeSnippet: {
            type: "string",
            description: "Code snippet to find similar patterns for",
          },
          language: {
            type: "string",
            description: "Programming language of the snippet",
            default: "typescript",
          },
          threshold: {
            type: "number",
            description: "Similarity threshold (0-1)",
            default: 0.8,
          },
          limit: {
            type: "number",
            description: "Maximum number of similar patterns to return",
            default: 10,
          },
        },
        required: ["codeSnippet"],
      },
    },

    {
      name: "get_code_metrics",
      description: "Get code quality metrics for a project or specific files",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to analyze (project directory or specific file)",
          },
          includeComplexity: {
            type: "boolean",
            description: "Include cyclomatic complexity metrics",
            default: true,
          },
          includeDuplication: {
            type: "boolean",
            description: "Detect code duplication",
            default: true,
          },
          includeDebt: {
            type: "boolean",
            description: "Calculate technical debt indicators",
            default: true,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "query_code_graph",
      description: "Query the code knowledge graph using natural language",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Natural language question about the codebase",
          },
          context: {
            type: "string",
            description: "Optional context to help with query understanding",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return",
            default: 10,
          },
        },
        required: ["question"],
      },
    },

    {
      name: "find_patterns",
      description: "Detect design patterns and anti-patterns in the codebase",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to analyze for patterns",
          },
          patternTypes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "singleton",
                "factory",
                "observer",
                "strategy",
                "decorator",
                "adapter",
                "all",
              ],
            },
            description: "Types of patterns to detect",
            default: ["all"],
          },
          includeAntiPatterns: {
            type: "boolean",
            description: "Include anti-pattern detection",
            default: true,
          },
          confidenceThreshold: {
            type: "number",
            description: "Minimum confidence threshold for pattern detection",
            default: 0.7,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "suggest_refactoring",
      description:
        "Get AI-powered refactoring suggestions for code improvement",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "File path to analyze for refactoring opportunities",
          },
          functionName: {
            type: "string",
            description: "Optional: specific function to analyze",
          },
          refactoringTypes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "complexity",
                "duplication",
                "naming",
                "structure",
                "performance",
              ],
            },
            description: "Types of refactoring suggestions to generate",
            default: ["complexity", "duplication", "structure"],
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Minimum priority level for suggestions",
            default: "medium",
          },
        },
        required: ["filePath"],
      },
    },

    {
      name: "track_technical_debt",
      description: "Identify and quantify technical debt in the codebase",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to analyze for technical debt",
          },
          debtTypes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "complexity",
                "duplication",
                "outdated",
                "testing",
                "documentation",
                "security",
              ],
            },
            description: "Types of technical debt to track",
            default: ["complexity", "duplication", "testing"],
          },
          severityThreshold: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Minimum severity level to report",
            default: "medium",
          },
          includeMetrics: {
            type: "boolean",
            description: "Include detailed metrics and trends",
            default: true,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "architectural_overview",
      description:
        "Generate a high-level architectural overview of the codebase",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the project directory",
          },
          includeVisualization: {
            type: "boolean",
            description: "Include ASCII visualization of architecture",
            default: true,
          },
          focusAreas: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "modules",
                "dependencies",
                "patterns",
                "layers",
                "components",
              ],
            },
            description: "Specific architectural aspects to focus on",
            default: ["modules", "dependencies", "patterns"],
          },
          includeMetrics: {
            type: "boolean",
            description: "Include architectural quality metrics",
            default: true,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "find_usage",
      description:
        "Find all usages of a function, class, variable, or type across the codebase",
      inputSchema: {
        type: "object",
        properties: {
          symbolName: {
            type: "string",
            description: "Name of the symbol to find usages for",
          },
          symbolType: {
            type: "string",
            enum: [
              "function",
              "class",
              "interface",
              "type",
              "variable",
              "constant",
            ],
            description: "Type of the symbol",
          },
          definitionFile: {
            type: "string",
            description: "File where the symbol is defined",
          },
          includeDefinition: {
            type: "boolean",
            description: "Include the definition location in results",
            default: true,
          },
          groupByFile: {
            type: "boolean",
            description: "Group usage results by file",
            default: true,
          },
        },
        required: ["symbolName", "symbolType"],
      },
    },

    {
      name: "dependency_graph",
      description: "Visualize module and package dependencies in the project",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the project directory",
          },
          includeExternal: {
            type: "boolean",
            description: "Include external package dependencies",
            default: false,
          },
          maxDepth: {
            type: "number",
            description: "Maximum dependency depth to show",
            default: 5,
          },
          format: {
            type: "string",
            enum: ["text", "mermaid", "dot"],
            description: "Output format for the dependency graph",
            default: "text",
          },
          detectCircular: {
            type: "boolean",
            description: "Detect and highlight circular dependencies",
            default: true,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "dead_code_detection",
      description: "Identify unused code that can potentially be removed",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to analyze for dead code",
          },
          includeExported: {
            type: "boolean",
            description:
              "Include exported symbols that appear unused internally",
            default: false,
          },
          excludeTests: {
            type: "boolean",
            description: "Exclude test files from dead code analysis",
            default: true,
          },
          confidenceLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Confidence level for dead code detection",
            default: "medium",
          },
        },
        required: ["path"],
      },
    },

    {
      name: "security_analysis",
      description:
        "Perform basic security vulnerability analysis on the codebase",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to analyze for security issues",
          },
          vulnerabilityTypes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "injection",
                "xss",
                "hardcoded_secrets",
                "insecure_functions",
                "path_traversal",
              ],
            },
            description: "Types of vulnerabilities to check for",
            default: ["injection", "hardcoded_secrets", "insecure_functions"],
          },
          severityLevel: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Minimum severity level to report",
            default: "medium",
          },
          includeRecommendations: {
            type: "boolean",
            description: "Include fix recommendations",
            default: true,
          },
        },
        required: ["path"],
      },
    },

    {
      name: "performance_hotspots",
      description: "Identify potential performance bottlenecks in the code",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to analyze for performance issues",
          },
          analysisTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["complexity", "loops", "memory", "async", "algorithms"],
            },
            description: "Types of performance analysis to perform",
            default: ["complexity", "loops", "async"],
          },
          threshold: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Performance impact threshold",
            default: "medium",
          },
          includeOptimizations: {
            type: "boolean",
            description: "Include optimization suggestions",
            default: true,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "kb_export",
      description: "Export knowledge base data for backup or migration",
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["json", "yaml"],
            description: "Export format",
            default: "json",
          },
          include_metadata: {
            type: "boolean",
            description: "Include file metadata in export",
            default: true,
          },
        },
      },
    },
    {
      name: "kb_import",
      description: "Import knowledge base data from backup",
      inputSchema: {
        type: "object",
        properties: {
          data: {
            type: "string",
            description: "JSON or YAML data to import",
          },
          overwrite: {
            type: "boolean",
            description: "Whether to overwrite existing files",
            default: false,
          },
        },
        required: ["data"],
      },
    },
  ];
}

/**
 * Execute a tool with the given arguments
 */
export async function executeTool(
  toolName: string,
  args: any,
  backendManager: BackendManager,
): Promise<any> {
  const backend = backendManager.getBackend();
  if (!backend) {
    throw new Error("No storage backend initialized");
  }

  // Initialize analysis engine if needed for code analysis tools
  let analysisEngine: any = null;
  if (
    toolName.startsWith("analyze_") ||
    toolName.startsWith("find_") ||
    toolName.startsWith("get_") ||
    toolName.includes("pattern") ||
    toolName.includes("refactor") ||
    toolName.includes("debt") ||
    toolName.includes("metrics") ||
    toolName.includes("query") ||
    toolName.includes("usage") ||
    toolName.includes("dependency") ||
    toolName.includes("dead_code") ||
    toolName.includes("security") ||
    toolName.includes("performance") ||
    toolName.includes("architectural")
  ) {
    // Check if backend supports graph operations (needed for analysis)
    if (backend.getBackendType() === "graph") {
      try {
        const { AnalysisEngine } = await import(
          "../analysis/analysis-engine.js"
        );
        const graphBackend = backend as any;
        if (graphBackend.memory) {
          analysisEngine = new AnalysisEngine(graphBackend.memory, {
            enableRealTimeAnalysis: false, // Disable for MCP tools
            enablePatternDetection: true,
            enableDebtAnalysis: true,
            enableInsightsGeneration: true,
            enableNaturalLanguageQueries: true,
          });
        }
      } catch (error) {
        console.warn("Analysis engine not available:", error);
      }
    }
  }
  switch (toolName) {
    case "kb_read": {
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const result = await backend.readFile(normalizedPath);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      // Add parsed summary for specific status/issues files
      let parsedSummary = undefined;
      if (
        args.path.includes("OVERALL_STATUS.md") ||
        args.path.includes("status/")
      ) {
        parsedSummary = _extractStatusSummary(result.data.content);
      } else if (
        args.path.includes("KNOWN_ISSUES.md") ||
        args.path.includes("issues/")
      ) {
        parsedSummary = _extractIssuesSummary(result.data.content);
      }

      return {
        path: result.data.path,
        content: result.data.content,
        metadata: result.data.metadata,
        category: result.data.category,
        size: result.data.size,
        modified: result.data.modified,
        ...(parsedSummary && { parsed_summary: parsedSummary }),
      };
    }

    case "kb_list": {
      const directory = args.directory || "";
      const result = await backend.listFiles(directory);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        path: result.data.path,
        total_files: result.data.total_files,
        total_size: result.data.total_size,
        categories: result.data.categories,
        files: result.data.files.map((f) => ({
          path: f.path,
          category: f.category,
          size: f.size,
          modified: f.modified,
        })),
      };
    }

    case "kb_update": {
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const result = await backend.writeFile(
        normalizedPath,
        args.content,
        args.metadata,
      );
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        success: true,
        message: `File ${args.path} updated successfully`,
      };
    }

    case "kb_delete": {
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const result = await backend.deleteFile(normalizedPath);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        success: true,
        message: `File ${args.path} deleted successfully`,
      };
    }

    case "kb_search": {
      const options = {
        limit: args.limit || 20,
        category: args.category,
        includeContent: true,
        fuzzy: args.fuzzy || false,
      };
      const result = await backend.searchContent(args.query, options);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        query: args.query,
        total_results: result.data.length,
        results: result.data.map((r) => ({
          path: r.file.path,
          category: r.file.category,
          score: r.score,
          matches: r.matches,
          snippet: r.snippet,
        })),
      };
    }

    case "kb_status": {
      const result = await backend.getStatus();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        overall_completion: result.data.overall_completion,
        phases: result.data.phases,
        critical_issues: result.data.critical_issues,
        last_updated: result.data.last_updated,
        backend_type: backend.getBackendType(),
      };
    }

    case "kb_issues": {
      const result = await backend.getIssues();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        total_issues: result.data.length,
        issues: result.data,
        by_severity: {
          critical: result.data.filter((i) => i.severity === "critical").length,
          high: result.data.filter((i) => i.severity === "high").length,
          medium: result.data.filter((i) => i.severity === "medium").length,
          low: result.data.filter((i) => i.severity === "low").length,
        },
        backend_type: backend.getBackendType(),
      };
    }

    case "kb_backend_info": {
      const availableResult = await backendManager.listAvailableBackends();
      if (!availableResult.success) {
        throw new Error(availableResult.error.message);
      }

      const currentConfig = backendManager.getCurrentConfig();
      const currentBackend = backendManager.getBackend();

      return {
        current_backend: {
          type: currentBackend?.getBackendType(),
          configuration: currentBackend?.getConfiguration(),
        },
        available_backends: availableResult.data,
        configuration: currentConfig,
      };
    }

    case "kb_backend_switch": {
      const result = await backendManager.switchBackend(
        args.backend_type,
        args.migrate_data,
      );
      if (!result.success) {
        throw new Error(result.error.message);
      }

      return {
        success: true,
        message: `Successfully switched to ${args.backend_type} backend`,
        migrated_data: args.migrate_data,
        new_backend: args.backend_type,
      };
    }

    case "kb_backend_health": {
      const result = await backendManager.getBackendHealth();
      if (!result.success) {
        throw new Error(result.error.message);
      }

      return result.data;
    }

    case "kb_create": {
      // kb_create is an alias for kb_update
      // Normalize the path by removing leading/trailing slashes and spaces
      const normalizedPath = args.path
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const result = await backend.writeFile(
        normalizedPath,
        args.content,
        args.metadata,
      );
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return {
        success: true,
        message: `File ${args.path} created successfully`,
      };
    }

    case "kb_semantic_search": {
      // Check if current backend supports semantic search
      if (backend.getBackendType() !== "graph") {
        throw new Error(
          "Semantic search requires graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      const options = {
        limit: args.limit || 10,
        includeContent: true,
      };

      const result = await backend.searchContent(args.query, options);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      return {
        query: args.query,
        search_type: "semantic",
        threshold: args.threshold || 0.7,
        total_results: result.data.length,
        results: result.data.map((r) => ({
          path: r.file.path,
          category: r.file.category,
          score: r.score,
          matches: r.matches,
          snippet: r.snippet,
          semantic_similarity: r.score,
        })),
      };
    }

    case "kb_graph_query": {
      // Check if current backend supports graph queries
      if (backend.getBackendType() !== "graph") {
        throw new Error(
          "Graph queries require graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      // For safety, only allow read-only queries
      const cypher = args.cypher.trim().toLowerCase();
      if (
        !cypher.startsWith("match") &&
        !cypher.startsWith("return") &&
        !cypher.startsWith("call db.")
      ) {
        throw new Error(
          "Only read-only graph queries are allowed (MATCH, RETURN, CALL db.*)",
        );
      }

      try {
        // Access the graph backend directly
        const graphBackend = backend as any;
        if (!graphBackend.memory || !graphBackend.memory.graph) {
          throw new Error("Graph backend not properly initialized");
        }

        const result = await graphBackend.memory.graph.query(
          args.cypher,
          args.params || {},
        );
        if (!result.success) {
          throw new Error(result.error);
        }

        return {
          cypher: args.cypher,
          params: args.params || {},
          result_count: result.data ? result.data.length : 0,
          results: result.data,
        };
      } catch (error) {
        throw new Error(
          `Graph query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "kb_export": {
      const result = await backend.exportData();
      if (!result.success) {
        throw new Error(result.error.message);
      }

      let exportData: string;
      if (args.format === "yaml") {
        // Dynamic import for yaml - fallback to JSON if not available
        try {
          const yaml = (globalThis as any).require?.("js-yaml");
          exportData = yaml?.dump
            ? yaml.dump(result.data, { indent: 2 })
            : JSON.stringify(result.data, null, 2);
        } catch {
          exportData = JSON.stringify(result.data, null, 2);
        }
      } else {
        exportData = JSON.stringify(result.data, null, 2);
      }

      return {
        format: args.format || "json",
        exported_at: new Date().toISOString(),
        total_files: result.data.files.length,
        total_size: result.data.metadata.total_size,
        backend_type: result.data.backend_type,
        data: exportData,
      };
    }

    case "kb_import": {
      let importData: any;
      try {
        if (args.data.trim().startsWith("{")) {
          importData = JSON.parse(args.data);
        } else {
          // Dynamic import for yaml - fallback to JSON parsing if not available
          try {
            const yaml = (globalThis as any).require?.("js-yaml");
            importData = yaml?.load
              ? yaml.load(args.data)
              : JSON.parse(args.data);
          } catch {
            importData = JSON.parse(args.data);
          }
        }
      } catch (error) {
        throw new Error(
          "Invalid import data format. Must be valid JSON or YAML.",
        );
      }

      const result = await backend.importData(importData);
      if (!result.success) {
        throw new Error(result.error.message);
      }

      return {
        success: true,
        message: "Data imported successfully",
        imported_files: importData.files ? importData.files.length : 0,
        backend_type: importData.backend_type,
        overwrite: args.overwrite || false,
      };
    }

    // Code Analysis Tools Implementation
    case "analyze_codebase": {
      if (!analysisEngine) {
        throw new Error(
          "Code analysis requires graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      try {
        const result = await analysisEngine.analyzeProject(args.path, {
          includeTests: args.includeTests || false,
          languages: args.languages || ["typescript", "javascript"],
          maxDepth: args.maxDepth || 10,
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        return {
          success: true,
          project_path: args.path,
          analysis: {
            entities: {
              total: result.data.analysis.entities.length,
              functions: result.data.analysis.entities.filter(
                (e: any) => e.type === "Function",
              ).length,
              classes: result.data.analysis.entities.filter(
                (e: any) => e.type === "Class",
              ).length,
              modules: result.data.analysis.entities.filter(
                (e: any) => e.type === "Module",
              ).length,
            },
            relationships: result.data.analysis.relationships.length,
            patterns: {
              total: result.data.patterns.length,
              design_patterns: result.data.patterns.filter(
                (p: any) => p.type === "design_pattern",
              ).length,
              anti_patterns: result.data.patterns.filter(
                (p: any) => p.type === "anti_pattern",
              ).length,
              code_smells: result.data.patterns.filter(
                (p: any) => p.type === "code_smell",
              ).length,
            },
            technical_debt: {
              total_items: result.data.technicalDebt.summary.totalItems,
              estimated_hours:
                result.data.technicalDebt.summary.totalEstimatedHours,
              debt_ratio: result.data.technicalDebt.summary.debtRatio,
            },
            insights: {
              total: result.data.insights.summary.totalInsights,
              critical: result.data.insights.summary.criticalInsights,
              quick_wins: result.data.insights.summary.quickWins,
            },
            overall_health: result.data.summary.overallHealth,
            critical_issues: result.data.summary.criticalIssues,
            recommendations: result.data.summary.recommendations,
          },
        };
      } catch (error) {
        throw new Error(
          `Codebase analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "query_code_graph": {
      if (!analysisEngine) {
        throw new Error(
          "Natural language queries require graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      try {
        const result = await analysisEngine.processQuery(args.question, {
          includeContext: true,
          includeExplanations: true,
          includeSuggestions: true,
          maxResults: args.maxResults || 10,
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        return {
          success: true,
          question: args.question,
          context: args.context,
          results: {
            entities: result.data.entities.length,
            relationships: result.data.relationships.length,
            explanations: result.data.explanations,
            suggestions: result.data.suggestions,
          },
          entities: result.data.entities.slice(0, 20), // Limit response size
          metrics: result.data.metrics,
        };
      } catch (error) {
        throw new Error(
          `Natural language query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "find_patterns": {
      if (!analysisEngine) {
        throw new Error(
          "Pattern detection requires graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      try {
        // Get project analysis first
        const analysisResult = await analysisEngine.analyzeProject(args.path, {
          languages: ["typescript", "javascript"],
          maxDepth: 10,
        });

        if (!analysisResult.success) {
          throw new Error(analysisResult.error.message);
        }

        const patterns = analysisResult.data.patterns
          .filter((pattern: any) => {
            if (args.patternTypes && !args.patternTypes.includes("all")) {
              const typeMap: Record<string, string> = {
                singleton: "Singleton",
                factory: "Factory",
                observer: "Observer",
                strategy: "Strategy",
                decorator: "Decorator",
              };
              return args.patternTypes.some((type: string) =>
                pattern.name.includes(typeMap[type] || type),
              );
            }
            return true;
          })
          .filter(
            (pattern: any) =>
              pattern.confidence >= (args.confidenceThreshold || 0.7),
          );

        return {
          success: true,
          path: args.path,
          pattern_types_searched: args.patternTypes || ["all"],
          include_anti_patterns: args.includeAntiPatterns !== false,
          patterns_found: patterns.length,
          patterns: patterns.map((pattern: any) => ({
            id: pattern.id,
            name: pattern.name,
            type: pattern.type,
            category: pattern.category,
            confidence: pattern.confidence,
            severity: pattern.severity,
            description: pattern.description,
            location: pattern.location,
            recommendation: pattern.metadata.recommendation,
          })),
        };
      } catch (error) {
        throw new Error(
          `Pattern detection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "track_technical_debt": {
      if (!analysisEngine) {
        throw new Error(
          "Technical debt analysis requires graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      try {
        const result = await analysisEngine.analyzeProject(args.path, {
          languages: ["typescript", "javascript"],
          maxDepth: 10,
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const debt = result.data.technicalDebt;
        const filteredDebt = debt.topPriorities.filter((item: any) => {
          if (args.debtTypes && !args.debtTypes.includes(item.type)) {
            return false;
          }
          const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
          const minLevel =
            severityOrder[
              args.severityThreshold as keyof typeof severityOrder
            ] || 2;
          return (
            severityOrder[item.severity as keyof typeof severityOrder] >=
            minLevel
          );
        });

        return {
          success: true,
          path: args.path,
          debt_types: args.debtTypes || [
            "complexity",
            "duplication",
            "testing",
          ],
          severity_threshold: args.severityThreshold || "medium",
          summary: {
            total_items: debt.summary.totalItems,
            estimated_hours: debt.summary.totalEstimatedHours,
            average_priority: debt.summary.averagePriority,
            debt_ratio: debt.summary.debtRatio,
          },
          by_type: debt.byType,
          by_severity: debt.bySeverity,
          top_priorities: filteredDebt.slice(0, 10),
          recommendations: debt.recommendations,
          metrics: args.includeMetrics ? debt.metrics : undefined,
        };
      } catch (error) {
        throw new Error(
          `Technical debt analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "get_code_metrics": {
      if (!analysisEngine) {
        throw new Error(
          "Code metrics require graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      try {
        const result = await analysisEngine.analyzeProject(args.path, {
          languages: ["typescript", "javascript"],
          maxDepth: 10,
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const analysis = result.data.analysis;
        const patterns = result.data.patterns;
        const debt = result.data.technicalDebt;

        return {
          success: true,
          path: args.path,
          basic_metrics: {
            total_lines: analysis.metrics.totalLines,
            total_functions: analysis.metrics.functions,
            total_classes: analysis.metrics.classes,
            average_complexity:
              analysis.metrics.complexity / analysis.metrics.functions,
          },
          complexity: args.includeComplexity
            ? {
                average:
                  analysis.metrics.complexity / analysis.metrics.functions,
                max: Math.max(
                  ...analysis.entities
                    .filter((e: any) => e.type === "Function")
                    .map((e: any) => e.metadata.complexity || 0),
                ),
                distribution: this.calculateComplexityDistribution(
                  analysis.entities,
                ),
              }
            : undefined,
          duplication: args.includeDuplication
            ? {
                duplicate_patterns: patterns.filter((p: any) =>
                  p.name.includes("Duplicate"),
                ).length,
                estimated_duplicated_lines: patterns
                  .filter((p: any) => p.name.includes("Duplicate"))
                  .reduce(
                    (sum: number, p: any) => sum + (p.metadata.totalLines || 0),
                    0,
                  ),
              }
            : undefined,
          debt: args.includeDebt
            ? {
                total_items: debt.summary.totalItems,
                estimated_hours: debt.summary.totalEstimatedHours,
                debt_ratio: debt.summary.debtRatio,
                by_type: debt.byType,
              }
            : undefined,
        };
      } catch (error) {
        throw new Error(
          `Code metrics analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "architectural_overview": {
      if (!analysisEngine) {
        throw new Error(
          "Architectural analysis requires graph backend. Use kb_backend_switch to switch to graph backend.",
        );
      }

      try {
        const result = await analysisEngine.analyzeProject(args.path, {
          languages: ["typescript", "javascript"],
          maxDepth: 10,
        });

        if (!result.success) {
          throw new Error(result.error.message);
        }

        const analysis = result.data.analysis;
        const insights = result.data.insights;

        // Generate architectural overview
        const modules = analysis.entities.filter(
          (e: any) => e.type === "Module",
        );
        const dependencies = analysis.relationships.filter(
          (r: any) => r.type === "IMPORTS",
        );
        const architecturalInsights = insights.byType.architecture || [];

        return {
          success: true,
          path: args.path,
          overview: {
            total_modules: modules.length,
            total_dependencies: dependencies.length,
            average_dependencies_per_module:
              dependencies.length / modules.length,
            architectural_patterns: result.data.patterns
              .filter((p: any) =>
                ["structural", "architectural"].includes(p.category),
              )
              .map((p: any) => ({ name: p.name, confidence: p.confidence })),
          },
          structure: {
            modules: modules.slice(0, 20).map((m: any) => ({
              name: m.name,
              path: m.filePath,
              size: m.metadata.size || 0,
              dependencies: dependencies.filter((d: any) => d.sourceId === m.id)
                .length,
            })),
          },
          concerns: architecturalInsights.map((insight: any) => ({
            title: insight.title,
            severity: insight.severity,
            description: insight.description,
            recommendations: insight.recommendations.map((r: any) => r.action),
          })),
          visualization: args.includeVisualization
            ? {
                type: "dependency_graph",
                description: "Module dependency relationships",
                modules: modules.length,
                connections: dependencies.length,
              }
            : undefined,
          metrics: args.includeMetrics
            ? {
                coupling: this.calculateCoupling(
                  analysis.entities,
                  analysis.relationships,
                ),
                cohesion: this.calculateCohesion(
                  analysis.entities,
                  analysis.relationships,
                ),
                complexity:
                  analysis.metrics.complexity / analysis.metrics.functions,
              }
            : undefined,
        };
      } catch (error) {
        throw new Error(
          `Architectural analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Extract a summary from the status file
 */
function _extractStatusSummary(content: string): any {
  const lines = content.split("\n");
  const summary: any = {
    components: {},
    overall: {},
  };

  // let inComponentSection = false;

  for (const line of lines) {
    // Look for overall completion percentage
    if (line.includes("Overall Completion:")) {
      const match = line.match(/(\d+)%/);
      if (match) {
        summary.overall.completion = parseInt(match[1]);
      }
    }

    // Look for component status lines
    if (line.includes("|") && line.includes("%")) {
      const parts = line
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 3 && parts[2].includes("%")) {
        const component = parts[0];
        const status = parts[1];
        const completion = parseInt(parts[2].replace("%", ""));

        summary.components[component] = {
          status,
          completion,
        };
      }
    }
  }

  return summary;
}

/**
 * Extract a summary from the issues file
 */
function _extractIssuesSummary(content: string): any {
  const lines = content.split("\n");
  const issues: any[] = [];

  let currentIssue: any = null;
  let currentSection = "";

  for (const line of lines) {
    // Section headers
    if (line.startsWith("## ")) {
      currentSection = line.replace("## ", "").trim();
    }

    // Issue headers
    if (line.startsWith("### ")) {
      if (currentIssue) {
        issues.push(currentIssue);
      }
      currentIssue = {
        title: line.replace("### ", "").trim(),
        severity: determineSeverity(currentSection),
        description: "",
      };
    }

    // Issue content
    if (currentIssue && line.trim() && !line.startsWith("#")) {
      currentIssue.description += line + " ";
    }
  }

  if (currentIssue) {
    issues.push(currentIssue);
  }

  return {
    totalIssues: issues.length,
    bySeverity: {
      critical: issues.filter((i) => i.severity === "critical").length,
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
    },
    issues: issues.slice(0, 10), // Return first 10 issues
  };
}

function determineSeverity(section: string): string {
  const lower = section.toLowerCase();
  if (lower.includes("critical") || lower.includes("blocker"))
    return "critical";
  if (lower.includes("high") || lower.includes("security")) return "high";
  if (lower.includes("medium")) return "medium";
  return "low";
}

/**
 * Helper function to calculate complexity distribution
 */
function calculateComplexityDistribution(
  entities: any[],
): Record<string, number> {
  const functions = entities.filter((e) => e.type === "Function");
  const complexities = functions.map((f) => f.metadata.complexity || 0);

  return {
    low: complexities.filter((c) => c <= 5).length,
    medium: complexities.filter((c) => c > 5 && c <= 15).length,
    high: complexities.filter((c) => c > 15).length,
  };
}

/**
 * Helper function to calculate coupling metric
 */
function calculateCoupling(entities: any[], relationships: any[]): number {
  const modules = entities.filter((e) => e.type === "Module");
  if (modules.length === 0) return 0;

  const imports = relationships.filter((r) => r.type === "IMPORTS");
  return imports.length / modules.length;
}

/**
 * Helper function to calculate cohesion metric
 */
function calculateCohesion(entities: any[], relationships: any[]): number {
  // Simplified cohesion calculation
  const classes = entities.filter((e) => e.type === "Class");
  if (classes.length === 0) return 100;

  let totalCohesion = 0;
  for (const cls of classes) {
    const methods = entities.filter(
      (e) => e.type === "Function" && e.metadata.parentClass === cls.name,
    );
    const internalCalls = relationships.filter(
      (r) =>
        r.type === "CALLS" &&
        methods.some((m) => m.id === r.sourceId) &&
        methods.some((m) => m.id === r.targetId),
    );

    const maxPossibleCalls = methods.length * (methods.length - 1);
    const cohesion =
      maxPossibleCalls > 0
        ? (internalCalls.length / maxPossibleCalls) * 100
        : 100;
    totalCohesion += cohesion;
  }

  return totalCohesion / classes.length;
}
