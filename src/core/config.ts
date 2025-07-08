/**
 * Configuration Management
 * Handles loading, validation, and merging of configuration files
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import Joi from 'joi';
import { KBConfig, Result } from '../types/index.js';
import { EncryptionService } from './security.js';

// Configuration schema
const configSchema = Joi.object<KBConfig>({
  security: Joi.object({
    encryption: Joi.object({
      algorithm: Joi.string().valid('AES-256-GCM', 'AES-256-CBC').default('AES-256-GCM'),
      key_rotation_days: Joi.number().min(1).max(365).default(90),
      key_derivation: Joi.string().valid('PBKDF2', 'scrypt', 'argon2').default('PBKDF2'),
      key: Joi.string().optional(),
    }),
    authentication: Joi.object({
      providers: Joi.array().items(
        Joi.string().valid('jwt', 'oauth2', 'saml', 'api_key')
      ).default(['jwt']),
      mfa_required: Joi.boolean().default(false),
      session_timeout: Joi.number().min(300).default(3600),
      max_sessions_per_user: Joi.number().min(1).default(5),
    }),
    authorization: Joi.object({
      model: Joi.string().valid('rbac', 'abac', 'pbac').default('rbac'),
      cache_ttl: Joi.number().min(0).default(300),
    }),
    rate_limiting: Joi.object({
      enabled: Joi.boolean().default(true),
      max_requests_per_minute: Joi.number().min(1).default(100),
      max_requests_per_hour: Joi.number().min(1).default(1000),
    }),
  }),
  compliance: Joi.object({
    audit: Joi.object({
      enabled: Joi.boolean().default(true),
      retention_days: Joi.number().min(90).default(548), // 18 months
      destinations: Joi.array().items(
        Joi.string().valid('file', 'siem', 's3', 'database')
      ).default(['file']),
      encryption_required: Joi.boolean().default(true),
    }),
    gdpr: Joi.object({
      pii_detection: Joi.boolean().default(true),
      anonymization_delay: Joi.string().default('24h'),
      right_to_erasure: Joi.boolean().default(true),
      data_portability: Joi.boolean().default(true),
    }),
    data_classification: Joi.object({
      enabled: Joi.boolean().default(true),
      levels: Joi.array().items(Joi.string()).default(['public', 'internal', 'confidential', 'restricted']),
      default_level: Joi.string().default('internal'),
    }),
  }),
  storage: Joi.object({
    path: Joi.string().default(path.join(process.cwd(), 'kb')),
    primary: Joi.string().valid('filesystem', 's3', 'gcs', 'azure').default('filesystem'),
    backup: Joi.string().valid('filesystem', 's3', 'gcs', 'azure', 'none').default('filesystem'),
    encryption_at_rest: Joi.boolean().default(false),
    versioning: Joi.boolean().default(true),
    compression: Joi.boolean().default(false),
    replication: Joi.object({
      enabled: Joi.boolean().default(false),
      regions: Joi.array().items(Joi.string()).default([]),
    }),
  }),
  monitoring: Joi.object({
    metrics: Joi.object({
      enabled: Joi.boolean().default(true),
      provider: Joi.string().valid('prometheus', 'cloudwatch', 'datadog').default('prometheus'),
      interval: Joi.number().min(10).default(60),
    }),
    tracing: Joi.object({
      enabled: Joi.boolean().default(false),
      provider: Joi.string().valid('opentelemetry', 'jaeger', 'zipkin').default('opentelemetry'),
      sampling_rate: Joi.number().min(0).max(1).default(0.1),
    }),
    logging: Joi.object({
      level: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
      format: Joi.string().valid('json', 'text').default('json'),
      destinations: Joi.array().items(Joi.string()).default(['stdout', 'file']),
    }),
    alerts: Joi.object({
      enabled: Joi.boolean().default(false),
      channels: Joi.array().items(
        Joi.string().valid('pagerduty', 'slack', 'email', 'webhook')
      ).default([]),
      rules: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        condition: Joi.string().required(),
        threshold: Joi.number().required(),
        duration: Joi.string().required(),
        severity: Joi.string().valid('critical', 'high', 'medium', 'low').required(),
        channels: Joi.array().items(Joi.string()).required(),
      })).default([]),
    }),
  }),
}).default();

/**
 * Configuration manager implementation
 */
