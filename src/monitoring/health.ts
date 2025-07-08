/**
 * Health Check System
 * Monitors system health and provides health check endpoints
 */

import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { SecureKBManager } from '@core/secure-kb-manager.js';
import { AuditLogger } from '@core/audit.js';
import { HealthStatus, HealthCheck } from '@types/index.js';

export interface HealthCheckOptions {
  checkInterval?: number;  // ms between checks
  timeout?: number;        // ms before check times out
  thresholds?: {
    cpu?: number;          // CPU usage threshold (0-1)
    memory?: number;       // Memory usage threshold (0-1)
    disk?: number;         // Disk usage threshold (0-1)
    responseTime?: number; // Response time threshold (ms)
  };
}

/**
 * Health monitoring implementation
 */
export class HealthMonitor {
  private kbManager?: SecureKBManager;
  private auditLogger?: AuditLogger;
  private options: Required<HealthCheckOptions>;
  private lastCheck?: HealthStatus;
  private checkInterval?: NodeJS.Timer;
  private startTime: number;
  private isReady: boolean = false;

  constructor(options: HealthCheckOptions = {}) {
    this.options = {
      checkInterval: options.checkInterval || 30000, // 30 seconds
      timeout: options.timeout || 5000,              // 5 seconds
      thresholds: {
        cpu: options.thresholds?.cpu || 0.8,
        memory: options.thresholds?.memory || 0.85,
        disk: options.thresholds?.disk || 0.9,
        responseTime: options.thresholds?.responseTime || 1000,
      },
    };
    this.startTime = Date.now();
  }

  /**
   * Initialize health monitor
   */
  async initialize(
    kbManager: SecureKBManager,
    auditLogger: AuditLogger
  ): Promise<void> {
    this.kbManager = kbManager;
    this.auditLogger = auditLogger;
    
    // Run initial health check
    await this.performHealthCheck();
    this.isReady = true;
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    this.checkInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Get current health status
   */
  getHealth(): HealthStatus {
    if (!this.lastCheck) {
      return {
        status: 'unhealthy',
        version: '1.0.0',
        uptime: 0,
        checks: [],
      };
    }
    return this.lastCheck;
  }

  /**
   * Check if system is ready
   */
  isReady(): boolean {
    return this.isReady && this.lastCheck?.status !== 'unhealthy';
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    const checks: HealthCheck[] = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // System checks
    checks.push(await this.checkCPU());
    checks.push(await this.checkMemory());
    checks.push(await this.checkDisk());
    
    // Application checks
    if (this.kbManager) {
      checks.push(await this.checkKBAccess());
    }
    
    if (this.auditLogger) {
      checks.push(await this.checkAuditLog());
    }
    
    // External dependencies
    checks.push(await this.checkEncryption());
    
    // Determine overall status
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warnChecks = checks.filter(c => c.status === 'warn');
    
    if (failedChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (warnChecks.length > 0) {
      overallStatus = 'degraded';
    }
    
    // Update status
    this.lastCheck = {
      status: overallStatus,
      version: '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  /**
   * Check CPU usage
   */
  private async checkCPU(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      const cpus = os.cpus();
      const loads = os.loadavg();
      
      // Calculate average CPU usage
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times];
        }
        totalIdle += cpu.times.idle;
      });
      
      const avgUsage = 1 - (totalIdle / totalTick);
      const loadAvg = loads[0] / cpus.length;
      
      const status = loadAvg > this.options.thresholds.cpu ? 'warn' : 'pass';
      
      return {
        name: 'cpu',
        status,
        duration_ms: Date.now() - start,
        message: `CPU usage: ${(avgUsage * 100).toFixed(1)}%, Load: ${loadAvg.toFixed(2)}`,
        metadata: {
          usage: avgUsage,
          load_1m: loads[0],
          load_5m: loads[1],
          load_15m: loads[2],
          cores: cpus.length,
        },
      };
    } catch (error) {
      return {
        name: 'cpu',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: `CPU check failed: ${error}`,
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usage = usedMem / totalMem;
      
      const status = usage > this.options.thresholds.memory ? 'warn' : 'pass';
      
      return {
        name: 'memory',
        status,
        duration_ms: Date.now() - start,
        message: `Memory usage: ${(usage * 100).toFixed(1)}% (${formatBytes(usedMem)} / ${formatBytes(totalMem)})`,
        metadata: {
          total_bytes: totalMem,
          free_bytes: freeMem,
          used_bytes: usedMem,
          usage_percent: usage * 100,
        },
      };
    } catch (error) {
      return {
        name: 'memory',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: `Memory check failed: ${error}`,
      };
    }
  }

