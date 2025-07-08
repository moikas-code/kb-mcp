/**
 * MCP Server Middleware
 * Authentication, rate limiting, and security middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { AuthManager } from '@cli/auth.js';
import { SecurityContext } from '@types/index.js';
import { v4 as uuidv4 } from 'uuid';

// Rate limiter instances
const rateLimiters = new Map<string, RateLimiterMemory>();

/**
 * Authentication middleware
 */
export function authMiddleware(
  authManager: AuthManager,
  strictMode: boolean = false
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        if (strictMode) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }
        // In non-strict mode, allow anonymous access with limited permissions
        req.context = createAnonymousContext(req);
        return next();
      }
      
      // Validate token format
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Invalid authorization format',
          code: 'INVALID_AUTH_FORMAT',
        });
      }
      
      const token = authHeader.substring(7);
      
      // Check for API key
      if (token.startsWith('kb_')) {
        const result = await authManager.authenticateApiKey(token);
        if (!result.success) {
          return res.status(401).json({
            error: result.error.message,
            code: result.error.code,
          });
        }
        req.context = result.data.context;
        return next();
      }
      
      // Verify JWT token
      try {
        const session = await authManager.verifyToken(token);
        if (!session || session.expired) {
          return res.status(401).json({
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
          });
        }
        
        req.context = session.context;
        next();
      } catch (error) {
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      }
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
      });
    }
  };
}

/**
 * Security middleware
 */
export function securityMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Add request ID for tracing
    req.id = req.headers['x-request-id'] as string || uuidv4();
    res.setHeader('X-Request-ID', req.id);
    
    // Log request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.id}`);
    
    next();
  };
}

/**
 * Rate limiting middleware factory
 */
export function rateLimitMiddleware(
  resource: string,
  maxRequests: number = 100,
  windowMs: number = 60000
) {
  // Create or get rate limiter for resource
  if (!rateLimiters.has(resource)) {
    rateLimiters.set(resource, new RateLimiterMemory({
      points: maxRequests,
      duration: windowMs / 1000, // Convert to seconds
      keyPrefix: resource,
    }));
  }
  
  const rateLimiter = rateLimiters.get(resource)!;
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use user ID or IP as key
      const key = req.context?.user_id || req.ip || 'anonymous';
      
      await rateLimiter.consume(key);
      
      // Add rate limit headers
      const rateLimitInfo = await rateLimiter.get(key);
      if (rateLimitInfo) {
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remainingPoints.toString());
        res.setHeader('X-RateLimit-Reset', new Date(rateLimitInfo.msBeforeNext).toISOString());
      }
      
      next();
    } catch (error) {
      // Rate limit exceeded
      res.setHeader('Retry-After', Math.round(error.msBeforeNext / 1000).toString());
      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retry_after: Math.round(error.msBeforeNext / 1000),
      });
    }
  };
}

/**
 * Error handling middleware
 */
export function errorHandler() {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    // Log error
    console.error(`[${new Date().toISOString()}] Error in ${req.method} ${req.path}:`, err);
    
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;
    
    // Create error response
    const errorResponse: any = {
      error: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR',
      request_id: req.id,
    };
    
    // Add details in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = err.stack;
      errorResponse.details = err;
    }
    
    res.status(statusCode).json(errorResponse);
  };
}

/**
 * Request validation middleware
 */
export function validateRequest(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const validation = schema.validate(req.body);
    
    if (validation.error) {
      return res.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: validation.error.details.map((d: any) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }
    
    req.body = validation.value;
    next();
  };
}

/**
 * CORS middleware for cross-origin requests
 */
export function corsMiddleware(allowedOrigins: string[] = ['*']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  };
}

/**
 * Compression middleware wrapper
 */
export function compressionMiddleware() {
  const compression = require('compression');
  return compression({
    filter: (req: Request, res: Response) => {
      // Don't compress responses with this request header
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use compression filter function
      return compression.filter(req, res);
    },
    level: 6, // Balance between speed and compression
  });
}

/**
 * Request logging middleware
 */
export function loggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        request_id: req.id,
        user_id: req.context?.user_id,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      };
      
      // Use structured logging
      console.log(JSON.stringify(logEntry));
    });
    
    next();
  };
}

/**
 * Create anonymous security context
 */
function createAnonymousContext(req: Request): SecurityContext {
  return {
    user_id: 'anonymous',
    session_id: uuidv4(),
    ip_address: req.ip || 'unknown',
    user_agent: req.headers['user-agent'] || 'unknown',
    permissions: ['kb.read'], // Read-only access
    mfa_verified: false,
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      context?: SecurityContext;
      id?: string;
    }
  }
}

// Add verifyToken method to AuthManager
declare module '@cli/auth.js' {
  interface AuthManager {
    verifyToken(token: string): Promise<any>;
  }
}