/**
 * Test Suite for MOIDVK Integration Adapter
 * Tests intelligent routing, hybrid execution, and workflow optimization
 */

import { jest } from "@jest/globals";
import {
  MoidvkAdapter,
  MoidvkToolCall,
} from "../../integrations/moidvk-adapter.js";
import { UnifiedMemory } from "../../graph/unified-memory.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

// Mock child_process
jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

// Mock UnifiedMemory
jest.mock("../../graph/unified-memory");

describe("MoidvkAdapter", () => {
  let adapter: MoidvkAdapter;
  let mockMemory: jest.Mocked<UnifiedMemory>;
  let mockChildProcess: any;

  beforeEach(() => {
    // Setup mock memory
    mockMemory = {
      graph: {
        query: jest.fn().mockResolvedValue({ success: true, data: [] }),
      },
      vector: {
        search: jest.fn().mockResolvedValue({ success: true, data: [] }),
      },
    } as any;

    // Setup mock child process
    mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    (spawn as jest.Mock).mockReturnValue(mockChildProcess);

    // Create adapter
    adapter = new MoidvkAdapter(
      {
        serverPath: "/path/to/moidvk/server.js",
        enableIntelligentRouting: true,
        cacheResults: true,
      },
      mockMemory,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Tool Execution", () => {
    test("should execute MOIDVK tool successfully", async () => {
      const toolCall: MoidvkToolCall = {
        tool: "check_code_practices",
        params: { code: "const x = 1;", filename: "test.js" },
      };

      // Simulate successful MOIDVK response
      setTimeout(() => {
        mockChildProcess.stdout.emit(
          "data",
          JSON.stringify({
            success: true,
            issues: [],
          }),
        );
        mockChildProcess.emit("close", 0);
      }, 10);

      const result = await adapter.executeTool(toolCall);

      expect(result.success).toBe(true);
      expect(result.data?.metadata.tool).toBe("check_code_practices");
      expect(spawn).toHaveBeenCalledWith(
        "node",
        expect.arrayContaining([
          "run",
          "/path/to/moidvk/server.js",
          "check_code_practices",
        ]),
      );
    });

    test("should handle tool execution errors", async () => {
      const toolCall: MoidvkToolCall = {
        tool: "invalid_tool",
        params: {},
      };

      setTimeout(() => {
        mockChildProcess.stderr.emit("data", "Tool not found");
        mockChildProcess.emit("close", 1);
      }, 10);

      const result = await adapter.executeTool(toolCall);

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
      expect(result.data?.error).toContain("Tool not found");
    });

    test("should use cached results when available", async () => {
      const toolCall: MoidvkToolCall = {
        tool: "format_code",
        params: { code: "const x=1" },
      };

      // First execution
      setTimeout(() => {
        mockChildProcess.stdout.emit(
          "data",
          JSON.stringify({
            formatted: "const x = 1;",
          }),
        );
        mockChildProcess.emit("close", 0);
      }, 10);

      const result1 = await adapter.executeTool(toolCall);
      expect(result1.data?.metadata.cacheHit).toBeFalsy();

      // Second execution should use cache
      const result2 = await adapter.executeTool(toolCall);
      expect(result2.data?.metadata.cacheHit).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe("Intelligent Routing", () => {
    test("should route to hybrid execution for complex tasks", async () => {
      const complexTool: MoidvkToolCall = {
        tool: "intelligent_development_analysis",
        params: {
          files: ["complex-system.ts"],
          goals: ["optimize", "refactor", "secure"],
        },
        context: {
          analysisDepth: "comprehensive",
        },
      };

      // Mock both MOIDVK and KB responses
      setTimeout(() => {
        mockChildProcess.stdout.emit(
          "data",
          JSON.stringify({
            analysis: "MOIDVK analysis",
          }),
        );
        mockChildProcess.emit("close", 0);
      }, 10);

      mockMemory.graph.query.mockResolvedValue({
        success: true,
        data: [{ insight: "KB insight" }],
      });

      const result = await adapter.executeTool(complexTool);

      expect(result.success).toBe(true);
      expect(result.data?.data).toMatchObject({
        moidvk: expect.objectContaining({ analysis: "MOIDVK analysis" }),
        kbEnhancement: expect.any(Object),
        merged: true,
      });
    });

    test("should route to KB-MCP for semantic tasks", async () => {
      const semanticTool: MoidvkToolCall = {
        tool: "semantic_development_search",
        params: { query: "find similar authentication patterns" },
      };

      mockMemory.vector.search.mockResolvedValue({
        success: true,
        data: [
          { content: "AuthPattern1", score: 0.9 },
          { content: "AuthPattern2", score: 0.85 },
        ],
      });

      const result = await adapter.executeTool(semanticTool);

      expect(result.success).toBe(true);
      expect(result.data?.metadata.tool).toBe("kb_semantic_development_search");
      expect(mockMemory.vector.search).toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });

    test("should fallback when primary route fails", async () => {
      const toolCall: MoidvkToolCall = {
        tool: "check_code_practices",
        params: { code: "test" },
      };

      // Make MOIDVK fail
      setTimeout(() => {
        mockChildProcess.emit("error", new Error("Process failed"));
      }, 10);

      // KB should work as fallback
      mockMemory.graph.query.mockResolvedValue({
        success: true,
        data: [{ pattern: "code_smell" }],
      });

      const result = await adapter.executeTool(toolCall);

      expect(result.success).toBe(true);
      // Should have attempted KB fallback
      expect(result.data?.metadata.tool).toContain("kb_");
    });
  });

  describe("Workflow Optimization", () => {
    test("should optimize task workflow", async () => {
      const tasks: MoidvkToolCall[] = [
        { tool: "format_code", params: { code: "const x=1" } },
        { tool: "check_code_practices", params: { code: "const x=1" } },
        { tool: "scan_security_vulnerabilities", params: {} },
        { tool: "check_production_readiness", params: { code: "const x=1" } },
      ];

      const result = await adapter.optimizeWorkflow(tasks, {
        projectType: "web-app",
        deadline: new Date(Date.now() + 86400000), // 1 day
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        taskSequence: expect.any(Array),
        parallelizable: expect.any(Array),
        dependencies: expect.any(Object),
        estimatedTime: expect.any(Number),
        optimizations: expect.arrayContaining([
          expect.stringContaining("parallel"),
        ]),
      });
    });

    test("should identify parallelizable tasks", async () => {
      const tasks: MoidvkToolCall[] = [
        { tool: "format_code", params: { code: "file1.js" } },
        { tool: "format_code", params: { code: "file2.js" } },
        { tool: "check_code_practices", params: { code: "file1.js" } },
        { tool: "check_code_practices", params: { code: "file2.js" } },
      ];

      const result = await adapter.optimizeWorkflow(tasks, {});

      expect(result.success).toBe(true);
      // Formatting tasks should be parallelizable
      expect(result.data?.parallelizable).toContain("format_code");
    });

    test("should respect task dependencies", async () => {
      const tasks: MoidvkToolCall[] = [
        { tool: "format_code", params: { code: "test.js" } },
        { tool: "check_code_practices", params: { code: "test.js" } },
        { tool: "scan_security_vulnerabilities", params: { projectPath: "." } },
      ];

      const result = await adapter.optimizeWorkflow(tasks, {});

      expect(result.success).toBe(true);
      // Code practices should depend on formatting
      expect(result.data?.dependencies["check_code_practices"]).toContain(
        "format_code",
      );
    });
  });

  describe("Tool Recommendations", () => {
    test("should provide tool recommendations", async () => {
      mockMemory.graph.query.mockResolvedValue({
        success: true,
        data: [
          {
            "tool.name": "eslint",
            "scenario.successRate": 0.95,
            "scenario.averageTime": 500,
          },
          {
            "tool.name": "prettier",
            "scenario.successRate": 0.98,
            "scenario.averageTime": 200,
          },
        ],
      });

      const result = await adapter.getToolRecommendations({
        task: "improve code quality",
        language: "javascript",
        urgency: "normal",
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0]).toMatchObject({
        tool: expect.any(String),
        confidence: expect.any(Number),
        reasoning: expect.any(String),
      });
    });

    test("should consider previous tool usage", async () => {
      const context = {
        task: "format code",
        previousTools: ["prettier", "eslint"],
        urgency: "high" as const,
      };

      const result = await adapter.getToolRecommendations(context);

      expect(result.success).toBe(true);
      // Should recommend tools based on previous usage patterns
    });
  });

  describe("Batch Execution", () => {
    beforeEach(() => {
      // Setup quick responses for batch tests
      let callCount = 0;
      (spawn as jest.Mock).mockImplementation(() => {
        const process = new EventEmitter() as any;
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();

        setTimeout(() => {
          process.stdout.emit(
            "data",
            JSON.stringify({
              result: `Result ${callCount++}`,
            }),
          );
          process.emit("close", 0);
        }, 10);

        return process;
      });
    });

    test("should execute batch of tools", async () => {
      const toolCalls: MoidvkToolCall[] = Array(5)
        .fill(0)
        .map((_, i) => ({
          tool: `tool_${i}`,
          params: { index: i },
        }));

      const result = await adapter.executeBatch(toolCalls);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
      expect(result.data?.every((r) => r.success)).toBe(true);
    });

    test("should respect concurrency limits", async () => {
      const toolCalls: MoidvkToolCall[] = Array(10)
        .fill(0)
        .map((_, i) => ({
          tool: "format_code",
          params: { code: `file${i}.js` },
        }));

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      (spawn as jest.Mock).mockImplementation(() => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

        const process = new EventEmitter() as any;
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();

        setTimeout(() => {
          currentConcurrent--;
          process.stdout.emit("data", '{"result": "ok"}');
          process.emit("close", 0);
        }, 50);

        return process;
      });

      await adapter.executeBatch(toolCalls, { maxParallel: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    test("should optimize execution order", async () => {
      const toolCalls: MoidvkToolCall[] = [
        { tool: "slow_analysis", params: {}, priority: 1 },
        { tool: "quick_format", params: {}, priority: 10 },
        { tool: "medium_check", params: {}, priority: 5 },
      ];

      const executionOrder: string[] = [];

      (spawn as jest.Mock).mockImplementation((cmd, args) => {
        const toolName = args[2];
        executionOrder.push(toolName);

        const process = new EventEmitter() as any;
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();

        setTimeout(() => {
          process.stdout.emit("data", '{"result": "ok"}');
          process.emit("close", 0);
        }, 10);

        return process;
      });

      await adapter.executeBatch(toolCalls, { optimizeOrder: true });

      // Should execute in optimized order (likely by priority)
      expect(executionOrder[0]).toBe("quick_format");
    });

    test("should handle failFast option", async () => {
      let callCount = 0;
      (spawn as jest.Mock).mockImplementation(() => {
        const process = new EventEmitter() as any;
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();

        setTimeout(() => {
          if (callCount++ === 1) {
            // Second tool fails
            process.stderr.emit("data", "Tool failed");
            process.emit("close", 1);
          } else {
            process.stdout.emit("data", '{"result": "ok"}');
            process.emit("close", 0);
          }
        }, 10);

        return process;
      });

      const toolCalls: MoidvkToolCall[] = Array(5)
        .fill(0)
        .map((_, i) => ({
          tool: `tool_${i}`,
          params: {},
        }));

      const result = await adapter.executeBatch(toolCalls, { failFast: true });

      expect(result.success).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(2); // Should stop after failure
    });
  });

  describe("Enhancement Features", () => {
    test("should enhance results with KB intelligence", async () => {
      const toolCall: MoidvkToolCall = {
        tool: "check_code_practices",
        params: { code: "complex code" },
      };

      // MOIDVK result
      setTimeout(() => {
        mockChildProcess.stdout.emit(
          "data",
          JSON.stringify({
            issues: ["issue1", "issue2"],
          }),
        );
        mockChildProcess.emit("close", 0);
      }, 10);

      // KB enhancement
      mockMemory.vector.search.mockResolvedValue({
        success: true,
        data: [{ content: "Similar pattern found", score: 0.8 }],
      });

      const result = await adapter.executeTool(toolCall);

      expect(result.success).toBe(true);
      expect(result.data?.data).toHaveProperty("kbEnhancements");
      expect(result.data?.metadata.enhancedByKB).toBe(true);
    });

    test("should track tool usage statistics", async () => {
      const toolCall: MoidvkToolCall = {
        tool: "format_code",
        params: { code: "test" },
      };

      // Execute same tool multiple times
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          mockChildProcess.stdout.emit("data", '{"formatted": "test"}');
          mockChildProcess.emit("close", 0);
        }, 10);

        await adapter.executeTool(toolCall);
      }

      // Statistics should be tracked
      const recommendations = await adapter.getToolRecommendations({
        task: "format code",
      });

      expect(recommendations.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle spawn errors", async () => {
      (spawn as jest.Mock).mockImplementation(() => {
        throw new Error("Spawn failed");
      });

      const result = await adapter.executeTool({
        tool: "any_tool",
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Spawn failed");
    });

    test("should handle timeout", async () => {
      const timeoutAdapter = new MoidvkAdapter(
        {
          serverPath: "/path/to/moidvk",
          toolTimeout: 100, // 100ms timeout
        },
        mockMemory,
      );

      // Never emit close event
      const result = await timeoutAdapter.executeTool({
        tool: "slow_tool",
        params: {},
      });

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
    });

    test("should handle malformed tool output", async () => {
      setTimeout(() => {
        mockChildProcess.stdout.emit("data", "Not valid JSON");
        mockChildProcess.emit("close", 0);
      }, 10);

      const result = await adapter.executeTool({
        tool: "broken_tool",
        params: {},
      });

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
      expect(result.data?.error).toContain("parse");
    });
  });
});
