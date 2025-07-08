/**
 * Metrics Collection System
 * Collects and exposes metrics for monitoring
 */

import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { EventEmitter } from 'events';
import { Metric } from '../types/index.js';

export interface MetricsConfig {
  enabled?: boolean;
  interval?: number;    // Collection interval in ms
  histogramBuckets?: number[];
  summaryPercentiles?: number[];
}

/**
 * Metrics collector implementation
 */
export class MetricsCollector extends EventEmitter {
  private config: Required<MetricsConfig>;
  private metrics: Map<string, any>;
  private collectionInterval?: NodeJS.Timer;
  
  // Core metrics
  private operationCounter: Counter;
  private operationDuration: Histogram;
  private errorCounter: Counter;
  private activeConnections: Gauge;
  private memoryUsage: Gauge;
  private cpuUsage: Gauge;
  
  // KB-specific metrics
  private kbFileCount: Gauge;
  private kbTotalSize: Gauge;
  private kbOperations: Counter;
  private kbSearchLatency: Summary;
  
  // Security metrics
  private authAttempts: Counter;
  private authFailures: Counter;
  private rateLimitHits: Counter;
  private auditEvents: Counter;

  constructor(config: MetricsConfig = {}) {
    super();
    
    this.config = {
      enabled: config.enabled ?? true,
      interval: config.interval ?? 60000, // 1 minute
      histogramBuckets: config.histogramBuckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      summaryPercentiles: config.summaryPercentiles ?? [0.5, 0.9, 0.95, 0.99],
    };
    
    this.metrics = new Map();
    
    // Initialize metrics
    this.initializeMetrics();
  }

  /**
   * Initialize all metrics
   */
  private initializeMetrics(): void {
    // Clear existing metrics
    register.clear();
    
    // Operation metrics
    this.operationCounter = new Counter({
      name: 'kb_operations_total',
      help: 'Total number of operations',
      labelNames: ['operation', 'status'],
    });
    
    this.operationDuration = new Histogram({
      name: 'kb_operation_duration_seconds',
      help: 'Operation duration in seconds',
      labelNames: ['operation'],
      buckets: this.config.histogramBuckets,
    });
    
    this.errorCounter = new Counter({
      name: 'kb_errors_total',
      help: 'Total number of errors',
      labelNames: ['operation', 'error_type'],
    });
    
    // System metrics
    this.activeConnections = new Gauge({
      name: 'kb_active_connections',
      help: 'Number of active connections',
    });
    
    this.memoryUsage = new Gauge({
      name: 'kb_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
    });
    
    this.cpuUsage = new Gauge({
      name: 'kb_cpu_usage_percent',
      help: 'CPU usage percentage',
    });
    
    // KB-specific metrics
    this.kbFileCount = new Gauge({
      name: 'kb_file_count',
      help: 'Total number of files in KB',
      labelNames: ['category'],
    });
    
    this.kbTotalSize = new Gauge({
      name: 'kb_total_size_bytes',
      help: 'Total size of KB in bytes',
    });
    
    this.kbOperations = new Counter({
      name: 'kb_file_operations_total',
      help: 'Total number of file operations',
      labelNames: ['operation', 'category'],
    });
    
    this.kbSearchLatency = new Summary({
      name: 'kb_search_latency_seconds',
      help: 'Search operation latency',
      percentiles: this.config.summaryPercentiles,
    });
    
    // Security metrics
    this.authAttempts = new Counter({
      name: 'kb_auth_attempts_total',
      help: 'Total authentication attempts',
      labelNames: ['method', 'result'],
    });
    
    this.authFailures = new Counter({
      name: 'kb_auth_failures_total',
      help: 'Total authentication failures',
      labelNames: ['method', 'reason'],
    });
    
    this.rateLimitHits = new Counter({
      name: 'kb_rate_limit_hits_total',
      help: 'Total rate limit hits',
      labelNames: ['resource'],
    });
    
    this.auditEvents = new Counter({
      name: 'kb_audit_events_total',
      help: 'Total audit events',
      labelNames: ['event_type', 'result'],
    });
  }

  /**
   * Initialize metrics collection
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    // Collect initial metrics
    await this.collectSystemMetrics();
  }

  /**
   * Start collecting metrics
   */
  startCollection(): void {
    if (!this.config.enabled || this.collectionInterval) {
      return;
    }
    
    // Collect metrics periodically
    this.collectionInterval = setInterval(async () => {
      await this.collectSystemMetrics();
      this.emit('metrics-collected');
    }, this.config.interval);
    
    // Collect immediately
    this.collectSystemMetrics();
  }

