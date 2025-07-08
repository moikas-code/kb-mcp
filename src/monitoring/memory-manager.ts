/**
 * Memory Management Service
 * Monitors memory usage and prevents memory leaks
 */

import { EventEmitter } from 'events';
import { Result } from '../types/index.js';
import winston from 'winston';
import { toKBError } from '../types/error-utils.js';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
  timestamp: Date;
}

interface MemoryThresholds {
  warning: number;   // Warning threshold (% of max heap)
  critical: number;  // Critical threshold (% of max heap)
  maxHeapSize: number; // Maximum heap size in bytes
}

interface MemoryAlert {
  level: 'warning' | 'critical';
  message: string;
  stats: MemoryStats;
  timestamp: Date;
}

/**
 * Memory manager with leak detection and cleanup
 */
export class MemoryManager extends EventEmitter {
  private logger: winston.Logger;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryHistory: MemoryStats[] = [];
  private thresholds: MemoryThresholds;
  private isMonitoring = false;
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  constructor(thresholds?: Partial<MemoryThresholds>) {
    super();
    
    this.thresholds = {
      warning: 80,
      critical: 90,
      maxHeapSize: 1024 * 1024 * 1024, // 1GB default
      ...thresholds,
    };

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      ],
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Start memory monitoring
   */
  start(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    this.logger.info('Memory monitoring started', {
      interval_ms: intervalMs,
      thresholds: this.thresholds,
    });
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    this.logger.info('Memory monitoring stopped');
  }

