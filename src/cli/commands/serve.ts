/**
 * Serve Command
 * Start the KB Manager as an MCP server
 */

import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '@core/config.js';
import { startMCPServer, SecureMCPServerOptions } from '@mcp/secure-server.js';

export async function serveCommand(
  options: any,
  configManager: ConfigManager
): Promise<void> {
  const spinner = ora('Starting MCP server').start();
  
  try {
    // Load configuration
    await configManager.load(options.config);
    const config = configManager.getConfig();
    
    // Determine transport
    let transport: 'stdio' | 'http' | 'websocket' = 'stdio';
    if (options.websocket) {
      transport = 'websocket';
    } else if (options.port || options.http) {
      transport = 'http';
    }
    
    spinner.text = `Starting MCP server in ${transport} mode`;
    
    // Build server options
    const serverOptions: SecureMCPServerOptions = {
      configPath: options.config,
      transport,
      port: options.port ? parseInt(options.port) : undefined,
      tlsEnabled: options.tls || false,
      tlsCert: options.cert,
      tlsKey: options.key,
      strictMode: options.strictMode || config.security?.authentication?.mfa_required || false,
    };
    
    // Validate TLS options
    if (serverOptions.tlsEnabled && (!serverOptions.tlsCert || !serverOptions.tlsKey)) {
      throw new Error('TLS enabled but certificate or key not provided');
    }
    
    spinner.succeed('MCP server configuration loaded');
    
    // Display server info
    console.log('\n' + chalk.bold('Server Configuration:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Transport:  ${chalk.cyan(transport)}`);
    if (transport !== 'stdio') {
      console.log(`Port:       ${chalk.cyan(serverOptions.port || 3000)}`);
      console.log(`TLS:        ${serverOptions.tlsEnabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    }
    console.log(`Strict:     ${serverOptions.strictMode ? chalk.yellow('Enabled') : chalk.gray('Disabled')}`);
    console.log(`Config:     ${chalk.cyan(options.config || 'default')}`);
    
    // Display security info
    console.log('\n' + chalk.bold('Security:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Encryption: ${config.storage?.encryption_at_rest ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    console.log(`Audit:      ${config.compliance?.audit?.enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
    console.log(`MFA:        ${config.security?.authentication?.mfa_required ? chalk.green('Required') : chalk.gray('Optional')}`);
    console.log(`Rate Limit: ${config.security?.rate_limiting?.enabled ? chalk.green(config.security.rate_limiting.max_requests_per_minute + '/min') : chalk.gray('Disabled')}`);
    
    // Display endpoints for HTTP/WebSocket modes
    if (transport !== 'stdio') {
      const protocol = serverOptions.tlsEnabled ? 'https' : 'http';
      const port = serverOptions.port || 3000;
      
      console.log('\n' + chalk.bold('Endpoints:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`Health:     ${chalk.cyan(`${protocol}://localhost:${port}/health`)}`);
      console.log(`Metrics:    ${chalk.cyan(`${protocol}://localhost:${port}/metrics`)}`);
      console.log(`Ready:      ${chalk.cyan(`${protocol}://localhost:${port}/ready`)}`);
      
      if (transport === 'websocket') {
        console.log(`MCP:        ${chalk.cyan(`ws://localhost:${port}/mcp`)}`);
      } else {
        console.log(`MCP:        ${chalk.cyan(`${protocol}://localhost:${port}/mcp/tools`)}`);
      }
    }
    
    // Display usage instructions
    console.log('\n' + chalk.bold('Usage:'));
    console.log(chalk.gray('─'.repeat(40)));
    
    if (transport === 'stdio') {
      console.log('Add to Claude Desktop configuration:');
      console.log(chalk.gray(JSON.stringify({
        mcpServers: {
          'kb-manager': {
            command: 'kb',
            args: ['serve'],
            env: {
              KB_CONFIG_PATH: options.config || '.kbconfig.yaml'
            }
          }
        }
      }, null, 2)));
    } else {
      console.log('Connect your MCP client to:');
      console.log(chalk.cyan(`  ${transport === 'websocket' ? 'ws' : 'http'}://localhost:${serverOptions.port || 3000}/mcp`));
      
      if (serverOptions.strictMode) {
        console.log('\n' + chalk.yellow('⚠️  Authentication required. Include Bearer token in requests.'));
      }
    }
    
    console.log('\n' + chalk.gray('Press Ctrl+C to stop the server'));
    console.log();
    
    // Start the server
    await startMCPServer(serverOptions);
    
  } catch (error) {
    spinner.fail(`Failed to start MCP server: ${error}`);
    process.exit(1);
  }
}