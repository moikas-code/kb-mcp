#!/usr/bin/env node

import { MultiTransportServer } from './dist/mcp/multi-transport-server.js';

async function startServer() {
  console.log('Starting MCP multi-transport server...');
  
  const server = new MultiTransportServer({
    stdio: false,
    sse: { 
      port: 8081, 
      basePath: '/mcp'
    }
  }, process.cwd());
  
  try {
    await server.start();
    console.log('✓ MCP Server running on http://localhost:8081');
    console.log('  HTTP endpoint: http://localhost:8081/mcp/message');
    console.log('  SSE endpoint: http://localhost:8081/mcp/sse');
    console.log('Press Ctrl+C to stop');
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\nStopping server...');
      await server.stop();
      process.exit(0);
    });
    
    // Keep alive
    setInterval(() => {
      // Server heartbeat
    }, 30000);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();