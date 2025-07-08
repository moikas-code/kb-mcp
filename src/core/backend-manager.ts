/**
 * Backend Manager
 * Handles backend selection, configuration, and switching between storage types
 */

import { StorageBackend, BackendConfig } from './storage-interface.js';
import { FilesystemBackend } from './filesystem-backend.js';
import { GraphBackend } from './graph-backend.js';
import { Result } from '../types/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
const yaml = require('js-yaml');

export class BackendManager {
  private currentBackend: StorageBackend | null = null;
  private config: BackendConfig | null = null;
  private configPath: string;

  constructor(projectRoot?: string) {
    // Determine config file location
    if (projectRoot) {
      this.configPath = path.join(projectRoot, '.kbconfig.yaml');
    } else {
      this.configPath = path.join(os.homedir(), '.config', 'kb-mcp', 'config.yaml');
    }
  }

  /**
   * Initialize backend manager and load configuration
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Load configuration
      const configResult = await this.loadConfiguration();
      if (!configResult.success) {
        // Create default config if none exists
        await this.createDefaultConfiguration();
        const retryResult = await this.loadConfiguration();
        if (!retryResult.success) {
          return retryResult;
        }
      }

      // Initialize the backend
      const backend = await this.createBackend(this.config!);
      if (!backend.success) {
        return backend;
      }

      this.currentBackend = backend.data;
      return await this.currentBackend.initialize();
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'BackendManagerError',
          message: `Failed to initialize backend manager: ${(error as Error).message}`,
          code: 'BACKEND_MANAGER_INIT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get the current active backend
   */
  getBackend(): StorageBackend | null {
    return this.currentBackend;
  }

  /**
   * Get current backend configuration
   */
  getCurrentConfig(): BackendConfig | null {
    return this.config;
  }

  /**
   * Switch to a different backend
   */
  async switchBackend(newBackendType: 'filesystem' | 'graph', migrate = false): Promise<Result<void>> {
    try {
      // Export data from current backend if migration requested
      let exportData = null;
      if (migrate && this.currentBackend) {
        const exportResult = await this.currentBackend.exportData();
        if (!exportResult.success) {
          return exportResult;
        }
        exportData = exportResult.data;
      }

      // Update configuration
      const newConfig: BackendConfig = {
        ...this.config!,
        type: newBackendType
      };

      // Create new backend
      const newBackendResult = await this.createBackend(newConfig);
      if (!newBackendResult.success) {
        return newBackendResult;
      }

      // Initialize new backend
      const initResult = await newBackendResult.data.initialize();
      if (!initResult.success) {
        return initResult;
      }

      // Import data if migration requested
      if (migrate && exportData) {
        const importResult = await newBackendResult.data.importData(exportData);
        if (!importResult.success) {
          return importResult;
        }
      }

      // Update current backend and config
      this.currentBackend = newBackendResult.data;
      this.config = newConfig;

      // Save configuration
      await this.saveConfiguration();

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'BackendSwitchError',
          message: `Failed to switch backend: ${error instanceof Error ? error.message : String(error)}`,
          code: 'BACKEND_SWITCH_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Update backend configuration
   */
  async updateConfiguration(updates: Partial<BackendConfig>): Promise<Result<void>> {
    try {
      this.config = { ...this.config!, ...updates };
      await this.saveConfiguration();

      // Reinitialize if backend type changed
      if (updates.type && updates.type !== this.currentBackend?.getBackendType()) {
        return await this.switchBackend(updates.type, false);
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ConfigUpdateError',
          message: `Failed to update configuration: ${error instanceof Error ? error.message : String(error)}`,
          code: 'CONFIG_UPDATE_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get backend health information
   */
  async getBackendHealth(): Promise<Result<{ backend: string; status: string; details: Record<string, any> }>> {
    if (!this.currentBackend) {
      return {
        success: false,
        error: {
          name: 'NoBackendError',
          message: 'No backend initialized',
          code: 'NO_BACKEND',
          statusCode: 503,
          isOperational: true
        }
      };
    }

    const healthResult = await this.currentBackend.healthCheck();
    if (!healthResult.success) {
      return healthResult;
    }

    return {
      success: true,
      data: {
        backend: this.currentBackend.getBackendType(),
        status: healthResult.data.status,
        details: healthResult.data.details
      }
    };
  }

  /**
   * List available backend types and their configurations
   */
  async listAvailableBackends(): Promise<Result<Array<{ type: string; available: boolean; requirements: string[] }>>> {
    const backends = [
      {
        type: 'filesystem',
        available: true,
        requirements: ['File system access']
      },
      {
        type: 'graph',
        available: await this.checkGraphAvailability(),
        requirements: ['FalkorDB/Redis server', 'Network connectivity']
      }
    ];

    return {
      success: true,
      data: backends
    };
  }

  private async checkGraphAvailability(): Promise<boolean> {
    try {
      // Try to create a test graph backend
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const ___testConfig: BackendConfig = {
        type: 'graph',
        graph: {
          connection: {
            host: 'localhost',
            port: 6380
          },
          vector_dimensions: 1536,
          enable_temporal_queries: false,
          enable_semantic_search: false
        }
      };

      // const testBackend = new GraphBackend(testConfig);
      // const testResult = await testBackend.initialize();
      // return testResult.success;
      return false; // Temporarily disabled
    } catch {
      return false;
    }
  }

  private async createBackend(config: BackendConfig): Promise<Result<StorageBackend>> {
    try {
      let backend: StorageBackend;

      switch (config.type) {
        case 'filesystem':
          backend = new FilesystemBackend(config);
          break;
        case 'graph':
          backend = new GraphBackend(config);
          break;
        default:
          return {
            success: false,
            error: {
              name: 'UnsupportedBackendError',
              message: `Unsupported backend type: ${(config as any).type}`,
              code: 'UNSUPPORTED_BACKEND',
              statusCode: 400,
              isOperational: true
            }
          };
      }

      return { success: true, data: backend };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'BackendCreationError',
          message: `Failed to create backend: ${error instanceof Error ? error.message : String(error)}`,
          code: 'BACKEND_CREATION_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  private async loadConfiguration(): Promise<Result<void>> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      this.config = yaml.load(configContent) as BackendConfig;
      
      // Validate configuration
      if (!this.config || !this.config.type) {
        throw new Error('Invalid configuration format');
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ConfigLoadError',
          message: `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
          code: 'CONFIG_LOAD_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  private async saveConfiguration(): Promise<void> {
    if (!this.config) return;

    // Ensure config directory exists
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    
    const configYaml = yaml.dump(this.config, { 
      indent: 2,
      lineWidth: 120,
      quotingType: '"'
    });
    
    await fs.writeFile(this.configPath, configYaml, 'utf-8');
  }

  private async createDefaultConfiguration(): Promise<void> {
    const defaultConfig: BackendConfig = {
      type: 'filesystem',
      filesystem: {
        root_path: path.join(process.cwd(), 'kb'),
        enable_versioning: false,
        enable_compression: false
      },
      graph: {
        connection: {
          host: 'localhost',
          port: 6380,
          database: 'kb_graph'
        },
        vector_dimensions: 1536,
        enable_temporal_queries: true,
        enable_semantic_search: true
      }
    };

    this.config = defaultConfig;
    await this.saveConfiguration();
  }
}