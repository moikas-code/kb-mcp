#!/usr/bin/env node

/**
 * Secure KB MCP Server
 * Production-ready MCP server with full security, audit logging, and monitoring
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  StdioServerTransport,
  SSEServerTransport 
} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { SecureKBManager } from '@core/secure-kb-manager.js';
import { ConfigManager } from '@core/config.js';
import { AuthManager } from '@cli/auth.js';
import { AuditLogger } from '@core/audit.js';
import { SecurityContext, AuditEvent } from '@types/index.js';
import { createSecureTools, executeSecureTool } from './secure-tools.js';
import { authMiddleware, securityMiddleware } from './middleware.js';
import { HealthMonitor } from '@monitoring/health.js';
import { MetricsCollector } from '@monitoring/metrics.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server metadata
const SERVER_NAME = '@secure/kb-manager-mcp';
const SERVER_VERSION = '1.0.0';

export interface SecureMCPServerOptions {
  configPath?: string;
  transport?: 'stdio' | 'http' | 'websocket';
  port?: number;
  tlsEnabled?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  strictMode?: boolean;
}

/**
 * Secure MCP Server implementation
 */
export class SecureMCPServer {
  private server: Server;
  private kbManager: SecureKBManager;
  private configManager: ConfigManager;
  private authManager: AuthManager;
  private auditLogger: AuditLogger;
  private healthMonitor: HealthMonitor;
  private metricsCollector: MetricsCollector;
  private app?: express.Application;
  private isShuttingDown: boolean = false;

  constructor(private options: SecureMCPServerOptions) {
    this.configManager = new ConfigManager();
    this.authManager = new AuthManager();
    this.healthMonitor = new HealthMonitor();
    this.metricsCollector = new MetricsCollector();
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );
    
