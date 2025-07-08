/**
 * SOC2-Compliant Audit Logging System
 * Provides tamper-proof audit trail with encryption and retention policies
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { 
  AuditEvent, 
  SecurityContext, 
  ComplianceConfig,
  Result
} from '@types/index.js';
import { EncryptionService } from './security.js';

// Audit log format version
const AUDIT_LOG_VERSION = '1.0';

// Default retention periods (in days)
const DEFAULT_RETENTION_PERIODS = {
  auth: 548,          // 18 months
  authz: 365,         // 12 months
  data_access: 365,   // 12 months
  config_change: 2555, // 7 years
  security: 730,      // 24 months
  error: 180,         // 6 months
};

/**
 * Audit logger implementation
 */
export class AuditLogger {
  private logger: winston.Logger;
  private config: ComplianceConfig;
  private auditPath: string;
  private encryptionKey?: string;
  private hashChain: string = '0';  // Genesis hash
  
  constructor(
    config: ComplianceConfig,
    auditPath: string,
    encryptionKey?: string
  ) {
    this.config = config;
    this.auditPath = auditPath;
    this.encryptionKey = encryptionKey;
    
    // Initialize Winston logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: this.createTransports(),
    });
  }

  /**
   * Create Winston transports based on configuration
   */
  private createTransports(): winston.transport[] {
    const transports: winston.transport[] = [];
    
    // Always include file transport for audit logs
    transports.push(
      new winston.transports.File({
        filename: path.join(this.auditPath, 'audit.log'),
        maxsize: 100 * 1024 * 1024, // 100MB
        maxFiles: 10,
        tailable: true,
      })
    );
    
    // Add additional transports based on config
    if (this.config.audit.destinations.includes('siem')) {
      // In production, would add SIEM transport
      transports.push(
        new winston.transports.File({
          filename: path.join(this.auditPath, 'siem-export.log'),
        })
      );
    }
    
    return transports;
  }

  /**
   * Log an audit event
   */
  async log(
    event: Partial<AuditEvent>,
    context?: SecurityContext
  ): Promise<Result<void>> {
    try {
      // Create complete audit event
      const auditEvent = await this.createAuditEvent(event, context);
      
      // Validate event
      const validation = this.validateAuditEvent(auditEvent);
      if (!validation.success) {
        return validation;
      }
      
      // Add integrity hash
      auditEvent.metadata = {
        ...auditEvent.metadata,
        integrity_hash: await this.calculateIntegrityHash(auditEvent),
        previous_hash: this.hashChain,
        version: AUDIT_LOG_VERSION,
      };
      
      // Update hash chain
      this.hashChain = auditEvent.metadata.integrity_hash;
      
      // Encrypt if required
      const logData = this.config.audit.encryption_required && this.encryptionKey
        ? await this.encryptAuditEvent(auditEvent)
        : auditEvent;
      
      // Log the event
      this.logger.info('audit_event', logData);
      
      // Check for alerts
      await this.checkAlertConditions(auditEvent);
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'AuditError',
          message: `Failed to log audit event: ${error}`,
          code: 'AUDIT_LOG_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Create a complete audit event
   */
  private async createAuditEvent(
    event: Partial<AuditEvent>,
    context?: SecurityContext
  ): Promise<AuditEvent> {
    const now = new Date().toISOString();
    
    return {
      event_id: event.event_id || uuidv4(),
      timestamp: event.timestamp || now,
      event_type: event.event_type || 'data_access',
      action: event.action || 'unknown',
      resource: event.resource || 'unknown',
      result: event.result || 'success',
      user_id: context?.user_id || event.user_id,
      session_id: context?.session_id || event.session_id,
      ip_address: context?.ip_address || event.ip_address,
      user_agent: context?.user_agent || event.user_agent,
      severity: event.severity,
      metadata: {
        ...event.metadata,
        correlation_id: this.getCorrelationId(),
      },
      trace_id: event.trace_id || this.getTraceId(),
      span_id: event.span_id || this.getSpanId(),
      pii_fields: event.pii_fields || this.detectPIIFields(event),
    };
  }

  /**
   * Validate audit event
   */
  private validateAuditEvent(event: AuditEvent): Result<void> {
    const requiredFields = ['event_id', 'timestamp', 'event_type', 'action', 'resource', 'result'];
    
    for (const field of requiredFields) {
      if (!event[field as keyof AuditEvent]) {
        return {
          success: false,
          error: {
            name: 'ValidationError',
            message: `Missing required field: ${field}`,
            code: 'MISSING_FIELD',
            statusCode: 400,
            isOperational: true,
          }
        };
      }
    }
    
    // Validate timestamp format
    if (!this.isValidISO8601(event.timestamp)) {
      return {
        success: false,
        error: {
          name: 'ValidationError',
          message: 'Invalid timestamp format',
          code: 'INVALID_TIMESTAMP',
          statusCode: 400,
          isOperational: true,
        }
      };
    }
    
    return { success: true, data: undefined };
  }

  /**
   * Calculate integrity hash for audit event
   */
  private async calculateIntegrityHash(event: AuditEvent): Promise<string> {
    const data = JSON.stringify({
      event_id: event.event_id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      action: event.action,
      resource: event.resource,
      result: event.result,
      previous_hash: this.hashChain,
    });
    
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Encrypt audit event
   */
  private async encryptAuditEvent(event: AuditEvent): Promise<any> {
    if (!this.encryptionKey) {
      return event;
    }
    
    // Separate PII fields for special handling
    const piiData: Record<string, any> = {};
    const nonPiiData: Record<string, any> = { ...event };
    
    if (event.pii_fields) {
      for (const field of event.pii_fields) {
        if (field in event) {
          piiData[field] = event[field as keyof AuditEvent];
          delete nonPiiData[field as keyof AuditEvent];
        }
      }
    }
    
    // Encrypt PII data separately
    if (Object.keys(piiData).length > 0) {
      const encrypted = await EncryptionService.encrypt(
        JSON.stringify(piiData),
        this.encryptionKey,
        'audit-pii'
      );
      nonPiiData.encrypted_pii = encrypted;
    }
    
    return nonPiiData;
  }

  /**
   * Check if audit event triggers any alerts
   */
  private async checkAlertConditions(event: AuditEvent): Promise<void> {
    // Check for security alerts
    if (event.event_type === 'security' && event.severity === 'critical') {
      await this.triggerAlert('Critical security event', event);
    }
    
    // Check for failed authentication attempts
    if (event.event_type === 'auth' && event.result === 'failure') {
      await this.checkFailedAuthAttempts(event);
    }
    
    // Check for privilege escalation
    if (event.action === 'privilege_escalation') {
      await this.triggerAlert('Privilege escalation attempt', event);
    }
    
    // Check for configuration changes
    if (event.event_type === 'config_change') {
      await this.triggerAlert('Configuration change detected', event);
    }
  }

  /**
   * Check for repeated failed authentication attempts
   */
  private async checkFailedAuthAttempts(event: AuditEvent): Promise<void> {
    // In production, would query recent events and check threshold
    // For now, simplified implementation
    const key = `auth_failures:${event.ip_address || event.user_id}`;
    // Would check Redis or similar for count
    // If count > 5 in 5 minutes, trigger alert
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(message: string, event: AuditEvent): Promise<void> {
    // In production, would send to configured alert channels
    console.error(`AUDIT ALERT: ${message}`, {
      event_id: event.event_id,
      event_type: event.event_type,
      action: event.action,
      severity: event.severity,
    });
  }

  /**
   * Query audit logs
   */
  async query(
    filters: AuditQueryFilters,
    options?: AuditQueryOptions
  ): Promise<Result<AuditEvent[]>> {
    try {
      // In production, would query from appropriate storage
      // For now, read from file
      const logFile = path.join(this.auditPath, 'audit.log');
      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.trim().split('\n');
      
      const events: AuditEvent[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (this.matchesFilters(parsed, filters)) {
            events.push(parsed);
          }
        } catch {
          // Skip malformed lines
        }
      }
      
      // Apply sorting and pagination
      const sorted = this.sortEvents(events, options?.sort);
      const paginated = this.paginateEvents(sorted, options);
      
      return { success: true, data: paginated };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'QueryError',
          message: `Failed to query audit logs: ${error}`,
          code: 'QUERY_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Export audit logs for compliance
   */
  async export(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<Result<string>> {
    const filters: AuditQueryFilters = {
      timestamp_start: startDate.toISOString(),
      timestamp_end: endDate.toISOString(),
    };
    
    const result = await this.query(filters);
    if (!result.success) {
      return result;
    }
    
    if (format === 'csv') {
      return { success: true, data: this.eventsToCSV(result.data) };
    }
    
    return { success: true, data: JSON.stringify(result.data, null, 2) };
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(): Promise<Result<number>> {
    try {
      let deletedCount = 0;
      
      // For each event type, check retention period
      for (const [eventType, retentionDays] of Object.entries(DEFAULT_RETENTION_PERIODS)) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        // In production, would delete from appropriate storage
        // For now, just count what would be deleted
        const result = await this.query({
          event_type: eventType as AuditEvent['event_type'],
          timestamp_end: cutoffDate.toISOString(),
        });
        
        if (result.success) {
          deletedCount += result.data.length;
        }
      }
      
      return { success: true, data: deletedCount };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'CleanupError',
          message: `Failed to cleanup old logs: ${error}`,
          code: 'CLEANUP_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(
    startDate?: Date,
    endDate?: Date
  ): Promise<Result<IntegrityReport>> {
    try {
      const filters: AuditQueryFilters = {};
      if (startDate) filters.timestamp_start = startDate.toISOString();
      if (endDate) filters.timestamp_end = endDate.toISOString();
      
      const result = await this.query(filters, { sort: 'timestamp_asc' });
      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }
      
      let validCount = 0;
      let invalidCount = 0;
      let previousHash = '0';
      const issues: string[] = [];
      
      for (const event of result.data) {
        if (!event.metadata?.integrity_hash) {
          invalidCount++;
          issues.push(`Event ${event.event_id} missing integrity hash`);
          continue;
        }
        
        if (event.metadata.previous_hash !== previousHash) {
          invalidCount++;
          issues.push(`Event ${event.event_id} hash chain broken`);
          continue;
        }
        
        // Recalculate hash and verify
        const expectedHash = await this.calculateIntegrityHash(event);
        if (event.metadata.integrity_hash !== expectedHash) {
          invalidCount++;
          issues.push(`Event ${event.event_id} integrity hash mismatch`);
          continue;
        }
        
        validCount++;
        previousHash = event.metadata.integrity_hash;
      }
      
      return {
        success: true,
        data: {
          total_events: result.data.length,
          valid_events: validCount,
          invalid_events: invalidCount,
          integrity_valid: invalidCount === 0,
          issues,
          checked_at: new Date().toISOString(),
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'IntegrityError',
          message: `Failed to verify integrity: ${error}`,
          code: 'INTEGRITY_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  // Helper methods

  private isValidISO8601(timestamp: string): boolean {
    const date = new Date(timestamp);
    return date.toISOString() === timestamp;
  }

  private detectPIIFields(event: Partial<AuditEvent>): string[] {
    const piiFields: string[] = [];
    
    if (event.user_id) piiFields.push('user_id');
    if (event.ip_address) piiFields.push('ip_address');
    if (event.user_agent) piiFields.push('user_agent');
    
    return piiFields;
  }

  private getCorrelationId(): string {
    // In production, would get from request context
    return uuidv4();
  }

  private getTraceId(): string {
    // In production, would get from OpenTelemetry
    return uuidv4();
  }

  private getSpanId(): string {
    // In production, would get from OpenTelemetry
    return uuidv4();
  }

  private matchesFilters(event: any, filters: AuditQueryFilters): boolean {
    if (filters.event_type && event.event_type !== filters.event_type) {
      return false;
    }
    
    if (filters.user_id && event.user_id !== filters.user_id) {
      return false;
    }
    
    if (filters.resource && !event.resource.includes(filters.resource)) {
      return false;
    }
    
    if (filters.timestamp_start && event.timestamp < filters.timestamp_start) {
      return false;
    }
    
    if (filters.timestamp_end && event.timestamp > filters.timestamp_end) {
      return false;
    }
    
    return true;
  }

  private sortEvents(
    events: AuditEvent[],
    sort?: 'timestamp_asc' | 'timestamp_desc'
  ): AuditEvent[] {
    if (!sort || sort === 'timestamp_desc') {
      return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    
    return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private paginateEvents(
    events: AuditEvent[],
    options?: AuditQueryOptions
  ): AuditEvent[] {
    const limit = options?.limit || 1000;
    const offset = options?.offset || 0;
    
    return events.slice(offset, offset + limit);
  }

  private eventsToCSV(events: AuditEvent[]): string {
    if (events.length === 0) {
      return '';
    }
    
    const headers = [
      'event_id',
      'timestamp',
      'event_type',
      'action',
      'resource',
      'result',
      'user_id',
      'session_id',
      'ip_address',
      'severity',
    ];
    
    const rows = [headers.join(',')];
    
    for (const event of events) {
      const row = headers.map(header => {
        const value = event[header as keyof AuditEvent];
        return value ? `"${String(value).replace(/"/g, '""')}"` : '';
      });
      rows.push(row.join(','));
    }
    
    return rows.join('\n');
  }
}

// Type definitions for audit queries

interface AuditQueryFilters {
  event_type?: AuditEvent['event_type'];
  user_id?: string;
  resource?: string;
  timestamp_start?: string;
  timestamp_end?: string;
  result?: AuditEvent['result'];
  severity?: AuditEvent['severity'];
}

interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  sort?: 'timestamp_asc' | 'timestamp_desc';
}

interface IntegrityReport {
  total_events: number;
  valid_events: number;
  invalid_events: number;
  integrity_valid: boolean;
  issues: string[];
  checked_at: string;
}