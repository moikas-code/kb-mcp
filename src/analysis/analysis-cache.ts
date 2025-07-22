/**
 * Analysis Result Caching System
 * High-performance caching for analysis results with intelligent invalidation
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';

export interface CacheOptions {
  maxMemoryEntries?: number;
  diskCacheDir?: string;
  enableDiskCache?: boolean;
  defaultTTL?: number;
  maxDiskSize?: number;
  compressionEnabled?: boolean;
  enableMetrics?: boolean;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  hash: string;
  metadata?: {
    fileSize?: number;
    fileModified?: number;
    analysisType?: string;
    version?: string;
  };
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  memoryUsage: number;
  diskUsage: number;
  hitRate: number;
  averageResponseTime: number;
}

export interface CacheKey {
  type: 'file' | 'project' | 'pattern' | 'debt' | 'nlq';
  identifier: string;
  options?: any;
  version?: string;
}

export class AnalysisCache {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private options: Required<CacheOptions>;
  private metrics: CacheMetrics;
  private diskCacheReady = false;

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxMemoryEntries: options.maxMemoryEntries || 1000,
      diskCacheDir: options.diskCacheDir || path.join(process.cwd(), '.cache', 'analysis'),
      enableDiskCache: options.enableDiskCache !== false,
      defaultTTL: options.defaultTTL || 3600000, // 1 hour
      maxDiskSize: options.maxDiskSize || 500 * 1024 * 1024, // 500MB
      compressionEnabled: options.compressionEnabled !== false,
      enableMetrics: options.enableMetrics !== false
    };

    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryUsage: 0,
      diskUsage: 0,
      hitRate: 0,
      averageResponseTime: 0
    };

    this.initializeDiskCache();
    this.setupCleanupInterval();
  }

  /**
   * Get cached analysis result
   */
  async get<T>(cacheKey: CacheKey): Promise<T | null> {
    const startTime = Date.now();
    const key = this.generateKey(cacheKey);

    try {
      // Check memory cache first
      const memoryResult = this.getFromMemory<T>(key);
      if (memoryResult !== null) {
        this.updateMetrics('hit', Date.now() - startTime);
        return memoryResult;
      }

      // Check disk cache if enabled
      if (this.options.enableDiskCache && this.diskCacheReady) {
        const diskResult = await this.getFromDisk<T>(key);
        if (diskResult !== null) {
          // Promote to memory cache
          await this.setInMemory(key, diskResult, this.options.defaultTTL);
          this.updateMetrics('hit', Date.now() - startTime);
          return diskResult;
        }
      }

      this.updateMetrics('miss', Date.now() - startTime);
      return null;

    } catch (error) {
      console.error('Cache get error:', error);
      this.updateMetrics('miss', Date.now() - startTime);
      return null;
    }
  }

  /**
   * Set analysis result in cache
   */
  async set<T>(cacheKey: CacheKey, value: T, ttl?: number): Promise<Result<void>> {
    try {
      const key = this.generateKey(cacheKey);
      const finalTTL = ttl || this.options.defaultTTL;

      // Set in memory cache
      await this.setInMemory(key, value, finalTTL, cacheKey);

      // Set in disk cache if enabled
      if (this.options.enableDiskCache && this.diskCacheReady) {
        await this.setOnDisk(key, value, finalTTL, cacheKey);
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'cache.set' }).message
      };
    }
  }

  /**
   * Check if cache entry exists and is valid
   */
  async has(cacheKey: CacheKey): Promise<boolean> {
    const key = this.generateKey(cacheKey);
    
    // Check memory
    if (this.hasInMemory(key)) {
      return true;
    }

    // Check disk
    if (this.options.enableDiskCache && this.diskCacheReady) {
      return await this.hasOnDisk(key);
    }

    return false;
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(cacheKey: CacheKey): Promise<Result<void>> {
    try {
      const key = this.generateKey(cacheKey);

      // Remove from memory
      this.memoryCache.delete(key);

      // Remove from disk
      if (this.options.enableDiskCache && this.diskCacheReady) {
        await this.removeFromDisk(key);
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'cache.invalidate' }).message
      };
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<Result<number>> {
    try {
      let invalidatedCount = 0;

      // Invalidate from memory
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);
          invalidatedCount++;
        }
      }

      // Invalidate from disk
      if (this.options.enableDiskCache && this.diskCacheReady) {
        const diskCount = await this.invalidateDiskPattern(pattern);
        invalidatedCount += diskCount;
      }

      return { success: true, data: invalidatedCount };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'cache.invalidatePattern' }).message
      };
    }
  }

  /**
   * Smart invalidation based on file changes
   */
  async invalidateByFileChange(filePath: string): Promise<Result<number>> {
    try {
      const stats = await fs.stat(filePath);
      const fileModified = stats.mtime.getTime();
      
      let invalidatedCount = 0;

      // Check memory cache
      for (const [key, entry] of this.memoryCache.entries()) {
        if (this.shouldInvalidateEntry(entry, filePath, fileModified)) {
          this.memoryCache.delete(key);
          invalidatedCount++;
        }
      }

      // Check disk cache
      if (this.options.enableDiskCache && this.diskCacheReady) {
        const diskCount = await this.invalidateDiskByFileChange(filePath, fileModified);
        invalidatedCount += diskCount;
      }

      return { success: true, data: invalidatedCount };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'cache.invalidateByFileChange' }).message
      };
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<Result<void>> {
    try {
      // Clear memory
      this.memoryCache.clear();

      // Clear disk
      if (this.options.enableDiskCache && this.diskCacheReady) {
        await this.clearDiskCache();
      }

      // Reset metrics
      this.metrics = {
        hits: 0,
        misses: 0,
        evictions: 0,
        memoryUsage: 0,
        diskUsage: 0,
        hitRate: 0,
        averageResponseTime: 0
      };

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'cache.clear' }).message
      };
    }
  }

  /**
   * Get cache statistics
   */
  getMetrics(): CacheMetrics {
    this.updateMemoryUsage();
    this.calculateHitRate();
    return { ...this.metrics };
  }

  /**
   * Optimize cache by removing least recently used entries
   */
  async optimize(): Promise<Result<number>> {
    try {
      let optimizedCount = 0;

      // Memory optimization - LRU eviction
      if (this.memoryCache.size > this.options.maxMemoryEntries) {
        const entries = Array.from(this.memoryCache.entries());
        entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        const toRemove = entries.slice(0, entries.length - this.options.maxMemoryEntries);
        for (const [key] of toRemove) {
          this.memoryCache.delete(key);
          optimizedCount++;
          this.metrics.evictions++;
        }
      }

      // Disk optimization
      if (this.options.enableDiskCache && this.diskCacheReady) {
        const diskOptimized = await this.optimizeDiskCache();
        optimizedCount += diskOptimized;
      }

      return { success: true, data: optimizedCount };

    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'cache.optimize' }).message
      };
    }
  }

  /**
   * Memory cache operations
   */
  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.memoryCache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.value;
  }

  private async setInMemory<T>(
    key: string, 
    value: T, 
    ttl: number, 
    cacheKey?: CacheKey
  ): Promise<void> {
    const size = this.calculateSize(value);
    const hash = this.generateHash(value);

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccessed: Date.now(),
      size,
      hash
    };

    // Add metadata if available
    if (cacheKey) {
      entry.metadata = {
        analysisType: cacheKey.type,
        version: cacheKey.version
      };

      // Add file metadata for file-based caches
      if (cacheKey.type === 'file' && typeof cacheKey.identifier === 'string') {
        try {
          const stats = await fs.stat(cacheKey.identifier);
          entry.metadata.fileSize = stats.size;
          entry.metadata.fileModified = stats.mtime.getTime();
        } catch (error) {
          // Ignore file stat errors
        }
      }
    }

    this.memoryCache.set(key, entry);

    // Check if we need to evict
    if (this.memoryCache.size > this.options.maxMemoryEntries) {
      await this.optimize();
    }
  }

  private hasInMemory(key: string): boolean {
    const entry = this.memoryCache.get(key);
    if (!entry) return false;

    // Check TTL
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.memoryCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Disk cache operations
   */
  private async initializeDiskCache(): Promise<void> {
    if (!this.options.enableDiskCache) return;

    try {
      await fs.mkdir(this.options.diskCacheDir, { recursive: true });
      this.diskCacheReady = true;
    } catch (error) {
      console.error('Failed to initialize disk cache:', error);
      this.diskCacheReady = false;
    }
  }

  private async getFromDisk<T>(key: string): Promise<T | null> {
    if (!this.diskCacheReady) return null;

    try {
      const filePath = this.getDiskCachePath(key);
      const data = await fs.readFile(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(data);

      // Check TTL
      if (Date.now() > entry.timestamp + entry.ttl) {
        await this.removeFromDisk(key);
        return null;
      }

      return entry.value;

    } catch (error) {
      return null;
    }
  }

  private async setOnDisk<T>(
    key: string, 
    value: T, 
    ttl: number, 
    cacheKey?: CacheKey
  ): Promise<void> {
    if (!this.diskCacheReady) return;

    try {
      const entry: CacheEntry<T> = {
        key,
        value,
        timestamp: Date.now(),
        ttl,
        accessCount: 1,
        lastAccessed: Date.now(),
        size: this.calculateSize(value),
        hash: this.generateHash(value)
      };

      if (cacheKey?.type === 'file' && typeof cacheKey.identifier === 'string') {
        try {
          const stats = await fs.stat(cacheKey.identifier);
          entry.metadata = {
            fileSize: stats.size,
            fileModified: stats.mtime.getTime(),
            analysisType: cacheKey.type,
            version: cacheKey.version
          };
        } catch (error) {
          // Ignore file stat errors
        }
      }

      const filePath = this.getDiskCachePath(key);
      await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');

    } catch (error) {
      console.error('Failed to write to disk cache:', error);
    }
  }

  private async hasOnDisk(key: string): Promise<boolean> {
    if (!this.diskCacheReady) return false;

    try {
      const filePath = this.getDiskCachePath(key);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async removeFromDisk(key: string): Promise<void> {
    if (!this.diskCacheReady) return;

    try {
      const filePath = this.getDiskCachePath(key);
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore removal errors
    }
  }

  /**
   * Helper methods
   */
  private generateKey(cacheKey: CacheKey): string {
    const keyData = {
      type: cacheKey.type,
      identifier: cacheKey.identifier,
      options: cacheKey.options,
      version: cacheKey.version
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex');
  }

  private generateHash<T>(value: T): string {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(value))
      .digest('hex');
  }

  private calculateSize<T>(value: T): number {
    return JSON.stringify(value).length;
  }

  private getDiskCachePath(key: string): string {
    return path.join(this.options.diskCacheDir, `${key}.json`);
  }

  private shouldInvalidateEntry(
    entry: CacheEntry<any>, 
    filePath: string, 
    fileModified: number
  ): boolean {
    if (!entry.metadata?.fileModified) return false;
    
    return entry.key.includes(filePath) && 
           entry.metadata.fileModified < fileModified;
  }

  private async invalidateDiskPattern(pattern: string): Promise<number> {
    let count = 0;

    try {
      const files = await fs.readdir(this.options.diskCacheDir);
      
      for (const file of files) {
        if (file.includes(pattern)) {
          await fs.unlink(path.join(this.options.diskCacheDir, file));
          count++;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return count;
  }

  private async invalidateDiskByFileChange(
    filePath: string, 
    fileModified: number
  ): Promise<number> {
    let count = 0;

    try {
      const files = await fs.readdir(this.options.diskCacheDir);
      
      for (const file of files) {
        try {
          const fullPath = path.join(this.options.diskCacheDir, file);
          const data = await fs.readFile(fullPath, 'utf-8');
          const entry = JSON.parse(data);
          
          if (this.shouldInvalidateEntry(entry, filePath, fileModified)) {
            await fs.unlink(fullPath);
            count++;
          }
        } catch (error) {
          // Ignore individual file errors
        }
      }
    } catch (error) {
      // Ignore directory read errors
    }

    return count;
  }

  private async clearDiskCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.options.diskCacheDir);
      
      await Promise.all(
        files.map(file => 
          fs.unlink(path.join(this.options.diskCacheDir, file))
        )
      );
    } catch (error) {
      // Ignore errors
    }
  }

  private async optimizeDiskCache(): Promise<number> {
    // Simple disk cache optimization - remove expired entries
    let count = 0;

    try {
      const files = await fs.readdir(this.options.diskCacheDir);
      const now = Date.now();
      
      for (const file of files) {
        try {
          const fullPath = path.join(this.options.diskCacheDir, file);
          const data = await fs.readFile(fullPath, 'utf-8');
          const entry = JSON.parse(data);
          
          if (now > entry.timestamp + entry.ttl) {
            await fs.unlink(fullPath);
            count++;
          }
        } catch (error) {
          // Remove corrupted cache files
          await fs.unlink(path.join(this.options.diskCacheDir, file));
          count++;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return count;
  }

  private updateMetrics(type: 'hit' | 'miss', responseTime: number): void {
    if (!this.options.enableMetrics) return;

    if (type === 'hit') {
      this.metrics.hits++;
    } else {
      this.metrics.misses++;
    }

    // Update average response time
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (total - 1) + responseTime) / total;
  }

  private updateMemoryUsage(): void {
    this.metrics.memoryUsage = Array.from(this.memoryCache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
  }

  private calculateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  private setupCleanupInterval(): void {
    // Clean up expired entries every 5 minutes
    setInterval(async () => {
      await this.optimize();
    }, 5 * 60 * 1000);
  }
}