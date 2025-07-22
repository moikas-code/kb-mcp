/**
 * MCP Server Middleware
 * Rate limiting and security middleware
 */

import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { SecurityContext } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";

// Rate limiter instances
const rateLimiters = new Map<string, RateLimiterMemory>();

/**
 * Simple authentication middleware
 * For production use, implement proper authentication
 */
export function authMiddleware(secret?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // If no secret configured, allow all requests
    if (!secret) {
      req.context = {
        user_id: "anonymous",
        session_id: uuidv4(),
        permissions: ["read", "write"],
        ip_address: req.ip || "unknown",
        user_agent: req.headers["user-agent"] || "unknown",
        mfa_verified: false,
      };
      return next();
    }

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    const token = authHeader.substring(7);
    if (token !== secret) {
      return res.status(403).json({
        error: "Invalid authentication token",
        code: "FORBIDDEN",
      });
    }

    // Set context for authenticated request
    req.context = {
      user_id: "authenticated",
      session_id: uuidv4(),
      permissions: ["read", "write", "delete", "admin"],
      ip_address: req.ip || "unknown",
      user_agent: req.headers["user-agent"] || "unknown",
      mfa_verified: false,
    };

    next();
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(
  options: {
    maxRequests?: number;
    windowMs?: number;
    keyGenerator?: (req: Request) => string;
  } = {},
) {
  const {
    maxRequests = 100,
    windowMs = 60000, // 1 minute
    keyGenerator = (req) => req.ip || "unknown",
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);

    // Get or create rate limiter for this endpoint
    const endpoint = `${req.method}:${req.path}`;
    if (!rateLimiters.has(endpoint)) {
      rateLimiters.set(
        endpoint,
        new RateLimiterMemory({
          points: maxRequests,
          duration: Math.floor(windowMs / 1000), // Convert to seconds
        }),
      );
    }

    const rateLimiter = rateLimiters.get(endpoint)!;

    try {
      const rateLimitInfo = await rateLimiter.consume(key);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader(
        "X-RateLimit-Remaining",
        rateLimitInfo.remainingPoints.toString(),
      );
      res.setHeader(
        "X-RateLimit-Reset",
        new Date(Date.now() + rateLimitInfo.msBeforeNext).toISOString(),
      );

      next();
    } catch (error: any) {
      // Rate limit exceeded
      res.setHeader(
        "Retry-After",
        Math.round(error.msBeforeNext / 1000).toString(),
      );
      res.status(429).json({
        error: "Rate limit exceeded",
        code: "RATE_LIMIT_EXCEEDED",
        retry_after: Math.round(error.msBeforeNext / 1000),
      });
    }
  };
}

/**
 * Security headers middleware
 */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Remove server header
    res.removeHeader("X-Powered-By");

    next();
  };
}

/**
 * Request ID middleware
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    req.id = (req.headers["x-request-id"] as string) || uuidv4();
    res.setHeader("X-Request-ID", req.id);
    next();
  };
}

/**
 * Request logging middleware
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`,
      );
    });

    next();
  };
}

/**
 * Error handling middleware
 */
export function errorHandler() {
  return (err: any, req: Request, res: Response, _next: NextFunction) => {
    // Log error
    console.error(
      `[${new Date().toISOString()}] Error in ${req.method} ${req.path}:`,
      err,
    );

    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    // Send error response
    res.status(statusCode).json({
      error: err.message || "Internal server error",
      code: err.code || "INTERNAL_ERROR",
      request_id: req.id,
    });
  };
}

/**
 * Request validation middleware
 */
export function validateRequest(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validation = schema.validate(req.body);

    if (validation.error) {
      res.status(400).json({
        error: "Invalid request",
        code: "VALIDATION_ERROR",
        details: validation.error.details.map((d: any) => ({
          field: d.path.join("."),
          message: d.message,
        })),
      });
      return;
    }

    req.body = validation.value;
    next();
  };
}

/**
 * CORS middleware for cross-origin requests
 */
export function corsMiddleware(allowedOrigins: string[] = ["*"]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (
      allowedOrigins.includes("*") ||
      (origin && allowedOrigins.includes(origin))
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Request-ID",
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }

    next();
  };
}

/**
 * Compression middleware wrapper
 */
export function compressionMiddleware() {
  // Dynamic import for compression middleware - fallback to no-op if not available
  try {
    const compression = (globalThis as any).require?.("compression");
    if (!compression) {
      return (req: any, res: any, next: any) => next();
    }
    return compression({
      level: 6,
      threshold: 1024,
      filter: (req: Request, res: Response) => {
        if (req.headers["x-no-compression"]) {
          return false;
        }
        return compression.filter?.(req, res) ?? true;
      },
    });
  } catch {
    return (req: any, res: any, next: any) => next();
  }
}

/**
 * Health check middleware
 */
export function healthCheck(path = "/health") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === path) {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
      return;
    }
    next();
  };
}

/**
 * Not found handler
 */
export function notFoundHandler() {
  return (req: Request, res: Response) => {
    res.status(404).json({
      error: "Resource not found",
      code: "NOT_FOUND",
      path: req.path,
      method: req.method,
    });
  };
}

/**
 * Timeout middleware
 */
export function timeoutMiddleware(ms = 30000) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      res.status(503).json({
        error: "Request timeout",
        code: "TIMEOUT",
        timeout_ms: ms,
      });
    }, ms);

    res.on("finish", () => {
      clearTimeout(timeout);
    });

    next();
  };
}

// Type augmentation for Express using module declaration
declare module "express-serve-static-core" {
  interface Request {
    context?: SecurityContext;
    id?: string;
  }
}