export class ConfigManager {
  private config: KBConfig;
  private configPath?: string;
  private globalConfigPath: string;
  private encryptedFields: Set<string>;

  constructor() {
    // Default configuration
    this.config = {} as KBConfig;
    
    // Global config location
    this.globalConfigPath = path.join(os.homedir(), '.kb-manager', 'config.yaml');
    
    // Fields that should be encrypted
    this.encryptedFields = new Set([
      'security.encryption.key',
      'storage.s3.access_key_secret',
      'storage.gcs.private_key',
      'monitoring.alerts.webhook_secrets',
    ]);
  }

  /**
   * Load configuration from file
   */
  async load(configPath?: string): Promise<Result<KBConfig>> {
    try {
      this.configPath = configPath;
      
      // Start with default configuration
      let config: Partial<KBConfig> = {};
      
      // Load global config if exists
      if (await this.fileExists(this.globalConfigPath)) {
        const globalConfig = await this.loadFile(this.globalConfigPath);
        config = this.mergeConfigs(config, globalConfig);
      }
      
      // Load project config if specified
      if (configPath && await this.fileExists(configPath)) {
        const projectConfig = await this.loadFile(configPath);
        config = this.mergeConfigs(config, projectConfig);
      }
      
      // Load environment variables
      config = this.mergeConfigs(config, this.loadFromEnv());
      
      // Validate configuration
      const validation = configSchema.validate(config);
      if (validation.error) {
        return {
          success: false,
          error: {
            name: 'ValidationError',
            message: `Invalid configuration: ${validation.error.message}`,
            code: 'INVALID_CONFIG',
            statusCode: 400,
            isOperational: true,
          }
        };
      }
      
      this.config = validation.value;
      
      // Decrypt encrypted fields
      await this.decryptFields();
      
      return { success: true, data: this.config };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ConfigError',
          message: `Failed to load configuration: ${error}`,
          code: 'CONFIG_LOAD_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Save configuration to file
   */
  async save(configPath?: string): Promise<Result<void>> {
    try {
      const savePath = configPath || this.configPath || '.kbconfig.yaml';
      
      // Encrypt sensitive fields before saving
      const configToSave = await this.encryptFields(this.config);
      
      // Convert to YAML
      const yamlContent = yaml.dump(configToSave, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(path.resolve(savePath)), { recursive: true });
      
      // Write file with restricted permissions
      await fs.writeFile(savePath, yamlContent, { mode: 0o600 });
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ConfigError',
          message: `Failed to save configuration: ${error}`,
          code: 'CONFIG_SAVE_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): KBConfig {
    return { ...this.config };
  }

  /**
   * Get a specific configuration value
   */
  get<T = any>(path: string): T | undefined {
    const parts = path.split('.');
    let value: any = this.config;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value as T;
  }

  /**
   * Set a configuration value
   */
  set(path: string, value: any): void {
    const parts = path.split('.');
    let target: any = this.config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in target) || typeof target[part] !== 'object') {
        target[part] = {};
      }
      target = target[part];
    }
    
    target[parts[parts.length - 1]] = value;
  }

  /**
   * Validate configuration
   */
  validate(): Result<void> {
    const validation = configSchema.validate(this.config);
    
    if (validation.error) {
      return {
        success: false,
        error: {
          name: 'ValidationError',
          message: `Invalid configuration: ${validation.error.message}`,
          code: 'INVALID_CONFIG',
          statusCode: 400,
          isOperational: true,
        }
      };
    }
    
    return { success: true, data: undefined };
  }

