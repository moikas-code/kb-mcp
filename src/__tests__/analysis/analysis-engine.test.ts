/**
 * Comprehensive Test Suite for KB-MCP Analysis Engine
 * Tests core analysis functionality, performance, and integration
 */

import { jest } from "@jest/globals";
import { AnalysisEngine } from "../../analysis/analysis-engine";
import { UnifiedMemory } from "../../graph/unified-memory";
import { RelationshipExtractor } from "../../analysis/relationship-extractor";
import { PatternDetector } from "../../analysis/pattern-detector";
import { TechnicalDebtAnalyzer } from "../../analysis/technical-debt-analyzer";
import { NaturalLanguageQueryProcessor } from "../../analysis/nlq-processor";
import { promises as fs } from "fs";
import path from "path";

// Mock dependencies
jest.mock("../../graph/unified-memory");
jest.mock("chokidar");

describe("AnalysisEngine", () => {
  let analysisEngine: AnalysisEngine;
  let mockMemory: jest.Mocked<UnifiedMemory>;

  beforeEach(() => {
    // Setup mocks
    mockMemory = {
      graph: {
        createNode: jest.fn().mockResolvedValue({ success: true }),
        createEdge: jest.fn().mockResolvedValue({ success: true }),
        query: jest.fn().mockResolvedValue({ success: true, data: [] }),
        updateNode: jest.fn().mockResolvedValue({ success: true }),
      },
      vector: {
        store: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue({ success: true, data: [] }),
      },
      temporal: {
        trackChange: jest.fn().mockResolvedValue({ success: true }),
      },
      working: {
        store: jest.fn().mockResolvedValue({ success: true }),
        get: jest.fn().mockResolvedValue({ success: true, data: null }),
      },
    } as any;

    // Create analysis engine instance
    analysisEngine = new AnalysisEngine(mockMemory, {
      enableRealTimeAnalysis: false,
      enablePatternDetection: true,
      enableDebtAnalysis: true,
      enableInsightsGeneration: true,
      enableNaturalLanguageQueries: true,
      analysisDepth: "detailed",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("File Analysis", () => {
    const testCode = `
      import { Module } from '@nestjs/common';
      import { UserService } from './user.service';
      
      @Module({
        providers: [UserService],
        exports: [UserService]
      })
      export class UserModule {
        constructor(private userService: UserService) {}
        
        async getUser(id: string) {
          // TODO: Add caching here
          const user = await this.userService.findById(id);
          if (!user) {
            console.log('User not found'); // Debug log
            throw new Error('User not found');
          }
          return user;
        }
      }
    `;

    test("should analyze TypeScript file successfully", async () => {
      const result = await analysisEngine.analyzeFile("test.ts", testCode);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        entities: expect.arrayContaining([
          expect.objectContaining({
            type: "class",
            name: "UserModule",
          }),
        ]),
        relationships: expect.arrayContaining([
          expect.objectContaining({
            type: "imports",
            source: "UserModule",
            target: "UserService",
          }),
        ]),
        patterns: expect.any(Array),
        technicalDebt: expect.objectContaining({
          totalDebt: expect.any(Number),
          items: expect.any(Array),
        }),
      });
    });

    test("should detect technical debt items", async () => {
      const result = await analysisEngine.analyzeFile("test.ts", testCode);

      expect(result.success).toBe(true);
      expect(result.data?.technicalDebt.items).toContainEqual(
        expect.objectContaining({
          type: "todo",
          severity: "medium",
          message: expect.stringContaining("TODO: Add caching here"),
        }),
      );
      expect(result.data?.technicalDebt.items).toContainEqual(
        expect.objectContaining({
          type: "debug_code",
          severity: "low",
          message: expect.stringContaining("console.log"),
        }),
      );
    });

    test("should handle invalid syntax gracefully", async () => {
      const invalidCode = "class { invalid syntax }";
      const result = await analysisEngine.analyzeFile(
        "invalid.ts",
        invalidCode,
      );

      expect(result.success).toBe(true);
      expect(result.data?.entities.length).toBe(0);
    });

    test("should support multiple languages", async () => {
      const pythonCode = `
        class UserService:
            def __init__(self, db):
                self.db = db
                
            async def get_user(self, user_id: str):
                # FIXME: SQL injection vulnerability
                query = f"SELECT * FROM users WHERE id = '{user_id}'"
                return await self.db.execute(query)
      `;

      const result = await analysisEngine.analyzeFile("service.py", pythonCode);

      expect(result.success).toBe(true);
      expect(result.data?.entities).toContainEqual(
        expect.objectContaining({
          type: "class",
          name: "UserService",
        }),
      );
      expect(result.data?.technicalDebt.items).toContainEqual(
        expect.objectContaining({
          type: "fixme",
          severity: "high",
          message: expect.stringContaining("SQL injection vulnerability"),
        }),
      );
    });
  });

  describe("Pattern Detection", () => {
    test("should detect design patterns", async () => {
      const singletonCode = `
        export class DatabaseConnection {
          private static instance: DatabaseConnection;
          
          private constructor() {}
          
          public static getInstance(): DatabaseConnection {
            if (!DatabaseConnection.instance) {
              DatabaseConnection.instance = new DatabaseConnection();
            }
            return DatabaseConnection.instance;
          }
        }
      `;

      const result = await analysisEngine.analyzeFile(
        "singleton.ts",
        singletonCode,
      );

      expect(result.success).toBe(true);
      expect(result.data?.patterns).toContainEqual(
        expect.objectContaining({
          type: "design_pattern",
          name: "Singleton",
          confidence: expect.any(Number),
        }),
      );
    });

    test("should detect anti-patterns", async () => {
      const godClassCode = `
        export class ApplicationManager {
          private users: User[] = [];
          private products: Product[] = [];
          private orders: Order[] = [];
          private logs: Log[] = [];
          
          // 50+ methods managing everything...
          ${Array(50)
            .fill(0)
            .map(
              (_, i) => `
            public method${i}() { /* complex logic */ }
          `,
            )
            .join("\n")}
        }
      `;

      const result = await analysisEngine.analyzeFile(
        "god-class.ts",
        godClassCode,
      );

      expect(result.success).toBe(true);
      expect(result.data?.patterns).toContainEqual(
        expect.objectContaining({
          type: "anti_pattern",
          name: "God Class",
          severity: "high",
        }),
      );
    });
  });

  describe("Natural Language Queries", () => {
    beforeEach(() => {
      // Setup mock data for queries
      mockMemory.graph.query.mockImplementation(async (query: string) => {
        if (query.includes("complexity")) {
          return {
            success: true,
            data: [
              { name: "complexFunction", complexity: 15, file: "utils.ts" },
              { name: "veryComplexMethod", complexity: 25, file: "service.ts" },
            ],
          };
        }
        return { success: true, data: [] };
      });

      mockMemory.vector.search.mockResolvedValue({
        success: true,
        data: [{ content: "Related code snippet", score: 0.85 }],
      });
    });

    test("should process natural language queries", async () => {
      const result = await analysisEngine.processQuery(
        "What are the most complex functions?",
      );

      expect(result.success).toBe(true);
      expect(result.data?.results).toHaveLength(2);
      expect(result.data?.results[0]).toMatchObject({
        name: "complexFunction",
        complexity: 15,
      });
    });

    test("should provide query explanations", async () => {
      const result = await analysisEngine.processQuery(
        "Find all classes with circular dependencies",
        { includeExplanations: true },
      );

      expect(result.success).toBe(true);
      expect(result.data?.explanation).toBeDefined();
      expect(result.data?.cypherQuery).toContain("MATCH");
    });

    test("should handle query errors gracefully", async () => {
      mockMemory.graph.query.mockRejectedValueOnce(new Error("Query failed"));

      const result = await analysisEngine.processQuery("Invalid query");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Query failed");
    });
  });

  describe("Project Analysis", () => {
    const mockFileSystem = {
      "/project/src/index.ts": 'export * from "./module";',
      "/project/src/module.ts": "export class MyModule {}",
      "/project/package.json": '{"name": "test-project", "version": "1.0.0"}',
    };

    beforeEach(() => {
      // Mock file system
      jest.spyOn(fs, "readdir").mockImplementation(async (dir) => {
        const files = Object.keys(mockFileSystem)
          .filter((f) => f.startsWith(dir as string))
          .map((f) => path.basename(f));
        return files as any;
      });

      jest.spyOn(fs, "readFile").mockImplementation(async (file) => {
        return mockFileSystem[file as string] || "";
      });

      jest.spyOn(fs, "stat").mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
      } as any);
    });

    test("should analyze entire project", async () => {
      const result = await analysisEngine.analyzeProject("/project");

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        summary: expect.objectContaining({
          totalFiles: expect.any(Number),
          totalEntities: expect.any(Number),
          totalRelationships: expect.any(Number),
        }),
        insights: expect.any(Array),
        recommendations: expect.any(Array),
      });
    });

    test("should respect analysis options", async () => {
      const result = await analysisEngine.analyzeProject("/project", {
        includeTests: false,
        maxDepth: 2,
        fileExtensions: [".ts"],
        excludePatterns: ["node_modules"],
      });

      expect(result.success).toBe(true);
      expect(mockMemory.graph.createNode).toHaveBeenCalled();
    });
  });

  describe("Real-time Analysis", () => {
    test("should start and stop file watcher", async () => {
      const watcher = await analysisEngine.startRealTimeAnalysis("/project");

      expect(watcher).toBeDefined();

      await analysisEngine.stopRealTimeAnalysis();

      // Verify watcher was closed
      expect(watcher.close).toHaveBeenCalled();
    });

    test("should handle file changes", async () => {
      const watcher = await analysisEngine.startRealTimeAnalysis("/project");

      // Simulate file change
      const changeHandler = (watcher as any).on.mock.calls.find(
        (call: any[]) => call[0] === "change",
      )[1];

      await changeHandler("/project/src/new-file.ts");

      expect(mockMemory.temporal.trackChange).toHaveBeenCalled();
    });
  });

  describe("Performance", () => {
    test("should analyze large files within acceptable time", async () => {
      const largeCode = Array(1000)
        .fill(0)
        .map(
          (_, i) => `
        export class Component${i} {
          method() { return ${i}; }
        }
      `,
        )
        .join("\n");

      const startTime = Date.now();
      const result = await analysisEngine.analyzeFile("large.ts", largeCode);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test("should handle concurrent analyses", async () => {
      const analyses = Array(10)
        .fill(0)
        .map((_, i) =>
          analysisEngine.analyzeFile(`file${i}.ts`, `class Test${i} {}`),
        );

      const results = await Promise.all(analyses);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle memory errors gracefully", async () => {
      mockMemory.graph.createNode.mockRejectedValueOnce(
        new Error("Memory error"),
      );

      const result = await analysisEngine.analyzeFile(
        "test.ts",
        "class Test {}",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Memory error");
    });

    test("should recover from partial failures", async () => {
      // Fail on first call, succeed on retry
      mockMemory.graph.createNode
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValueOnce({ success: true });

      const result = await analysisEngine.analyzeFile(
        "test.ts",
        "class Test {}",
      );

      // Should still complete analysis despite temporary failure
      expect(result.success).toBe(true);
    });
  });
});
