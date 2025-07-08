/**
 * Alert System
 * Monitors metrics and triggers alerts based on rules
 */

import { EventEmitter } from 'events';
import { AlertRule, MonitoringConfig } from '../types/index.js';
import { MetricsCollector } from './metrics.js';
import { HealthMonitor } from './health.js';

export interface Alert {
  id: string;
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  details: Record<string, any>;
  timestamp: string;
  resolved?: boolean;
  resolvedAt?: string;
}

export interface AlertChannel {
  name: string;
  type: 'pagerduty' | 'slack' | 'email' | 'webhook';
  send(alert: Alert): Promise<void>;
}

/**
 * Alert manager implementation
 */
export class AlertManager extends EventEmitter {
  private rules: AlertRule[];
  private channels: Map<string, AlertChannel>;
  private activeAlerts: Map<string, Alert>;
  private metricsCollector: MetricsCollector;
  private healthMonitor: HealthMonitor;
  private evaluationInterval?: NodeJS.Timer;
  private config: MonitoringConfig['alerts'];

  constructor(
    config: MonitoringConfig['alerts'],
    metricsCollector: MetricsCollector,
    healthMonitor: HealthMonitor
  ) {
    super();
    
    this.config = config;
    this.rules = config?.rules || [];
    this.channels = new Map();
    this.activeAlerts = new Map();
    this.metricsCollector = metricsCollector;
    this.healthMonitor = healthMonitor;
    
    // Initialize channels
    this.initializeChannels();
  }

  /**
   * Initialize alert channels
   */
  private initializeChannels(): void {
    if (!this.config?.channels) return;
    
    for (const channelType of this.config.channels) {
      switch (channelType) {
        case 'slack':
          this.channels.set('slack', new SlackChannel());
          break;
        case 'pagerduty':
          this.channels.set('pagerduty', new PagerDutyChannel());
          break;
        case 'email':
          this.channels.set('email', new EmailChannel());
          break;
        case 'webhook':
          this.channels.set('webhook', new WebhookChannel());
          break;
      }
    }
  }

  /**
   * Start alert evaluation
   */
  startEvaluation(intervalMs: number = 30000): void {
    if (this.evaluationInterval) return;
    
    this.evaluationInterval = setInterval(() => {
      this.evaluateRules();
    }, intervalMs);
    
    // Evaluate immediately
    this.evaluateRules();
  }