  /**
   * Get configuration templates
   */
  getTemplates(): Record<string, Partial<KBConfig>> {
    return {
      basic: {
        security: {
          authentication: {
            providers: ['jwt'],
            mfa_required: false,
          },
          rate_limiting: {
            enabled: true,
            max_requests_per_minute: 100,
          },
        },
        compliance: {
          audit: {
            enabled: false,
          },
        },
        storage: {
          encryption_at_rest: false,
          versioning: true,
        },
      },
      enterprise: {
        security: {
          encryption: {
            algorithm: 'AES-256-GCM',
            key_rotation_days: 30,
          },
          authentication: {
            providers: ['jwt', 'saml', 'api_key'],
            mfa_required: true,
            session_timeout: 1800,
          },
          rate_limiting: {
            enabled: true,
            max_requests_per_minute: 1000,
            max_requests_per_hour: 10000,
          },
        },
        compliance: {
          audit: {
            enabled: true,
            retention_days: 2555, // 7 years
            destinations: ['file', 'siem', 's3'],
            encryption_required: true,
          },
          gdpr: {
            pii_detection: true,
            anonymization_delay: '24h',
            right_to_erasure: true,
            data_portability: true,
          },
        },
        storage: {
          primary: 's3',
          backup: 's3',
          encryption_at_rest: true,
          versioning: true,
          compression: true,
          replication: {
            enabled: true,
            regions: ['us-east-1', 'eu-west-1'],
          },
        },
        monitoring: {
          metrics: {
            enabled: true,
            provider: 'cloudwatch',
            interval: 60,
          },
          tracing: {
            enabled: true,
            provider: 'opentelemetry',
            sampling_rate: 0.1,
          },
          alerts: {
            enabled: true,
            channels: ['pagerduty', 'slack'],
          },
        },
      },
    };
  }

  // Private helper methods

  private async loadFile(filePath: string): Promise<any> {
    const content = await fs.readFile(filePath, 'utf8');
    
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      return yaml.load(content);
    } else if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    } else {
      throw new Error(`Unsupported config format: ${path.extname(filePath)}`);
    }
  }

  private loadFromEnv(): Partial<KBConfig> {
    const config: any = {};
    
    // Map environment variables to config paths
    const envMappings: Record<string, string> = {
      'KB_ENCRYPTION_KEY': 'security.encryption.key',
      'KB_MFA_REQUIRED': 'security.authentication.mfa_required',
      'KB_AUDIT_ENABLED': 'compliance.audit.enabled',
      'KB_STORAGE_PATH': 'storage.path',
      'KB_LOG_LEVEL': 'monitoring.logging.level',
    };
    
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setValueByPath(config, configPath, this.parseEnvValue(value));
      }
    }
    
    return config;
  }

  private parseEnvValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Not JSON, return as string
      return value;
    }
  }

  private setValueByPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let target = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in target)) {
        target[part] = {};
      }
      target = target[part];
    }
    
    target[parts[parts.length - 1]] = value;
  }

  private mergeConfigs(base: any, override: any): any {
    const merged = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  private async decryptFields(): Promise<void> {
    for (const fieldPath of this.encryptedFields) {
      const value = this.get<string>(fieldPath);
      if (value && value.startsWith('enc:')) {
        try {
          const encrypted = JSON.parse(Buffer.from(value.slice(4), 'base64').toString());
          const decrypted = await EncryptionService.decrypt(
            encrypted,
            this.getConfigKey()
          );
          this.set(fieldPath, decrypted);
        } catch {
          // Failed to decrypt, leave as is
        }
      }
    }
  }

  private async encryptFields(config: any): Promise<any> {
    const configCopy = JSON.parse(JSON.stringify(config));
    
    for (const fieldPath of this.encryptedFields) {
      const value = this.getValueByPath(configCopy, fieldPath);
      if (value && !value.startsWith('enc:')) {
        try {
          const encrypted = await EncryptionService.encrypt(
            value,
            this.getConfigKey(),
            fieldPath
          );
          const encoded = Buffer.from(JSON.stringify(encrypted)).toString('base64');
          this.setValueByPath(configCopy, fieldPath, `enc:${encoded}`);
        } catch {
          // Failed to encrypt, leave as is
        }
      }
    }
    
    return configCopy;
  }

  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getConfigKey(): string {
    // In production, use HSM or key management service
    return process.env.KB_CONFIG_KEY || 'config-encryption-key';
  }
}