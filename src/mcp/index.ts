#!/usr/bin/env node

/**
 * Script KB MCP Server
 * 
 * An MCP server for managing the Script programming language knowledge base.
 * Provides tools for reading, updating, and searching documentation.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { KBManager } from './kb-manager.js';
import { createTools, executeTool } from './tools.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server metadata
const SERVER_NAME = 'script-kb-mcp';
const SERVER_VERSION = '0.1.0';

class ScriptKBServer {
  private server: Server;
  private kbManager: KBManager;

  constructor() {
    // Get project root from environment or use default
    // If running from the script-kb-mcp directory, go up one level to script root
    let projectRoot = process.env.SCRIPT_PROJECT_ROOT;
    if (!projectRoot) {
      // Default: assume we're in script/script-kb-mcp/dist/
      projectRoot = path.resolve(__dirname, '../../..');
      // If that doesn't have a kb directory, try current working directory
      try {
        const kbPath = path.join(projectRoot, 'kb');
        require('fs').accessSync(kbPath);
      } catch {
        // Try current working directory
        projectRoot = process.cwd();
      }
    }
    
    console.error(`Initializing KB Manager with project root: ${projectRoot}`);
    
    this.kbManager = new KBManager(projectRoot);
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: createTools(this.kbManager),
    }));

    // Handler for executing tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const result = await executeTool(name, args, this.kbManager);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
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
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
  }
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
async function main() {
  const server = new ScriptKBServer();
  await server.start();
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});