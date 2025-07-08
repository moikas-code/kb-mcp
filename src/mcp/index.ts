#!/usr/bin/env node

/**
 * KB-MCP Server
 * 
 * Multi-transport MCP server for knowledge base management.
 * Supports stdio, WebSocket, and SSE transports for local and remote access.
 */

import { MultiTransportServer } from './multi-transport-server.js';
import { createOAuth2ConfigFromEnv } from '../auth/oauth2-config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const wsPort = parseInt(args.find(arg => arg.startsWith('--ws-port='))?.split('=')[1] || '8080');
const ssePort = parseInt(args.find(arg => arg.startsWith('--sse-port='))?.split('=')[1] || '8081');
const authSecret = args.find(arg => arg.startsWith('--auth-secret='))?.split('=')[1];

// Determine project root
let projectRoot = process.env.KB_PROJECT_ROOT;
if (!projectRoot) {
  projectRoot = path.resolve(__dirname, '../../..');
  try {
    const kbPath = path.join(projectRoot, 'kb');
    require('fs').accessSync(kbPath);
  } catch {
    projectRoot = process.cwd();
  }
}

console.error(`Initializing KB-MCP server with project root: ${projectRoot}`);

// Configure OAuth2 if enabled
const oauth2Config = createOAuth2ConfigFromEnv();

// Configure server options
const serverOptions = {
  stdio: true, // Always enable stdio for local development
  websocket: !isLocal ? {
    port: wsPort,
    host: '0.0.0.0',
    path: '/mcp',
    maxConnections: 100,
    heartbeatInterval: 30000,
    authentication: {
      enabled: !!authSecret || oauth2Config.enabled,
      secret: authSecret
    }
  } : undefined,
  sse: !isLocal ? {
    port: ssePort,
    host: '0.0.0.0',
    path: '/mcp',
    maxConnections: 100,
    heartbeatInterval: 30000,
    cors: {
      origin: '*',
      credentials: false
    },
    rateLimit: {
      points: 100,
      duration: 60
    },
    authentication: {
      enabled: !!authSecret || oauth2Config.enabled,
      secret: authSecret
    }
  } : undefined,
  authentication: {
    enabled: !!authSecret || oauth2Config.enabled,
    secret: authSecret
  },
  oauth2: oauth2Config.enabled ? {
    ...oauth2Config,
    port: parseInt(args.find(arg => arg.startsWith('--oauth2-port='))?.split('=')[1] || '3000')
  } : undefined
};

// Create and start server
async function main() {
  const server = new MultiTransportServer(serverOptions, projectRoot);
  
  // Initialize server
  console.error('Initializing server...');
  const initResult = await server.initialize();
  if (!initResult.success) {
    console.error('Failed to initialize server:', initResult.error.message);
    process.exit(1);
  }
  
  // Start server
  console.error('Starting server...');
  const startResult = await server.start();
  if (!startResult.success) {
    console.error('Failed to start server:', startResult.error.message);
    process.exit(1);
  }
  
  console.error('KB-MCP server started successfully');
  
  if (!isLocal) {
    console.error(`WebSocket endpoint: ws://localhost:${wsPort}/mcp`);
    console.error(`SSE endpoint: http://localhost:${ssePort}/mcp/events`);
    console.error(`HTTP endpoint: http://localhost:${ssePort}/mcp/message`);
    console.error(`Health check: http://localhost:${ssePort}/mcp/health`);
    
    if (oauth2Config.enabled) {
      console.error(`OAuth2 server: http://localhost:3000/oauth2/`);
      console.error(`OAuth2 health: http://localhost:3000/oauth2/health`);
      console.error('OAuth2 authentication enabled - obtain token from OAuth2 endpoints');
    } else if (authSecret) {
      console.error('Simple authentication enabled - use Authorization: Bearer <secret>');
    }
  }
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down server...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.error('Shutting down server...');
    await server.stop();
    process.exit(0);
  });
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});