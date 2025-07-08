/**
 * Multi-Transport MCP Server
 * Supports stdio, WebSocket, and SSE transports simultaneously
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BackendManager } from '../core/backend-manager.js';
import { WebSocketTransport, WebSocketTransportOptions } from './transports/websocket-transport.js';
import { SSETransport, SSETransportOptions } from './transports/sse-transport.js';
import { createTools, executeTool } from './tools.js';
import { OAuth2Provider, OAuth2Config } from '../auth/oauth2-provider.js';
import { AuthMiddleware } from '../auth/auth-middleware.js';
import winston from 'winston';
import { Result } from '../types/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export interface MultiTransportServerOptions {
  stdio?: boolean;
  websocket?: WebSocketTransportOptions;
  sse?: SSETransportOptions;
  authentication?: {
    enabled: boolean;
    secret?: string;
    validateToken?: (token: string) => Promise<boolean>;
  };
  oauth2?: OAuth2Config;
}

export class MultiTransportServer {
  private mcpServer: Server;
  private backendManager: BackendManager;
  private oauth2Provider?: OAuth2Provider;
  private authMiddleware?: AuthMiddleware;
  private logger: winston.Logger;
  private transports: {
    stdio?: StdioServerTransport;
    websocket?: WebSocketTransport;
    sse?: SSETransport;
  } = {};
  private running = false;

  constructor(
    private options: MultiTransportServerOptions,
    projectRoot?: string
  ) {
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Initialize backend manager
    this.backendManager = new BackendManager(projectRoot);

    // Initialize OAuth2 provider if configured
    if (this.options.oauth2?.enabled) {
      this.oauth2Provider = new OAuth2Provider(this.options.oauth2);
      this.authMiddleware = new AuthMiddleware(this.oauth2Provider);
    }

    // Create MCP server
    this.mcpServer = new Server(
      {
        name: 'kb-mcp-server',
        version: '1.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handler for listing available tools
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = createTools(this.backendManager);
        return { tools };
      } catch (error) {
        this.logger.error('Error listing tools:', error);
        throw error;
      }
    });

    // Handler for executing tools
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        this.logger.debug(`Executing tool: ${name}`, args);
        
        // Extract authentication context from request metadata
        let authContext = null;
        if (this.authMiddleware && request.meta?.headers) {
          authContext = await this.authMiddleware.extractAuthContext(request.meta.headers);
        }
        
        // Authorize request
        if (this.authMiddleware) {
          const authResult = await this.authMiddleware.authorizeRequest(authContext, name, args);
          if (!authResult.success) {
            this.authMiddleware.logAuthEvent('access_denied', authContext, {
              tool: name,
              args,
              error: authResult.error
            });
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: authResult.error.message,
                    code: authResult.error.code,
                    tool: name
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }
          
          this.authMiddleware.logAuthEvent('access_granted', authContext, {
            tool: name,
            args
          });
        }
        
        const result = await executeTool(name, args, this.backendManager);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        this.logger.error(`Error executing tool ${name}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: errorMessage,
                tool: name,
                args: args
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // Handle server errors
    this.mcpServer.onerror = (error) => {
      this.logger.error('MCP server error:', error);
    };
  }

  /**
   * Initialize the server and all transports
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Initialize backend manager
      this.logger.info('Initializing backend manager...');
      const backendResult = await this.backendManager.initialize();
      
      if (!backendResult.success) {
        return {
          success: false,
          error: {
            name: 'BackendInitError',
            message: `Failed to initialize backend: ${backendResult.error.message}`,
            code: 'BACKEND_INIT_FAILED',
            statusCode: 500,
            isOperational: true
          }
        };
      }

      const backend = this.backendManager.getBackend();
      this.logger.info(`Backend initialized: ${backend?.getBackendType()}`);

      // Initialize transports
      await this.initializeTransports();

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ServerInitError',
          message: `Failed to initialize server: ${(error as Error).message}`,
          code: 'SERVER_INIT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  private async initializeTransports(): Promise<void> {
    // Initialize stdio transport
    if (this.options.stdio !== false) {
      this.transports.stdio = new StdioServerTransport();
      this.logger.info('Stdio transport initialized');
    }

    // Initialize WebSocket transport
    if (this.options.websocket) {
      const wsOptions = {
        ...this.options.websocket,
        authentication: {
          ...this.options.authentication,
          validateToken: this.oauth2Provider ? 
            (token: string) => this.oauth2Provider!.verifyToken(token).then(r => r.success) :
            this.options.authentication?.validateToken
        }
      };
      
      this.transports.websocket = new WebSocketTransport(wsOptions, this.mcpServer);
      this.logger.info(`WebSocket transport initialized on port ${wsOptions.port}`);
    }

    // Initialize SSE transport
    if (this.options.sse) {
      const sseOptions = {
        ...this.options.sse,
        authentication: {
          ...this.options.authentication,
          validateToken: this.oauth2Provider ? 
            (token: string) => this.oauth2Provider!.verifyToken(token).then(r => r.success) :
            this.options.authentication?.validateToken
        }
      };
      
      this.transports.sse = new SSETransport(sseOptions, this.mcpServer);
      this.logger.info(`SSE transport initialized on port ${sseOptions.port}`);
    }
  }

  /**
   * Start all configured transports
   */
  async start(): Promise<Result<void>> {
    if (this.running) {
      return {
        success: false,
        error: {
          name: 'ServerAlreadyRunning',
          message: 'Server is already running',
          code: 'SERVER_ALREADY_RUNNING',
          statusCode: 400,
          isOperational: true
        }
      };
    }

    try {
      // Start OAuth2 provider if configured
      if (this.oauth2Provider) {
        await this.oauth2Provider.start(this.options.oauth2?.port || 3000);
        this.logger.info('OAuth2 provider started');
      }

      // Start stdio transport
      if (this.transports.stdio) {
        await this.mcpServer.connect(this.transports.stdio);
        this.logger.info('Stdio transport started');
      }

      // Start WebSocket transport
      if (this.transports.websocket) {
        await this.transports.websocket.start();
        this.logger.info('WebSocket transport started');
      }

      // Start SSE transport
      if (this.transports.sse) {
        await this.transports.sse.start();
        this.logger.info('SSE transport started');
      }

      this.running = true;
      this.logger.info('Multi-transport MCP server started successfully');

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ServerStartError',
          message: `Failed to start server: ${(error as Error).message}`,
          code: 'SERVER_START_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Stop all transports
   */
  async stop(): Promise<Result<void>> {
    if (!this.running) {
      return { success: true, data: undefined };
    }

    try {
      // Stop WebSocket transport
      if (this.transports.websocket) {
        await this.transports.websocket.close();
        this.logger.info('WebSocket transport stopped');
      }

      // Stop SSE transport
      if (this.transports.sse) {
        await this.transports.sse.close();
        this.logger.info('SSE transport stopped');
      }

      // Note: stdio transport doesn't need explicit stopping

      this.running = false;
      this.logger.info('Multi-transport MCP server stopped');

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ServerStopError',
          message: `Failed to stop server: ${(error as Error).message}`,
          code: 'SERVER_STOP_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get server statistics
   */
  getStats(): ServerStats {
    const stats: ServerStats = {
      running: this.running,
      backend: this.backendManager.getBackend()?.getBackendType() || 'none',
      uptime: this.running ? Date.now() - this.startTime : 0,
      transports: {}
    };

    if (this.transports.websocket) {
      stats.transports.websocket = this.transports.websocket.getStats();
    }

    if (this.transports.sse) {
      stats.transports.sse = this.transports.sse.getStats();
    }

    if (this.transports.stdio) {
      stats.transports.stdio = {
        type: 'stdio',
        active: true
      };
    }

    return stats;
  }

  /**
   * Get backend health
   */
  async getHealth(): Promise<Result<any>> {
    try {
      const backendHealth = await this.backendManager.getBackendHealth();
      
      return {
        success: true,
        data: {
          server: {
            running: this.running,
            uptime: this.running ? Date.now() - this.startTime : 0
          },
          backend: backendHealth.success ? backendHealth.data : { status: 'unhealthy' },
          transports: {
            stdio: this.transports.stdio ? 'active' : 'disabled',
            websocket: this.transports.websocket ? 'active' : 'disabled',
            sse: this.transports.sse ? 'active' : 'disabled'
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'HealthCheckError',
          message: `Health check failed: ${(error as Error).message}`,
          code: 'HEALTH_CHECK_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Broadcast message to all connected clients (WebSocket and SSE)
   */
  broadcast(event: string, data: any): void {
    if (this.transports.websocket) {
      // WebSocket broadcast would need to be implemented
      this.logger.debug('Broadcasting to WebSocket clients:', event);
    }

    if (this.transports.sse) {
      this.transports.sse.broadcast(event, data);
      this.logger.debug('Broadcasting to SSE clients:', event);
    }
  }

  private startTime = Date.now();
}

interface ServerStats {
  running: boolean;
  backend: string;
  uptime: number;
  transports: {
    stdio?: any;
    websocket?: any;
    sse?: any;
  };
}