    // Placeholder for KB manager (initialized after config load)
    this.kbManager = null as any;
    this.auditLogger = null as any;
  }

  /**
   * Initialize the server
   */
  async initialize(): Promise<void> {
    // Load configuration
    await this.configManager.load(this.options.configPath);
    const config = this.configManager.getConfig();
    
    // Initialize KB manager
    const kbPath = config.storage?.path || path.join(process.cwd(), 'kb');
    this.kbManager = new SecureKBManager({
      kbPath,
      encryptionKey: config.security?.encryption?.key,
      enableAudit: config.compliance?.audit?.enabled ?? true,
      enableVersioning: config.storage?.versioning ?? true,
      enableEncryption: config.storage?.encryption_at_rest ?? false,
      rateLimiting: config.security?.rate_limiting,
    });
    
    await this.kbManager.initialize();
    
    // Initialize audit logger
    this.auditLogger = new AuditLogger(
      config.compliance || {},
      path.join(kbPath, '.audit'),
      config.security?.encryption?.key
    );
    
    // Initialize monitoring
    await this.healthMonitor.initialize(this.kbManager, this.auditLogger);
    await this.metricsCollector.initialize();
    
    // Setup handlers
    this.setupHandlers();
    
    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      try {
        // Get security context from request
        const context = await this.getSecurityContext(request);
        
        // Check authentication
        if (this.options.strictMode && !context) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Authentication required'
          );
        }
        
        // Audit log
        await this.logAudit({
          event_type: 'data_access',
          action: 'list_tools',
          resource: 'mcp_tools',
          result: 'success',
        }, context);
        
        // Return tools based on permissions
        const tools = createSecureTools(this.kbManager, context);
        this.metricsCollector.recordOperation('list_tools', 'success');
        
        return { tools };
      } catch (error) {
        this.metricsCollector.recordOperation('list_tools', 'error');
        throw error;
      }
    });

    // Handler for executing tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const startTime = Date.now();
      const { name, arguments: args } = request.params;
      
      try {
        // Get security context
        const context = await this.getSecurityContext(request);
        
        // Check authentication for write operations
        const writeOperations = ['kb_update', 'kb_delete', 'kb_create'];
        if (writeOperations.includes(name) && !context) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Authentication required for write operations'
          );
        }
        
        // Check rate limiting
        if (context && this.isRateLimited(context)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Rate limit exceeded'
          );
        }
        
        // Execute tool with security context
        const result = await executeSecureTool(
          name,
          args,
          this.kbManager,
          context || this.getDefaultContext(),
          this.auditLogger
        );
        
        // Record metrics
        const duration = Date.now() - startTime;
        this.metricsCollector.recordOperation(name, 'success', duration);
        
        // Audit log
        await this.logAudit({
          event_type: 'data_access',
          action: `tool_${name}`,
          resource: args.path || name,
          result: 'success',
          metadata: {
            tool: name,
            duration_ms: duration,
          },
        }, context);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        this.metricsCollector.recordOperation(name, 'error', duration);
        
        // Audit log error
        await this.logAudit({
          event_type: 'error',
          action: `tool_${name}`,
          resource: args?.path || name,
          result: 'error',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            tool: name,
            duration_ms: duration,
          },
        }, await this.getSecurityContext(request));
        
        // Return error response
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: errorMessage,
                tool: name,
                timestamp: new Date().toISOString(),
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    await this.initialize();
    
    switch (this.options.transport) {
      case 'http':
      case 'websocket':
        await this.startHttpServer();
        break;
      
      case 'stdio':
      default:
        await this.startStdioServer();
        break;
    }
    
    // Start monitoring
    this.healthMonitor.startMonitoring();
    this.metricsCollector.startCollection();
    
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running on ${this.options.transport || 'stdio'}`);
  }

  /**
   * Start stdio transport server
   */
  private async startStdioServer(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Start HTTP/WebSocket transport server
   */
  private async startHttpServer(): Promise<void> {
    const app = express();
    this.app = app;
    
    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: this.configManager.get('security.rate_limiting.max_requests_per_minute') || 100,
      message: 'Too many requests',
    });
    app.use('/mcp', limiter);
    
    // Authentication middleware
    app.use('/mcp', authMiddleware(this.authManager, this.options.strictMode || false));
    
    // Security middleware
    app.use('/mcp', securityMiddleware());
    
    // Health check endpoints
    app.get('/health', (req, res) => {
      const health = this.healthMonitor.getHealth();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });
    
    app.get('/ready', (req, res) => {
      const ready = this.healthMonitor.isReady();
      res.status(ready ? 200 : 503).json({ ready });
    });
    
    // Metrics endpoint
    app.get('/metrics', (req, res) => {
      const metrics = this.metricsCollector.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    });
    
    // MCP endpoints
    if (this.options.transport === 'websocket') {
      // WebSocket transport
      const server = app.listen(this.options.port || 3000);
      const transport = new SSEServerTransport('/mcp', server);
      await this.server.connect(transport);
    } else {
      // HTTP transport
      app.post('/mcp/tools', async (req, res) => {
        // Handle tool execution via HTTP
        try {
          const result = await this.server.handleRequest(req.body);
          res.json(result);
        } catch (error) {
          res.status(400).json({
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });
      
      app.listen(this.options.port || 3000);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      console.error(`\nReceived ${signal}, shutting down gracefully...`);
      
      // Stop accepting new connections
      if (this.app) {
        this.app.set('isShuttingDown', true);
      }
      
      // Stop monitoring
      this.healthMonitor.stopMonitoring();
      this.metricsCollector.stopCollection();
      
      // Flush audit logs
      await this.logAudit({
        event_type: 'system',
        action: 'shutdown',
        resource: 'server',
        result: 'success',
        metadata: { signal },
      }, this.getDefaultContext());
      
      // Close connections
      await this.server.close();
      
      process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2'));
  }

  /**
   * Get security context from request
   */
  private async getSecurityContext(request: any): Promise<SecurityContext | null> {
    // In HTTP mode, context is attached by middleware
    if (request.context) {
      return request.context;
    }
    
    // In stdio mode, check for auth header in request metadata
    if (request.metadata?.authorization) {
      const token = request.metadata.authorization.replace('Bearer ', '');
      const session = await this.authManager.verifyToken(token);
      return session?.context || null;
    }
    
    return null;
  }

  /**
   * Get default security context for unauthenticated requests
   */
  private getDefaultContext(): SecurityContext {
    return {
      user_id: 'anonymous',
      session_id: 'no-session',
      ip_address: '127.0.0.1',
      user_agent: 'mcp-client',
      permissions: ['kb.read'],
      mfa_verified: false,
    };
  }

  /**
   * Check if request is rate limited
   */
  private isRateLimited(context: SecurityContext): boolean {
    // Implement rate limiting logic
    // For now, return false
    return false;
  }

  /**
   * Log audit event
   */
  private async logAudit(
    event: Partial<AuditEvent>,
    context: SecurityContext | null
  ): Promise<void> {
    if (this.auditLogger) {
      await this.auditLogger.log(event, context || this.getDefaultContext());
    }
  }
}

// Export for CLI usage
export async function startMCPServer(options: SecureMCPServerOptions): Promise<void> {
  const server = new SecureMCPServer(options);
  await server.start();
}