  /**
   * Register cleanup callback
   */
  registerCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Get current memory statistics
   */
  getCurrentStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      timestamp: new Date(),
    };
  }

  /**
   * Get memory usage trend
   */
  getTrend(timeWindowMs: number = 300000): {
    trend: 'increasing' | 'decreasing' | 'stable';
    changeRate: number;
    samples: number;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentHistory = this.memoryHistory.filter(
      stat => stat.timestamp.getTime() > cutoff
    );

    if (recentHistory.length < 2) {
      return {
        trend: 'stable',
        changeRate: 0,
        samples: recentHistory.length,
      };
    }

    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];
    const timeDiff = last.timestamp.getTime() - first.timestamp.getTime();
    const heapDiff = last.heapUsed - first.heapUsed;
    
    const changeRate = timeDiff > 0 ? (heapDiff / timeDiff) * 1000 : 0; // bytes per second
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(changeRate) < 1000) { // Less than 1KB/s
      trend = 'stable';
    } else if (changeRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      trend,
      changeRate,
      samples: recentHistory.length,
    };
  }

  /**
   * Detect potential memory leaks
   */
  detectLeaks(): {
    hasLeak: boolean;
    severity: 'low' | 'medium' | 'high';
    reasons: string[];
  } {
    const reasons: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    // Check for consistently increasing memory usage
    const trend = this.getTrend();
    if (trend.trend === 'increasing' && trend.changeRate > 10000) { // 10KB/s
      reasons.push(`Memory usage increasing at ${Math.round(trend.changeRate / 1000)}KB/s`);
      severity = 'medium';
    }

    // Check for high memory usage
    const currentStats = this.getCurrentStats();
    const heapUsagePercent = (currentStats.heapUsed / this.thresholds.maxHeapSize) * 100;
    
    if (heapUsagePercent > this.thresholds.critical) {
      reasons.push(`Heap usage critical: ${Math.round(heapUsagePercent)}%`);
      severity = 'high';
    } else if (heapUsagePercent > this.thresholds.warning) {
      reasons.push(`Heap usage high: ${Math.round(heapUsagePercent)}%`);
      if (severity === 'low') severity = 'medium';
    }

    // Check for external memory growth
    if (currentStats.external > 100 * 1024 * 1024) { // 100MB
      reasons.push(`External memory usage high: ${Math.round(currentStats.external / 1024 / 1024)}MB`);
      if (severity === 'low') severity = 'medium';
    }

    // Check for array buffer leaks
    if (currentStats.arrayBuffers > 50 * 1024 * 1024) { // 50MB
      reasons.push(`Array buffer usage high: ${Math.round(currentStats.arrayBuffers / 1024 / 1024)}MB`);
      if (severity === 'low') severity = 'medium';
    }

    return {
      hasLeak: reasons.length > 0,
      severity,
      reasons,
    };
  }

  /**
   * Force garbage collection and cleanup
   */
  async forceCleanup(): Promise<Result<void>> {
    try {
      this.logger.info('Starting forced memory cleanup');
      
      // Run registered cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          await callback();
        } catch (error) {
          this.logger.error('Cleanup callback failed', error);
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        this.logger.info('Forced garbage collection completed');
      } else {
        this.logger.warn('Garbage collection not available (run with --expose-gc)');
      }

      // Clear old memory history
      const cutoff = Date.now() - 3600000; // Keep 1 hour of history
      this.memoryHistory = this.memoryHistory.filter(
        stat => stat.timestamp.getTime() > cutoff
      );

      const statsAfter = this.getCurrentStats();
      this.logger.info('Memory cleanup completed', {
        heap_used_mb: Math.round(statsAfter.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(statsAfter.heapTotal / 1024 / 1024),
        external_mb: Math.round(statsAfter.external / 1024 / 1024),
      });

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Memory cleanup failed', error);
      return {
        success: false,
        error: toKBError(new Error(`Memory cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { operation: 'cleanup' }),
      };
    }
  }

  /**
   * Get memory usage report
   */
  getReport(): {
    current: MemoryStats;
    trend: ReturnType<typeof this.getTrend>;
    leakDetection: ReturnType<typeof this.detectLeaks>;
    thresholds: MemoryThresholds;
    historyCount: number;
  } {
    return {
      current: this.getCurrentStats(),
      trend: this.getTrend(),
      leakDetection: this.detectLeaks(),
      thresholds: this.thresholds,
      historyCount: this.memoryHistory.length,
    };
  }

  /**
   * Check memory usage and emit alerts
   */
  private checkMemoryUsage(): void {
    const stats = this.getCurrentStats();
    
    // Store in history
    this.memoryHistory.push(stats);
    
    // Keep only recent history (last 24 hours)
    const cutoff = Date.now() - 86400000;
    this.memoryHistory = this.memoryHistory.filter(
      stat => stat.timestamp.getTime() > cutoff
    );

    // Check thresholds
    const heapUsagePercent = (stats.heapUsed / this.thresholds.maxHeapSize) * 100;
    
    if (heapUsagePercent > this.thresholds.critical) {
      this.emitAlert('critical', `Heap usage critical: ${Math.round(heapUsagePercent)}%`, stats);
    } else if (heapUsagePercent > this.thresholds.warning) {
      this.emitAlert('warning', `Heap usage high: ${Math.round(heapUsagePercent)}%`, stats);
    }

    // Check for memory leaks
    const leakDetection = this.detectLeaks();
    if (leakDetection.hasLeak && leakDetection.severity === 'high') {
      this.emitAlert('critical', `Memory leak detected: ${leakDetection.reasons.join(', ')}`, stats);
    }

    // Log regular stats
    this.logger.debug('Memory usage check', {
      heap_used_mb: Math.round(stats.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(stats.heapTotal / 1024 / 1024),
      heap_usage_percent: Math.round(heapUsagePercent),
      external_mb: Math.round(stats.external / 1024 / 1024),
      rss_mb: Math.round(stats.rss / 1024 / 1024),
    });
  }

  /**
   * Emit memory alert
   */
  private emitAlert(level: 'warning' | 'critical', message: string, stats: MemoryStats): void {
    const alert: MemoryAlert = {
      level,
      message,
      stats,
      timestamp: new Date(),
    };

    this.logger[level === 'critical' ? 'error' : 'warn']('Memory alert', alert);
    this.emit('alert', alert);

    // Auto-cleanup on critical alerts
    if (level === 'critical') {
      this.forceCleanup().catch(error => {
        this.logger.error('Auto-cleanup failed', error);
      });
    }
  }

  /**
   * Shutdown memory manager
   */
  private async shutdown(): Promise<void> {
    this.logger.info('Shutting down memory manager');
    this.stop();
    
    // Run final cleanup
    await this.forceCleanup();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}