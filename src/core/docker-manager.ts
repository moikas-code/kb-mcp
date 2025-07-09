/**
 * Docker Manager for KB-MCP Database Services
 * Manages FalkorDB and Redis containers for graph backend
 */

import Docker from 'dockerode';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Result } from '../types/index.js';

export interface DockerConfig {
  projectId: string;
  projectPath: string;
  falkordbPort: number;
  redisPort: number;
  password: string;
}

export interface ContainerStatus {
  name: string;
  status: 'running' | 'stopped' | 'not_found';
  port?: number;
  containerId?: string;
}

export interface ProjectStatus {
  projectId: string;
  projectPath: string;
  status: 'running' | 'partial' | 'stopped';
  containers: {
    falkordb: ContainerStatus;
    redis: ContainerStatus;
  };
  ports: {
    falkordb: number;
    redis: number;
  };
}

export class DockerManager {
  private docker: Docker;
  private configDir: string;

  constructor() {
    this.docker = new Docker();
    this.configDir = path.join(os.homedir(), '.kb-mcp', 'projects');
  }

  /**
   * Generate unique project ID from project path
   */
  private generateProjectId(projectPath: string): string {
    const hash = require('crypto').createHash('md5').update(projectPath).digest('hex');
    return `kb_${hash.substring(0, 8)}`;
  }

