/**
 * WebSocket Transport for MCP Server
 * Enables remote access to KB-MCP server via WebSocket connections
 */

import { WebSocket, WebSocketServer } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import { Result } from '../../types/index.js';

export interface WebSocketTransportOptions {
  port: number;
  host?: string;
  path?: string;
  maxConnections?: number;
  heartbeatInterval?: number;
  authentication?: {
    enabled: boolean;
    secret?: string;
    validateToken?: (token: string) => Promise<boolean>;
  };
}

export class WebSocketTransport implements Transport {
  private wss: WebSocketServer;
  private server: Server;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private logger: winston.Logger;
  private heartbeatInterval?: NodeJS.Timer;

  constructor(
    private options: WebSocketTransportOptions,
    server: Server
  ) {
    this.server = server;
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

    this.wss = new WebSocketServer({
      port: options.port,
      host: options.host || 'localhost',
      path: options.path || '/mcp',
      maxPayload: 1024 * 1024 * 10, // 10MB max payload
      perMessageDeflate: true
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleError.bind(this));
    this.wss.on('listening', () => {
      this.logger.info(`WebSocket MCP server listening on ${this.options.host || 'localhost'}:${this.options.port}${this.options.path || '/mcp'}`);
    });

    // Setup heartbeat
    if (this.options.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        this.wss.clients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        });
      }, this.options.heartbeatInterval);
    }
  }

  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    const clientInfo: ClientInfo = {
      id: this.generateClientId(),
      connected: Date.now(),
      authenticated: false,
      remoteAddress: request.socket.remoteAddress,
      userAgent: request.headers['user-agent']
    };

    this.clients.set(ws, clientInfo);

    this.logger.info(`Client connected: ${clientInfo.id} from ${clientInfo.remoteAddress}`);

    // Check connection limit
    if (this.options.maxConnections && this.clients.size > this.options.maxConnections) {
      this.logger.warn(`Max connections exceeded, closing connection: ${clientInfo.id}`);
      ws.close(1008, 'Max connections exceeded');
      return;
    }

    // Handle authentication if enabled
    if (this.options.authentication?.enabled) {
      const authResult = await this.handleAuthentication(ws, request);
      if (!authResult.success) {
        this.logger.warn(`Authentication failed for client: ${clientInfo.id}`);
        ws.close(1008, 'Authentication failed');
        return;
      }
      clientInfo.authenticated = true;
    } else {
      clientInfo.authenticated = true;
    }

    // Setup message handling
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', () => this.handleDisconnection(ws));
    ws.on('error', (error) => this.handleClientError(ws, error));
    ws.on('pong', () => {
      clientInfo.lastPong = Date.now();
    });

    // Send connection acknowledgment
    this.send(ws, {
      jsonrpc: '2.0',
      method: 'connection/established',
      params: {
        clientId: clientInfo.id,
        serverVersion: '1.0.0'
      }
    });
  }

  private async handleAuthentication(ws: WebSocket, request: any): Promise<Result<void>> {
    try {
      const authHeader = request.headers['authorization'];
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

  private async handleMessage(ws: WebSocket, data: any): Promise<void> {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    try {
      const message = JSON.parse(data.toString()) as JSONRPCMessage;
      
      this.logger.debug(`Received message from ${clientInfo.id}:`, message);

      // Forward to MCP server
      const response = await this.server.handleRequest(message);
      
      if (response) {
        this.send(ws, response);
      }
    } catch (error) {
      this.logger.error(`Error handling message from ${clientInfo.id}:`, error);
      
      // Send error response
      this.send(ws, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
          data: (error as Error).message
        }
      });
    }
  }

  private handleDisconnection(ws: WebSocket): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      this.logger.info(`Client disconnected: ${clientInfo.id}`);
      this.clients.delete(ws);
    }
  }

  private handleClientError(ws: WebSocket, error: Error): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      this.logger.error(`Client error ${clientInfo.id}:`, error);
    }
  }

  private handleError(error: Error): void {
    this.logger.error('WebSocket server error:', error);
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Transport interface methods
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.on('listening', resolve);
      this.wss.on('error', reject);
    });
  }

  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    this.wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    // Close the server
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });
  }

  // Get server statistics
  getStats(): WebSocketStats {
    const now = Date.now();
    const clientStats = Array.from(this.clients.entries()).map(([ws, info]) => ({
      id: info.id,
      connected: info.connected,
      authenticated: info.authenticated,
      remoteAddress: info.remoteAddress,
      userAgent: info.userAgent,
      lastPong: info.lastPong,
      readyState: ws.readyState
    }));

    return {
      totalConnections: this.clients.size,
      activeConnections: Array.from(this.wss.clients).filter(ws => ws.readyState === WebSocket.OPEN).length,
      clients: clientStats,
      uptime: now - this.startTime,
      port: this.options.port,
      host: this.options.host || 'localhost',
      path: this.options.path || '/mcp'
    };
  }

  private startTime = Date.now();
}

interface ClientInfo {
  id: string;
  connected: number;
  authenticated: boolean;
  remoteAddress?: string;
  userAgent?: string;
  lastPong?: number;
}

interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  clients: Array<{
    id: string;
    connected: number;
    authenticated: boolean;
    remoteAddress?: string;
    userAgent?: string;
    lastPong?: number;
    readyState: number;
  }>;
  uptime: number;
  port: number;
  host: string;
  path: string;
}