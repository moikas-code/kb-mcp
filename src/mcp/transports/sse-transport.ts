/**
 * Server-Sent Events (SSE) Transport for MCP Server
 * Enables remote access to KB-MCP server via HTTP SSE connections
 */

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import winston from 'winston';
import { Result } from '../../types/index.js';
import { randomUUID } from 'crypto';

export interface SSETransportOptions {
  port: number;
  host?: string;
  path?: string;
  maxConnections?: number;
  heartbeatInterval?: number;
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
  rateLimit?: {
    points: number;
    duration: number;
  };
  authentication?: {
    enabled: boolean;
    secret?: string;
    validateToken?: (token: string) => Promise<boolean>;
  };
}

interface SSEClient {
  id: string;
  response: express.Response;
  connected: number;
  authenticated: boolean;
  remoteAddress?: string;
  userAgent?: string;
  lastHeartbeat?: number;
}

export class SSETransport implements Transport {
  private app: express.Application;
  private server: any;
  private mcpServer: Server;
  private clients: Map<string, SSEClient> = new Map();
  private logger: winston.Logger;
  private rateLimiter?: RateLimiterMemory;
  private heartbeatInterval?: NodeJS.Timer;
  private pendingRequests: Map<string, express.Response> = new Map();

  constructor(
    private options: SSETransportOptions,
    mcpServer: Server
  ) {
    this.mcpServer = mcpServer;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupHeartbeat();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'", "https:", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS middleware
    this.app.use(cors({
      origin: this.options.cors?.origin || '*',
      credentials: this.options.cors?.credentials || false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    if (this.options.rateLimit) {
      this.rateLimiter = new RateLimiterMemory({
        points: this.options.rateLimit.points,
        duration: this.options.rateLimit.duration,
      });

      this.app.use(async (req, res, next) => {
        if (!this.rateLimiter) return next();
        
        try {
          await this.rateLimiter.consume(req.ip);
          next();
        } catch (rejRes) {
          res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded'
          });
        }
      });
    }

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.path} from ${req.ip}`);
      next();
    });
  }

  private setupRoutes(): void {
    const basePath = this.options.path || '/mcp';

    // SSE endpoint
    this.app.get(`${basePath}/events`, this.handleSSEConnection.bind(this));

    // HTTP endpoint for sending messages
    this.app.post(`${basePath}/message`, this.handleHTTPMessage.bind(this));

    // Health check endpoint
    this.app.get(`${basePath}/health`, (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connections: this.clients.size,
        uptime: process.uptime()
      });
    });

    // Stats endpoint
    this.app.get(`${basePath}/stats`, (req, res) => {
      res.json(this.getStats());
    });

    // Error handling
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Express error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }

  private setupHeartbeat(): void {
    if (this.options.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        const now = Date.now();
        this.clients.forEach((client) => {
          try {
            this.sendSSEMessage(client.response, 'heartbeat', {
              timestamp: now,
              clientId: client.id
            });
            client.lastHeartbeat = now;
          } catch (error) {
            this.logger.error(`Failed to send heartbeat to ${client.id}:`, error);
            this.removeClient(client.id);
          }
        });
      }, this.options.heartbeatInterval);
    }
  }

  private async handleSSEConnection(req: express.Request, res: express.Response): Promise<void> {
    // Authentication check
    if (this.options.authentication?.enabled) {
      const authResult = await this.authenticate(req);
      if (!authResult.success) {
        res.status(401).json({ error: 'Authentication failed' });
        return;
      }
    }

    // Check connection limit
    if (this.options.maxConnections && this.clients.size >= this.options.maxConnections) {
      res.status(503).json({ error: 'Max connections exceeded' });
      return;
    }

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': this.options.cors?.origin || '*',
      'Access-Control-Allow-Credentials': this.options.cors?.credentials ? 'true' : 'false'
    });

    // Create client info
    const clientId = randomUUID();
    const client: SSEClient = {
      id: clientId,
      response: res,
      connected: Date.now(),
      authenticated: true,
      remoteAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    this.clients.set(clientId, client);
    this.logger.info(`SSE client connected: ${clientId} from ${req.ip}`);

    // Send connection acknowledgment
    this.sendSSEMessage(res, 'connected', {
      clientId,
      timestamp: client.connected
    });

    // Handle client disconnect
    req.on('close', () => {
      this.removeClient(clientId);
    });

    req.on('error', (error) => {
      this.logger.error(`SSE client error ${clientId}:`, error);
      this.removeClient(clientId);
    });
  }

  private async handleHTTPMessage(req: express.Request, res: express.Response): Promise<void> {
    try {
      // Authentication check
      if (this.options.authentication?.enabled) {
        const authResult = await this.authenticate(req);
        if (!authResult.success) {
          res.status(401).json({ error: 'Authentication failed' });
          return;
        }
      }

      const message = req.body as JSONRPCMessage;
      this.logger.debug('Received HTTP message:', message);

      // Validate message
      if (!message.jsonrpc || !message.method) {
        res.status(400).json({
          error: 'Invalid JSON-RPC message',
          message: 'Missing jsonrpc or method field'
        });
        return;
      }

      // Handle the message with MCP server
      const response = await this.mcpServer.handleRequest(message);

      if (response) {
        res.json(response);
      } else {
        res.status(204).send(); // No content
      }

    } catch (error) {
      this.logger.error('Error handling HTTP message:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: (error as Error).message
      });
    }
  }

  private async authenticate(req: express.Request): Promise<Result<void>> {
    try {
      const authHeader = req.get('Authorization');
      if (!authHeader) {
        return {
          success: false,
          error: {
            name: 'AuthenticationError',
            message: 'Missing authorization header',
            code: 'MISSING_AUTH_HEADER',
            statusCode: 401,
            isOperational: true
          }
        };
      }

      const token = authHeader.replace('Bearer ', '');
      
      if (this.options.authentication?.validateToken) {
        const isValid = await this.options.authentication.validateToken(token);
        if (!isValid) {
          return {
            success: false,
            error: {
              name: 'AuthenticationError',
              message: 'Invalid token',
              code: 'INVALID_TOKEN',
              statusCode: 401,
              isOperational: true
            }
          };
        }
      } else if (this.options.authentication?.secret) {
        if (token !== this.options.authentication.secret) {
          return {
            success: false,
            error: {
              name: 'AuthenticationError',
              message: 'Invalid secret',
              code: 'INVALID_SECRET',
              statusCode: 401,
              isOperational: true
            }
          };
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'AuthenticationError',
          message: `Authentication failed: ${(error as Error).message}`,
          code: 'AUTH_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  private sendSSEMessage(res: express.Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      this.logger.error('Failed to send SSE message:', error);
    }
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.logger.info(`SSE client disconnected: ${clientId}`);
      this.clients.delete(clientId);
      
      try {
        client.response.end();
      } catch (error) {
        // Response already ended
      }
    }
  }

  // Transport interface methods
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, this.options.host || 'localhost', () => {
        this.logger.info(`SSE MCP server listening on ${this.options.host || 'localhost'}:${this.options.port}${this.options.path || '/mcp'}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    this.clients.forEach((client) => {
      try {
        client.response.end();
      } catch (error) {
        // Response already ended
      }
    });
    this.clients.clear();

    // Close the server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('SSE server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Get server statistics
  getStats(): SSEStats {
    const now = Date.now();
    const clientStats = Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connected: client.connected,
      authenticated: client.authenticated,
      remoteAddress: client.remoteAddress,
      userAgent: client.userAgent,
      lastHeartbeat: client.lastHeartbeat
    }));

    return {
      totalConnections: this.clients.size,
      clients: clientStats,
      uptime: now - this.startTime,
      port: this.options.port,
      host: this.options.host || 'localhost',
      path: this.options.path || '/mcp'
    };
  }

  // Broadcast message to all connected clients
  broadcast(event: string, data: any): void {
    this.clients.forEach((client) => {
      try {
        this.sendSSEMessage(client.response, event, data);
      } catch (error) {
        this.logger.error(`Failed to broadcast to ${client.id}:`, error);
        this.removeClient(client.id);
      }
    });
  }

  private startTime = Date.now();
}

interface SSEStats {
  totalConnections: number;
  clients: Array<{
    id: string;
    connected: number;
    authenticated: boolean;
    remoteAddress?: string;
    userAgent?: string;
    lastHeartbeat?: number;
  }>;
  uptime: number;
  port: number;
  host: string;
  path: string;
}