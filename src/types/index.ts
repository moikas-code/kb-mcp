/**
 * Core type definitions for KB Manager
 * SOC2 Compliant - Includes audit and security types
 */

// Re-export existing types
export * from './types.js';

// Security types
export interface SecurityContext {
  user_id: string;
  session_id: string;
  ip_address: string;
  user_agent: string;
  permissions: string[];
  mfa_verified: boolean;
}

// Audit event types (SOC2 compliant)
export interface AuditEvent {
  event_id: string;           // UUID v4
  timestamp: string;          // ISO 8601 UTC
  event_type: 'auth' | 'authz' | 'data_access' | 'config_change' | 'error' | 'security';
  user_id?: string;           // Encrypted after retention period
  session_id?: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'error';
  ip_address?: string;        // Anonymized for GDPR
  user_agent?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  metadata?: Record<string, any>;
  trace_id?: string;          // Distributed tracing
  span_id?: string;
  pii_fields?: string[];      // Fields containing PII
}

// Configuration types
export interface KBConfig {
  security: SecurityConfig;
  compliance: ComplianceConfig;
  storage: StorageConfig;
  monitoring: MonitoringConfig;
  updates?: {
    enabled?: boolean;
    channel?: string;
    checkInterval?: number;
    autoDownload?: boolean;
    autoInstall?: boolean;
  };
}

export interface SecurityConfig {
  encryption: {
    algorithm: 'AES-256-GCM' | 'AES-256-CBC';
    key_rotation_days: number;
    key_derivation: 'PBKDF2' | 'scrypt' | 'argon2';
    key?: string; // Optional encryption key
  };
  authentication: {
    providers: ('jwt' | 'oauth2' | 'saml' | 'api_key')[];
    mfa_required: boolean;
    session_timeout: number;
    max_sessions_per_user: number;
  };
  authorization: {
    model: 'rbac' | 'abac' | 'pbac';
    cache_ttl: number;
  };
  rate_limiting: {
    enabled: boolean;
    max_requests_per_minute: number;
    max_requests_per_hour: number;
  };
}

export interface ComplianceConfig {
  audit: {
    enabled: boolean;
    retention_days: number;
    destinations: ('file' | 'siem' | 's3' | 'database')[];
    encryption_required: boolean;
  };
  gdpr: {
    pii_detection: boolean;
    anonymization_delay: string;
    right_to_erasure: boolean;
    data_portability: boolean;
  };
  data_classification: {
    enabled: boolean;
    levels: string[];
    default_level: string;
  };
}

export interface StorageConfig {
  primary: 'filesystem' | 's3' | 'gcs' | 'azure' | 'graph';
  backup: 'filesystem' | 's3' | 'gcs' | 'azure' | 'none';
  encryption_at_rest: boolean;
  versioning: boolean;
  compression: boolean;
  replication: {
    enabled: boolean;
    regions: string[];
  };
  // Additional properties used in init command
  backend?: string;
  path?: string;
}

export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    provider: 'prometheus' | 'cloudwatch' | 'datadog';
    interval: number;
  };
  tracing: {
    enabled: boolean;
    provider: 'opentelemetry' | 'jaeger' | 'zipkin';
    sampling_rate: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    destinations: string[];
  };
  alerts: {
    enabled: boolean;
    channels: ('pagerduty' | 'slack' | 'email' | 'webhook')[];
    rules: AlertRule[];
  };
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  duration: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  channels: string[];
}

// Enhanced error types
export interface KBError extends Error {
  code: string;
  statusCode: number;
  context?: Record<string, any>;
  isOperational: boolean;
}

// Operation result type for better error handling
export type Result<T, E = KBError> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Permission types
export interface Permission {
  resource: string;
  actions: string[];
  conditions?: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  priority: number;
}

// Encryption types
export interface EncryptedData {
  algorithm: string;
  iv: string;
  salt: string;
  auth_tag?: string;
  ciphertext: string;
  key_id: string;
  timestamp: string;
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration_ms: number;
  message?: string;
  metadata?: Record<string, any>;
}

// Metrics types
export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

// Cache types
export interface CacheEntry<T> {
  key: string;
  value: T;
  ttl: number;
  created_at: string;
  accessed_at: string;
  access_count: number;
}