  /**
   * Get available port for service
   */
  private async getAvailablePort(startPort: number): Promise<number> {
    const net = require('net');
    
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      
      server.listen(startPort, () => {
        const port = server.address()?.port;
        server.close(() => {
          if (port) {
            resolve(port);
          } else {
            reject(new Error('Could not determine port'));
          }
        });
      });
      
      server.on('error', () => {
        // Port is in use, try next one
        this.getAvailablePort(startPort + 1).then(resolve).catch(reject);
      });
    });
  }

  /**
   * Generate Docker Compose configuration
   */
  private generateDockerCompose(config: DockerConfig): string {
    return `
version: '3.8'

services:
  falkordb:
    image: falkordb/falkordb:latest
    container_name: ${config.projectId}_falkordb
    ports:
      - "${config.falkordbPort}:6379"
    environment:
      - FALKORDB_PASSWORD=${config.password}
    volumes:
      - ${config.projectId}_falkordb_data:/data
    networks:
      - ${config.projectId}_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${config.password}", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: ${config.projectId}_redis
    ports:
      - "${config.redisPort}:6379"
    command: redis-server --requirepass ${config.password}
    volumes:
      - ${config.projectId}_redis_data:/data
    networks:
      - ${config.projectId}_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${config.password}", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  ${config.projectId}_falkordb_data:
  ${config.projectId}_redis_data:

networks:
  ${config.projectId}_network:
    driver: bridge
`;
  }

  /**
   * Generate .kbconfig.yaml for project
   */
  private generateKBConfig(config: DockerConfig): string {
    return `
storage:
  backend: graph

graph:
  falkordb:
    host: localhost
    port: ${config.falkordbPort}
    password: ${config.password}
  redis:
    host: localhost
    port: ${config.redisPort}
    password: ${config.password}
  project_id: ${config.projectId}
  
project:
  id: ${config.projectId}
  path: ${config.projectPath}
  created_at: ${new Date().toISOString()}
`;
  }

  /**
   * Start database services for a project
   */
  async startDatabase(projectPath: string = process.cwd()): Promise<Result<ProjectStatus>> {
    try {
      const projectId = this.generateProjectId(projectPath);
      const projectDir = path.join(this.configDir, projectId);
      
      // Ensure project directory exists
      await fs.mkdir(projectDir, { recursive: true });
      
      // Get available ports
      const falkordbPort = await this.getAvailablePort(6380);
      const redisPort = await this.getAvailablePort(6390);
      const password = `dev_${projectId}`;
      
      const config: DockerConfig = {
        projectId,
        projectPath,
        falkordbPort,
        redisPort,
        password
      };
      
      // Generate Docker Compose file
      const composeContent = this.generateDockerCompose(config);
      const composePath = path.join(projectDir, 'docker-compose.yml');
      await fs.writeFile(composePath, composeContent);
      
      // Generate KB config
      const kbConfigContent = this.generateKBConfig(config);
      const kbConfigPath = path.join(projectPath, '.kbconfig.yaml');
      await fs.writeFile(kbConfigPath, kbConfigContent);
      
      // Start containers using Docker Compose
      const { execSync } = require('child_process');
      execSync(`docker-compose -f "${composePath}" up -d`, { 
        stdio: 'inherit',
        cwd: projectDir
      });
      
      // Wait for containers to be ready
      await this.waitForContainers(projectId, 30000);
      
      // Get status
      const status = await this.getProjectStatus(projectPath);
      
      if (!status.success) {
        return status;
      }
      
      return {
        success: true,
        data: status.data
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DockerStartError',
          message: `Failed to start database: ${(error as Error).message}`,
          code: 'DOCKER_START_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Stop database services for a project
   */
  async stopDatabase(projectPath: string = process.cwd()): Promise<Result<void>> {
    try {
      const projectId = this.generateProjectId(projectPath);
      const projectDir = path.join(this.configDir, projectId);
      const composePath = path.join(projectDir, 'docker-compose.yml');
      
      // Check if compose file exists
      try {
        await fs.access(composePath);
      } catch {
        return {
          success: false,
          error: {
            name: 'ProjectNotFound',
            message: 'Database not running for this project',
            code: 'PROJECT_NOT_FOUND',
            statusCode: 404,
            isOperational: true
          }
        };
      }
      
      // Stop containers
      const { execSync } = require('child_process');
      execSync(`docker-compose -f "${composePath}" down`, { 
        stdio: 'inherit',
        cwd: projectDir
      });
      
      return { success: true, data: undefined };
      
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DockerStopError',
          message: `Failed to stop database: ${(error as Error).message}`,
          code: 'DOCKER_STOP_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get project status
   */
  async getProjectStatus(projectPath: string = process.cwd()): Promise<Result<ProjectStatus>> {
    try {
      const projectId = this.generateProjectId(projectPath);
      
      // Get container statuses
      const falkordbStatus = await this.getContainerStatus(`${projectId}_falkordb`);
      const redisStatus = await this.getContainerStatus(`${projectId}_redis`);
      
      // Read config to get ports
      const kbConfigPath = path.join(projectPath, '.kbconfig.yaml');
      let falkordbPort = 6380;
      let redisPort = 6390;
      
      try {
        const configContent = await fs.readFile(kbConfigPath, 'utf-8');
        const yaml = require('js-yaml');
        const config = yaml.load(configContent) as any;
        falkordbPort = config.graph?.falkordb?.port || 6380;
        redisPort = config.graph?.redis?.port || 6390;
      } catch {
        // Use defaults if config doesn't exist
      }
      
      let overallStatus: 'running' | 'partial' | 'stopped' = 'stopped';
      if (falkordbStatus.status === 'running' && redisStatus.status === 'running') {
        overallStatus = 'running';
      } else if (falkordbStatus.status === 'running' || redisStatus.status === 'running') {
        overallStatus = 'partial';
      }
      
      const status: ProjectStatus = {
        projectId,
        projectPath,
        status: overallStatus,
        containers: {
          falkordb: falkordbStatus,
          redis: redisStatus
        },
        ports: {
          falkordb: falkordbPort,
          redis: redisPort
        }
      };
      
      return { success: true, data: status };
      
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DockerStatusError',
          message: `Failed to get status: ${(error as Error).message}`,
          code: 'DOCKER_STATUS_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get container status
   */
  private async getContainerStatus(containerName: string): Promise<ContainerStatus> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const container = containers.find(c => c.Names.includes(`/${containerName}`));
      
      if (!container) {
        return {
          name: containerName,
          status: 'not_found'
        };
      }
      
      const status = container.State === 'running' ? 'running' : 'stopped';
      const port = container.Ports.find(p => p.PublicPort)?.PublicPort;
      
      return {
        name: containerName,
        status,
        port,
        containerId: container.Id
      };
      
    } catch (error) {
      return {
        name: containerName,
        status: 'not_found'
      };
    }
  }

  /**
   * Wait for containers to be ready
   */
  private async waitForContainers(projectId: string, timeout: number = 30000): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const falkordbStatus = await this.getContainerStatus(`${projectId}_falkordb`);
      const redisStatus = await this.getContainerStatus(`${projectId}_redis`);
      
      if (falkordbStatus.status === 'running' && redisStatus.status === 'running') {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Containers did not start within timeout');
  }

  /**
   * List all KB projects
   */
  async listProjects(): Promise<Result<ProjectStatus[]>> {
    try {
      const projects: ProjectStatus[] = [];
      
      // List all project directories
      try {
        const projectDirs = await fs.readdir(this.configDir);
        
        for (const dir of projectDirs) {
          if (dir.startsWith('kb_')) {
            const projectDir = path.join(this.configDir, dir);
            const composePath = path.join(projectDir, 'docker-compose.yml');
            
            try {
              await fs.access(composePath);
              
              // Try to determine project path from compose file
              const composeContent = await fs.readFile(composePath, 'utf-8');
              const match = composeContent.match(/# Project: (.+)/);
              const projectPath = match ? match[1] : 'Unknown';
              
              const status = await this.getProjectStatus(projectPath);
              if (status.success) {
                projects.push(status.data!);
              }
            } catch {
              // Skip invalid projects
            }
          }
        }
      } catch {
        // Config directory doesn't exist yet
      }
      
      return { success: true, data: projects };
      
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DockerListError',
          message: `Failed to list projects: ${(error as Error).message}`,
          code: 'DOCKER_LIST_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Reset database (remove all data)
   */
  async resetDatabase(projectPath: string = process.cwd()): Promise<Result<void>> {
    try {
      const projectId = this.generateProjectId(projectPath);
      const projectDir = path.join(this.configDir, projectId);
      const composePath = path.join(projectDir, 'docker-compose.yml');
      
      // Stop containers first
      await this.stopDatabase(projectPath);
      
      // Remove volumes
      const { execSync } = require('child_process');
      execSync(`docker-compose -f "${composePath}" down -v`, { 
        stdio: 'inherit',
        cwd: projectDir
      });
      
      return { success: true, data: undefined };
      
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DockerResetError',
          message: `Failed to reset database: ${(error as Error).message}`,
          code: 'DOCKER_RESET_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get container logs
   */
  async getLogs(projectPath: string = process.cwd(), service?: 'falkordb' | 'redis'): Promise<Result<string>> {
    try {
      const projectId = this.generateProjectId(projectPath);
      const projectDir = path.join(this.configDir, projectId);
      const composePath = path.join(projectDir, 'docker-compose.yml');
      
      const serviceArg = service ? service : '';
      const { execSync } = require('child_process');
      
      const logs = execSync(`docker-compose -f "${composePath}" logs ${serviceArg}`, { 
        encoding: 'utf-8',
        cwd: projectDir
      });
      
      return { success: true, data: logs };
      
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'DockerLogsError',
          message: `Failed to get logs: ${(error as Error).message}`,
          code: 'DOCKER_LOGS_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }
}