  /**
   * Stop alert evaluation
   */
  stopEvaluation(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = undefined;
    }
  }

  /**
   * Add alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleName: string): void {
    this.rules = this.rules.filter(r => r.name !== ruleName);
  }

  /**
   * Evaluate all rules
   */
  private async evaluateRules(): Promise<void> {
    for (const rule of this.rules) {
      try {
        await this.evaluateRule(rule);
      } catch (error) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(rule: AlertRule): Promise<void> {
    const alertKey = `${rule.name}:${rule.condition}`;
    const existingAlert = this.activeAlerts.get(alertKey);
    
    // Evaluate condition
    const triggered = await this.checkCondition(rule);
    
    if (triggered && !existingAlert) {
      // New alert
      const alert = await this.createAlert(rule);
      this.activeAlerts.set(alertKey, alert);
      await this.sendAlert(alert, rule.channels);
      this.emit('alert-triggered', alert);
      
    } else if (!triggered && existingAlert && !existingAlert.resolved) {
      // Alert resolved
      existingAlert.resolved = true;
      existingAlert.resolvedAt = new Date().toISOString();
      await this.sendResolution(existingAlert, rule.channels);
      this.emit('alert-resolved', existingAlert);
    }
  }

  /**
   * Check if rule condition is met
   */
  private async checkCondition(rule: AlertRule): Promise<boolean> {
    const metrics = await this.metricsCollector.getMetricsJSON();
    const health = this.healthMonitor.getHealth();
    
    // Parse condition and evaluate
    // This is a simplified implementation - in production, use a proper expression parser
    switch (rule.condition) {
      case 'cpu_high':
        return this.checkCPUCondition(rule.threshold, metrics);
      
      case 'memory_high':
        return this.checkMemoryCondition(rule.threshold, metrics);
      
      case 'error_rate_high':
        return this.checkErrorRateCondition(rule.threshold, metrics);
      
      case 'response_time_high':
        return this.checkResponseTimeCondition(rule.threshold, metrics);
      
      case 'health_unhealthy':
        return health.status === 'unhealthy';
      
      case 'auth_failures_high':
        return this.checkAuthFailuresCondition(rule.threshold, metrics);
      
      default:
        // Custom condition evaluation
        return this.evaluateCustomCondition(rule.condition, rule.threshold, metrics);
    }
  }

  /**
   * Check CPU condition
   */
  private checkCPUCondition(threshold: number, metrics: any): boolean {
    const cpuMetric = metrics.find((m: any) => m.name === 'kb_cpu_usage_percent');
    return cpuMetric && cpuMetric.metrics[0].value > threshold;
  }

  /**
   * Check memory condition
   */
  private checkMemoryCondition(threshold: number, metrics: any): boolean {
    const memMetrics = metrics.filter((m: any) => m.name === 'kb_memory_usage_bytes');
    if (memMetrics.length === 0) return false;
    
    const heapUsed = memMetrics.find((m: any) => m.metrics[0].labels.type === 'heap_used');
    const heapTotal = memMetrics.find((m: any) => m.metrics[0].labels.type === 'heap_total');
    
    if (heapUsed && heapTotal) {
      const usage = heapUsed.metrics[0].value / heapTotal.metrics[0].value;
      return usage > threshold;
    }
    
    return false;
  }

  /**
   * Check error rate condition
   */
  private checkErrorRateCondition(threshold: number, metrics: any): boolean {
    const errorMetric = metrics.find((m: any) => m.name === 'kb_errors_total');
    const opsMetric = metrics.find((m: any) => m.name === 'kb_operations_total');
    
    if (errorMetric && opsMetric) {
      const errors = errorMetric.metrics.reduce((sum: number, m: any) => sum + m.value, 0);
      const total = opsMetric.metrics.reduce((sum: number, m: any) => sum + m.value, 0);
      
      if (total > 0) {
        const errorRate = errors / total;
        return errorRate > threshold;
      }
    }
    
    return false;
  }

  /**
   * Check response time condition
   */
  private checkResponseTimeCondition(threshold: number, metrics: any): boolean {
    const latencyMetric = metrics.find((m: any) => m.name === 'kb_operation_duration_seconds');
    
    if (latencyMetric) {
      // Check 95th percentile
      const p95 = latencyMetric.metrics.find((m: any) => m.labels.quantile === '0.95');
      return p95 && p95.value * 1000 > threshold; // Convert to ms
    }
    
    return false;
  }

  /**
   * Check auth failures condition
   */
  private checkAuthFailuresCondition(threshold: number, metrics: any): boolean {
    const authFailures = metrics.find((m: any) => m.name === 'kb_auth_failures_total');
    
    if (authFailures) {
      const totalFailures = authFailures.metrics.reduce((sum: number, m: any) => sum + m.value, 0);
      return totalFailures > threshold;
    }
    
    return false;
  }

  /**
   * Evaluate custom condition
   */
  private evaluateCustomCondition(condition: string, threshold: number, metrics: any): boolean {
    // Simple expression evaluation
    // In production, use a proper expression parser with sandboxing
    try {
      // Extract metric name from condition
      const match = condition.match(/(\w+)\s*([><=]+)\s*(\d+)/);
      if (!match) return false;
      
      const [, metricName, operator, value] = match;
      const metric = metrics.find((m: any) => m.name === metricName);
      
      if (!metric) return false;
      
      const metricValue = metric.metrics[0].value;
      const compareValue = parseFloat(value);
      
      switch (operator) {
        case '>': return metricValue > compareValue;
        case '>=': return metricValue >= compareValue;
        case '<': return metricValue < compareValue;
        case '<=': return metricValue <= compareValue;
        case '==': return metricValue === compareValue;
        default: return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Create alert from rule
   */
  private async createAlert(rule: AlertRule): Promise<Alert> {
    const metrics = await this.metricsCollector.getMetricsJSON();
    
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      rule: rule.name,
      severity: rule.severity,
      message: `Alert: ${rule.name} - ${rule.condition} exceeded threshold ${rule.threshold}`,
      details: {
        condition: rule.condition,
        threshold: rule.threshold,
        duration: rule.duration,
        current_metrics: this.extractRelevantMetrics(rule.condition, metrics),
      },
      timestamp: new Date().toISOString(),
      resolved: false,
    };
  }

  /**
   * Extract relevant metrics for alert
   */
  private extractRelevantMetrics(condition: string, metrics: any): any {
    // Extract metrics related to the condition
    const relevant: Record<string, any> = {};
    
    if (condition.includes('cpu')) {
      const cpu = metrics.find((m: any) => m.name === 'kb_cpu_usage_percent');
      if (cpu) relevant.cpu_usage = cpu.metrics[0].value;
    }
    
    if (condition.includes('memory')) {
      const mem = metrics.filter((m: any) => m.name === 'kb_memory_usage_bytes');
      relevant.memory = {};
      mem.forEach((m: any) => {
        relevant.memory[m.metrics[0].labels.type] = m.metrics[0].value;
      });
    }
    
    if (condition.includes('error')) {
      const errors = metrics.find((m: any) => m.name === 'kb_errors_total');
      if (errors) relevant.error_count = errors.metrics.reduce((sum: number, m: any) => sum + m.value, 0);
    }
    
    return relevant;
  }

  /**
   * Send alert to channels
   */
  private async sendAlert(alert: Alert, channelNames: string[]): Promise<void> {
    const promises = channelNames.map(name => {
      const channel = this.channels.get(name);
      if (channel) {
        return channel.send(alert).catch(error => {
          console.error(`Failed to send alert to ${name}:`, error);
        });
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Send resolution notification
   */
  private async sendResolution(alert: Alert, channelNames: string[]): Promise<void> {
    const resolutionAlert = {
      ...alert,
      message: `Resolved: ${alert.message}`,
    };
    
    await this.sendAlert(resolutionAlert, channelNames);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): void {
    for (const [key, alert] of this.activeAlerts) {
      if (alert.id === alertId) {
        alert.acknowledged = true;
        alert.acknowledgedAt = new Date().toISOString();
        this.emit('alert-acknowledged', alert);
        break;
      }
    }
  }
}

/**
 * Slack channel implementation
 */
class SlackChannel implements AlertChannel {
  name = 'slack';
  type = 'slack' as const;
  
  async send(alert: Alert): Promise<void> {
    // In production, use actual Slack webhook
    console.log(`[SLACK] ${alert.severity.toUpperCase()}: ${alert.message}`);
  }
}

/**
 * PagerDuty channel implementation
 */
class PagerDutyChannel implements AlertChannel {
  name = 'pagerduty';
  type = 'pagerduty' as const;
  
  async send(alert: Alert): Promise<void> {
    // In production, use PagerDuty API
    console.log(`[PAGERDUTY] ${alert.severity.toUpperCase()}: ${alert.message}`);
  }
}

/**
 * Email channel implementation
 */
class EmailChannel implements AlertChannel {
  name = 'email';
  type = 'email' as const;
  
  async send(alert: Alert): Promise<void> {
    // In production, use email service
    console.log(`[EMAIL] ${alert.severity.toUpperCase()}: ${alert.message}`);
  }
}

/**
 * Webhook channel implementation
 */
class WebhookChannel implements AlertChannel {
  name = 'webhook';
  type = 'webhook' as const;
  
  async send(alert: Alert): Promise<void> {
    // In production, send HTTP POST to webhook URL
    console.log(`[WEBHOOK] ${alert.severity.toUpperCase()}: ${alert.message}`);
  }
}

// Extend Alert interface
declare module './alerts' {
  interface Alert {
    acknowledged?: boolean;
    acknowledgedAt?: string;
  }
}