/**
 * MCP Server Integration Tests
 * End-to-end tests for the secure MCP server
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SecureMCPServer } from '@mcp/secure-server';
import { ConfigManager } from '@core/config';
import { AuthManager } from '@cli/auth';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

describe('MCP Server Integration', () => {
  let server: SecureMCPServer;
  let testDir: string;
  let configPath: string;
  let authManager: AuthManager;
  let authToken: string;
  const testPort = 3456;

  beforeAll(async () => {
    // Setup test environment
    testDir = path.join(os.tmpdir(), `mcp-test-${uuidv4()}`);
    await fs.mkdir(path.join(testDir, 'kb'), { recursive: true });
    
    // Create test configuration
    configPath = path.join(testDir, '.kbconfig.yaml');
    const testConfig = {
      security: {
        encryption: {
          algorithm: 'AES-256-GCM',
          key: 'test-encryption-key-for-integration-tests',
        },
        authentication: {
          providers: ['jwt'],
          mfa_required: false,
          session_timeout: 3600,
        },
        rate_limiting: {
          enabled: true,
          max_requests_per_minute: 100,
        },
      },
      compliance: {
        audit: {
          enabled: true,
          retention_days: 90,
          destinations: ['file'],
        },
      },
      storage: {
        path: path.join(testDir, 'kb'),
        encryption_at_rest: true,
        versioning: false,
      },
    };
    
    await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

    // Setup authentication
    authManager = new AuthManager();
    const authResult = await authManager.authenticate('admin', 'changeme');
    if (authResult.success) {
      authToken = authResult.data.token;
    }

    // Start server
    server = new SecureMCPServer({
      configPath,
      transport: 'http',
      port: testPort,
      strictMode: false,
    });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Server Lifecycle', () => {
    test('should start successfully', async () => {
      await expect(server.start()).resolves.not.toThrow();
      
      // Give server time to start
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    test('should expose health endpoint', async () => {
      const response = await axios.get(`http://localhost:${testPort}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('version');
      expect(response.data).toHaveProperty('uptime');
      expect(response.data).toHaveProperty('checks');
    });

    test('should expose metrics endpoint', async () => {
      const response = await axios.get(`http://localhost:${testPort}/metrics`);
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.data).toContain('kb_operations_total');
    });

    test('should expose ready endpoint', async () => {
      const response = await axios.get(`http://localhost:${testPort}/ready`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('ready', true);
    });
  });

  describe('Tool Execution', () => {
    test('should list available tools', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('tools');
      expect(Array.isArray(response.data.tools)).toBe(true);
      
      const toolNames = response.data.tools.map((t: any) => t.name);
      expect(toolNames).toContain('kb_read');
      expect(toolNames).toContain('kb_list');
      expect(toolNames).toContain('kb_search');
    });

    test('should execute kb_create tool', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'kb_create',
            arguments: {
              path: 'test/integration.md',
              content: '# Integration Test\n\nThis file was created by integration test.',
            },
          },
          id: 2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.content[0].text).toContain('success');
    });

    test('should execute kb_read tool', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'kb_read',
            arguments: {
              path: 'test/integration.md',
            },
          },
          id: 3,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const result = JSON.parse(response.data.content[0].text);
      expect(result.content).toContain('Integration Test');
    });

    test('should execute kb_search tool', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'kb_search',
            arguments: {
              query: 'integration',
            },
          },
          id: 4,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const result = JSON.parse(response.data.content[0].text);
      expect(result.results).toHaveLength(1);
      expect(result.total_matches).toBeGreaterThan(0);
    });
  });

  describe('Security', () => {
    test('should enforce authentication for write operations', async () => {
      try {
        await axios.post(
          `http://localhost:${testPort}/mcp/tools`,
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'kb_create',
              arguments: {
                path: 'test/unauthorized.md',
                content: 'Should not be created',
              },
            },
            id: 5,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              // No auth header
            },
          }
        );
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should validate input paths', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'kb_read',
            arguments: {
              path: '../../../etc/passwd',
            },
          },
          id: 6,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.isError).toBe(true);
      expect(response.data.content[0].text).toContain('error');
    });

    test('should enforce rate limiting', async () => {
      // Make many requests rapidly
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(
          axios.get(`http://localhost:${testPort}/health`).catch(e => e)
        );
      }

      const results = await Promise.all(promises);
      const rateLimited = results.filter(
        r => r.response && r.response.status === 429
      );

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Monitoring', () => {
    test('should track metrics for operations', async () => {
      // Perform some operations
      await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'kb_list',
            arguments: {},
          },
          id: 7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      // Check metrics
      const metricsResponse = await axios.get(`http://localhost:${testPort}/metrics`);
      expect(metricsResponse.data).toContain('kb_operations_total');
      expect(metricsResponse.data).toContain('kb_list');
    });

    test('should update health status on errors', async () => {
      // Cause an error
      await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'kb_read',
            arguments: {
              path: 'non-existent-file.md',
            },
          },
          id: 8,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      // Check health
      const healthResponse = await axios.get(`http://localhost:${testPort}/health`);
      expect(healthResponse.data.checks).toBeDefined();
    });
  });

  describe('Audit Logging', () => {
    test('should log all operations', async () => {
      // Perform operations
      const operations = [
        { name: 'kb_list', arguments: {} },
        { name: 'kb_read', arguments: { path: 'test/integration.md' } },
        { name: 'kb_search', arguments: { query: 'test' } },
      ];

      for (const op of operations) {
        await axios.post(
          `http://localhost:${testPort}/mcp/tools`,
          {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: op,
            id: Math.random(),
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          }
        );
      }

      // Check audit logs exist
      const auditPath = path.join(testDir, 'kb', '.audit', 'audit.log');
      const auditExists = await fs.access(auditPath).then(() => true).catch(() => false);
      expect(auditExists).toBe(true);

      // Verify log content
      const auditContent = await fs.readFile(auditPath, 'utf8');
      const lines = auditContent.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      // Parse and verify events
      for (const line of lines) {
        const event = JSON.parse(line);
        expect(event).toHaveProperty('event_id');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('action');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed requests gracefully', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          // Missing required fields
          method: 'tools/call',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          validateStatus: () => true,
        }
      );

      expect(response.status).toBe(400);
    });

    test('should handle unknown tools', async () => {
      const response = await axios.post(
        `http://localhost:${testPort}/mcp/tools`,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
          id: 9,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.isError).toBe(true);
      expect(response.data.content[0].text).toContain('Unknown tool');
    });

    test('should handle server shutdown gracefully', async () => {
      // This would test graceful shutdown
      // For now, just verify server is running
      const response = await axios.get(`http://localhost:${testPort}/health`);
      expect(response.status).toBe(200);
    });
  });
});