  /**
   * Stop collecting metrics
   */
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
  }

  /**
   * Record an operation
   */
  recordOperation(
    operation: string,
    status: 'success' | 'error',
    durationMs?: number
  ): void {
    this.operationCounter.labels(operation, status).inc();
    
    if (durationMs !== undefined) {
      this.operationDuration.labels(operation).observe(durationMs / 1000);
    }
    
    // Emit event for real-time monitoring
    this.emit('operation', { operation, status, durationMs });
  }

  /**
   * Record an error
   */
  recordError(operation: string, errorType: string): void {
    this.errorCounter.labels(operation, errorType).inc();
    this.emit('error', { operation, errorType });
  }

  /**
   * Record authentication attempt
   */
  recordAuthAttempt(method: string, success: boolean, reason?: string): void {
    this.authAttempts.labels(method, success ? 'success' : 'failure').inc();
    
    if (!success && reason) {
      this.authFailures.labels(method, reason).inc();
    }
    
    this.emit('auth-attempt', { method, success, reason });
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(resource: string): void {
    this.rateLimitHits.labels(resource).inc();
    this.emit('rate-limit', { resource });
  }

  /**
   * Record audit event
   */
  recordAuditEvent(eventType: string, result: string): void {
    this.auditEvents.labels(eventType, result).inc();
  }

  /**
   * Update KB statistics
   */
  updateKBStats(stats: {
    fileCount: Record<string, number>;
    totalSize: number;
  }): void {
    // Update file counts by category
    for (const [category, count] of Object.entries(stats.fileCount)) {
      this.kbFileCount.labels(category).set(count);
    }
    
    // Update total size
    this.kbTotalSize.set(stats.totalSize);
  }

  /**
   * Record KB operation
   */
  recordKBOperation(operation: string, category: string): void {
    this.kbOperations.labels(operation, category).inc();
  }

  /**
   * Record search latency
   */
  recordSearchLatency(latencyMs: number): void {
    this.kbSearchLatency.observe(latencyMs / 1000);
  }

  /**
   * Update active connections
   */
  updateActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }

  /**
   * Get Prometheus metrics
   */
  getPrometheusMetrics(): string {
    return register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON(): Promise<any> {
    const metrics = await register.getMetricsAsJSON();
    
    // Add custom metrics
    return {
      ...metrics,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      custom: Object.fromEntries(this.metrics),
    };
  }

  /**
   * Get specific metric
   */
  getMetric(name: string): Metric | undefined {
    const metric = this.metrics.get(name);
    if (!metric) return undefined;
    
    return {
      name,
      type: metric.type,
      value: metric.value,
      labels: metric.labels || {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Set custom metric
   */
  setCustomMetric(
    name: string,
    value: number,
    type: 'counter' | 'gauge' = 'gauge',
    labels: Record<string, string> = {}
  ): void {
    this.metrics.set(name, {
      type,
      value,
      labels,
      timestamp: Date.now(),
    });
    
    this.emit('custom-metric', { name, value, type, labels });
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.memoryUsage.labels('rss').set(memUsage.rss);
    this.memoryUsage.labels('heap_total').set(memUsage.heapTotal);
    this.memoryUsage.labels('heap_used').set(memUsage.heapUsed);
    this.memoryUsage.labels('external').set(memUsage.external);
    
    // CPU usage
    const cpuUsage = process.cpuUsage();
    const totalCpu = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpu / 1000000) / process.uptime() * 100;
    this.cpuUsage.set(cpuPercent);
    
    // Custom system metrics
    this.setCustomMetric('nodejs_version', parseFloat(process.version.slice(1)), 'gauge');
    this.setCustomMetric('process_uptime_seconds', process.uptime(), 'gauge');
    
    // Event loop lag (if available)
    if (global.gc) {
      try {
        const start = process.hrtime.bigint();
        setImmediate(() => {
          const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
          this.setCustomMetric('event_loop_lag_ms', lag, 'gauge');
        });
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Export metrics for external systems
   */
  async exportMetrics(format: 'prometheus' | 'json' = 'prometheus'): Promise<string> {
    if (format === 'json') {
      const metrics = await this.getMetricsJSON();
      return JSON.stringify(metrics, null, 2);
    }
    
    return this.getPrometheusMetrics();
  }
}

// Singleton instance
let metricsCollector: MetricsCollector | null = null;

/**
 * Get or create metrics collector instance
 */
export function getMetricsCollector(config?: MetricsConfig): MetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector(config);
  }
  return metricsCollector;
}