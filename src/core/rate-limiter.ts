import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { SecurityContext } from "../types/index.js";

export interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
  execEvenly?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingPoints?: number;
  msBeforeNext?: number;
  totalHits?: number;
}

export class RateLimiter {
  private limiters: Map<string, RateLimiterMemory | RateLimiterRedis> =
    new Map();
  private defaultConfig: RateLimitConfig = {
    points: 100,
    duration: 60,
    blockDuration: 60,
    execEvenly: true,
  };

  constructor(private redisClient?: any) {}

  createLimiter(key: string, config: Partial<RateLimitConfig> = {}): void {
    const finalConfig = { ...this.defaultConfig, ...config };

    const limiter = this.redisClient
      ? new RateLimiterRedis({
          storeClient: this.redisClient,
          keyPrefix: `rate_limit_${key}`,
          points: finalConfig.points,
          duration: finalConfig.duration,
          blockDuration: finalConfig.blockDuration,
          execEvenly: finalConfig.execEvenly,
        })
      : new RateLimiterMemory({
          keyPrefix: `rate_limit_${key}`,
          points: finalConfig.points,
          duration: finalConfig.duration,
          blockDuration: finalConfig.blockDuration,
          execEvenly: finalConfig.execEvenly,
        });

    this.limiters.set(key, limiter);
  }

  async checkLimit(
    key: string,
    identifier: string,
    points: number = 1,
  ): Promise<RateLimitResult> {
    const limiter = this.limiters.get(key);
    if (!limiter) {
      throw new Error(`Rate limiter '${key}' not found`);
    }

    try {
      const result = await limiter.consume(identifier, points);
      return {
        allowed: true,
        remainingPoints: result.remainingPoints,
        msBeforeNext: result.msBeforeNext,
        totalHits: (result as any).totalHits,
      };
    } catch (rejRes: any) {
      return {
        allowed: false,
        remainingPoints: rejRes.remainingPoints || 0,
        msBeforeNext: rejRes.msBeforeNext || 0,
        totalHits: rejRes.totalHits || 0,
      };
    }
  }

  async checkUserLimit(
    context: SecurityContext,
    operation: string,
    points: number = 1,
  ): Promise<RateLimitResult> {
    const identifier = context.user_id || context.session_id || "anonymous";
    return this.checkLimit(`user_${operation}`, identifier, points);
  }

  async checkIPLimit(
    ipAddress: string,
    operation: string,
    points: number = 1,
  ): Promise<RateLimitResult> {
    return this.checkLimit(`ip_${operation}`, ipAddress, points);
  }

  async reset(key: string, identifier: string): Promise<void> {
    const limiter = this.limiters.get(key);
    if (limiter) {
      await limiter.delete(identifier);
    }
  }

  async getStatus(key: string, identifier: string): Promise<any> {
    const limiter = this.limiters.get(key);
    if (!limiter) {
      return null;
    }
    return limiter.get(identifier);
  }

  // Predefined rate limiters for common operations
  setupDefaultLimiters(): void {
    // Authentication attempts
    this.createLimiter("auth_login", {
      points: 5,
      duration: 300, // 5 minutes
      blockDuration: 900, // 15 minutes
    });

    // API requests per user
    this.createLimiter("api_user", {
      points: 1000,
      duration: 3600, // 1 hour
      blockDuration: 3600,
    });

    // Search operations
    this.createLimiter("search", {
      points: 100,
      duration: 60, // 1 minute
      blockDuration: 60,
    });

    // File operations
    this.createLimiter("file_ops", {
      points: 50,
      duration: 60,
      blockDuration: 120,
    });

    // IP-based general limit
    this.createLimiter("ip_general", {
      points: 200,
      duration: 60,
      blockDuration: 300,
    });
  }
}

export default RateLimiter;