  /**
   * Check disk usage
   */
  private async checkDisk(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // Get disk usage for KB directory
      const kbPath = this.kbManager ? await this.getKBPath() : process.cwd();
      const stats = await fs.statfs(kbPath);
      
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      const used = total - free;
      const usage = used / total;
      
      const status = usage > this.options.thresholds.disk ? 'warn' : 'pass';
      
      return {
        name: 'disk',
        status,
        duration_ms: Date.now() - start,
        message: `Disk usage: ${(usage * 100).toFixed(1)}% (${formatBytes(used)} / ${formatBytes(total)})`,
        metadata: {
          path: kbPath,
          total_bytes: total,
          free_bytes: free,
          used_bytes: used,
          usage_percent: usage * 100,
        },
      };
    } catch (error) {
      return {
        name: 'disk',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: `Disk check failed: ${error}`,
      };
    }
  }

  /**
   * Check KB access
   */
  private async checkKBAccess(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // Try to list root directory
      const testContext = {
        user_id: 'health-check',
        session_id: 'health-check',
        ip_address: '127.0.0.1',
        user_agent: 'health-monitor',
        permissions: ['kb.read'],
        mfa_verified: false,
      };
      
      const result = await this.kbManager!.listDirectory('', testContext);
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      const duration = Date.now() - start;
      const status = duration > this.options.thresholds.responseTime ? 'warn' : 'pass';
      
      return {
        name: 'kb_access',
        status,
        duration_ms: duration,
        message: `KB accessible, response time: ${duration}ms`,
        metadata: {
          file_count: result.data.files.length,
          directory_count: result.data.subdirectories.length,
        },
      };
    } catch (error) {
      return {
        name: 'kb_access',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: `KB access check failed: ${error}`,
      };
    }
  }

  /**
   * Check audit log integrity
   */
  private async checkAuditLog(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // Verify recent audit logs
      const result = await this.auditLogger!.verifyIntegrity(
        new Date(Date.now() - 3600000), // Last hour
        new Date()
      );
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      const status = result.data.integrity_valid ? 'pass' : 'fail';
      
      return {
        name: 'audit_log',
        status,
        duration_ms: Date.now() - start,
        message: `Audit log ${status === 'pass' ? 'integrity verified' : 'integrity compromised'}`,
        metadata: {
          events_checked: result.data.total_events,
          valid_events: result.data.valid_events,
          invalid_events: result.data.invalid_events,
        },
      };
    } catch (error) {
      return {
        name: 'audit_log',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: `Audit log check failed: ${error}`,
      };
    }
  }

  /**
   * Check encryption availability
   */
  private async checkEncryption(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // Test encryption functionality
      const crypto = await import('crypto');
      const testData = 'health-check-test';
      
      // Test encryption
      const cipher = crypto.createCipher('aes-256-gcm', 'test-key');
      cipher.update(testData, 'utf8');
      cipher.final();
      
      return {
        name: 'encryption',
        status: 'pass',
        duration_ms: Date.now() - start,
        message: 'Encryption available and functional',
        metadata: {
          algorithms: crypto.getCiphers().length,
        },
      };
    } catch (error) {
      return {
        name: 'encryption',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: `Encryption check failed: ${error}`,
      };
    }
  }

  /**
   * Get KB path
   */
  private async getKBPath(): Promise<string> {
    // This is a placeholder - in real implementation, get from KBManager
    return path.join(process.cwd(), 'kb');
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Add missing methods to SecureKBManager
declare module '@core/secure-kb-manager.js' {
  interface SecureKBManager {
    listDirectory(path: string, context: any): Promise<any>;
  }
}

// Add verifyIntegrity to AuditLogger
declare module '@core/audit.js' {
  interface AuditLogger {
    verifyIntegrity(startDate?: Date, endDate?: Date): Promise<any>;
  }
}