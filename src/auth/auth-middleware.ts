/**
 * Authentication Middleware for KB-MCP
 * Provides OAuth2 token validation and user context for MCP requests
 */

import { OAuth2Provider, User } from './oauth2-provider.js';
import { Result } from '../types/index.js';
import winston from 'winston';

export interface AuthContext {
  user: User;
  token: string;
  permissions: string[];
  roles: string[];
}

export interface AuthMiddlewareOptions {
  oauth2Provider: OAuth2Provider;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  allowAnonymous?: boolean;
  anonymousPermissions?: string[];
}

export class AuthMiddleware {
  private oauth2Provider: OAuth2Provider;
  private logger: winston.Logger;

  constructor(oauth2Provider: OAuth2Provider) {
    this.oauth2Provider = oauth2Provider;
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  /**
   * Validate token and extract user context
   */
  async validateToken(token: string): Promise<Result<AuthContext>> {
    try {
      const tokenResult = await this.oauth2Provider.verifyToken(token);
      
      if (!tokenResult.success) {
        return {
          success: false,
          error: {
            name: 'AuthenticationError',
            message: 'Invalid token',
            code: 'INVALID_TOKEN',
            statusCode: 401,
            isOperational: true
          }
        };
      }

      const payload = tokenResult.data;
      
      // Create user object from token payload
      const user: User = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        avatar: undefined,
        provider: 'oauth2',
        providerUserId: payload.sub,
        roles: payload.roles,
        permissions: payload.permissions,
        createdAt: '',
        lastLoginAt: new Date().toISOString(),
        active: true
      };

      const authContext: AuthContext = {
        user,
        token,
        permissions: payload.permissions,
        roles: payload.roles
      };

      return { success: true, data: authContext };
    } catch (error) {
      this.logger.error('Token validation error:', error);
      return {
        success: false,
        error: {
          name: 'AuthenticationError',
          message: 'Token validation failed',
          code: 'TOKEN_VALIDATION_FAILED',
          statusCode: 401,
          isOperational: true
        }
      };
    }
  }

  /**
   * Check if user has required permissions
   */
  hasPermission(authContext: AuthContext, requiredPermissions: string[]): boolean {
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    return requiredPermissions.every(permission => 
      authContext.permissions.includes(permission) || 
      authContext.roles.includes('admin')
    );
  }

  /**
   * Check if user has required roles
   */
  hasRole(authContext: AuthContext, requiredRoles: string[]): boolean {
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    return requiredRoles.some(role => 
      authContext.roles.includes(role) || 
      authContext.roles.includes('admin')
    );
  }

  /**
   * Authorize MCP request based on tool and arguments
   */
  async authorizeRequest(
    authContext: AuthContext | null,
    toolName: string,
    args: any
  ): Promise<Result<void>> {
    try {
      // Define tool permissions
      const toolPermissions = this.getToolPermissions(toolName);
      
      // Check if anonymous access is allowed
      if (!authContext) {
        if (toolPermissions.allowAnonymous) {
          return { success: true, data: undefined };
        } else {
          return {
            success: false,
            error: {
              name: 'AuthorizationError',
              message: 'Authentication required',
              code: 'AUTHENTICATION_REQUIRED',
              statusCode: 401,
              isOperational: true
            }
          };
        }
      }

      // Check required permissions
      if (!this.hasPermission(authContext, toolPermissions.requiredPermissions)) {
        return {
          success: false,
          error: {
            name: 'AuthorizationError',
            message: 'Insufficient permissions',
            code: 'INSUFFICIENT_PERMISSIONS',
            statusCode: 403,
            isOperational: true
          }
        };
      }

      // Check required roles
      if (!this.hasRole(authContext, toolPermissions.requiredRoles)) {
        return {
          success: false,
          error: {
            name: 'AuthorizationError',
            message: 'Insufficient roles',
            code: 'INSUFFICIENT_ROLES',
            statusCode: 403,
            isOperational: true
          }
        };
      }

      // Additional resource-based authorization
      const resourceAuth = await this.authorizeResource(authContext, toolName, args);
      if (!resourceAuth.success) {
        return resourceAuth;
      }

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Authorization error:', error);
      return {
        success: false,
        error: {
          name: 'AuthorizationError',
          message: 'Authorization failed',
          code: 'AUTHORIZATION_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get tool-specific permission requirements
   */
  private getToolPermissions(toolName: string): ToolPermissions {
    const toolPermissionsMap: Record<string, ToolPermissions> = {
      // Read operations
      'kb_read': {
        requiredPermissions: ['read'],
        requiredRoles: [],
        allowAnonymous: false
      },
      'kb_list': {
        requiredPermissions: ['read'],
        requiredRoles: [],
        allowAnonymous: false
      },
      'kb_search': {
        requiredPermissions: ['read'],
        requiredRoles: [],
        allowAnonymous: false
      },
      'kb_status': {
        requiredPermissions: ['read'],
        requiredRoles: [],
        allowAnonymous: false
      },
      'kb_issues': {
        requiredPermissions: ['read'],
        requiredRoles: [],
        allowAnonymous: false
      },

      // Write operations
      'kb_write': {
        requiredPermissions: ['write'],
        requiredRoles: [],
        allowAnonymous: false
      },
      'kb_update': {
        requiredPermissions: ['write'],
        requiredRoles: [],
        allowAnonymous: false
      },
      'kb_delete': {
        requiredPermissions: ['write'],
        requiredRoles: [],
        allowAnonymous: false
      },

      // Admin operations
      'kb_admin': {
        requiredPermissions: ['admin'],
        requiredRoles: ['admin'],
        allowAnonymous: false
      },
      'kb_backup': {
        requiredPermissions: ['admin'],
        requiredRoles: ['admin'],
        allowAnonymous: false
      },
      'kb_restore': {
        requiredPermissions: ['admin'],
        requiredRoles: ['admin'],
        allowAnonymous: false
      },

      // Public operations
      'kb_health': {
        requiredPermissions: [],
        requiredRoles: [],
        allowAnonymous: true
      }
    };

    return toolPermissionsMap[toolName] || {
      requiredPermissions: ['read'],
      requiredRoles: [],
      allowAnonymous: false
    };
  }

  /**
   * Resource-based authorization (e.g., file path restrictions)
   */
  private async authorizeResource(
    authContext: AuthContext,
    _toolName: string,
    args: any
  ): Promise<Result<void>> {
    try {
      // Path-based authorization
      if (args.path) {
        const pathAuth = this.authorizeFilePath(authContext, args.path);
        if (!pathAuth.success) {
          return pathAuth;
        }
      }

      // Category-based authorization
      if (args.category) {
        const categoryAuth = this.authorizeCategory(authContext, args.category);
        if (!categoryAuth.success) {
          return categoryAuth;
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Resource authorization error:', error);
      return {
        success: false,
        error: {
          name: 'AuthorizationError',
          message: 'Resource authorization failed',
          code: 'RESOURCE_AUTHORIZATION_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Authorize file path access
   */
  private authorizeFilePath(authContext: AuthContext, filePath: string): Result<void> {
    // Define path restrictions
    const pathRestrictions: Record<string, string[]> = {
      'admin': [], // Admin can access all paths
      'user': [
        'active/',
        'completed/',
        'general/',
        'status/'
      ],
      'readonly': [
        'active/',
        'completed/',
        'status/'
      ]
    };

    // Check if user has admin role (can access everything)
    if (authContext.roles.includes('admin')) {
      return { success: true, data: undefined };
    }

    // Check path restrictions for user roles
    const userRole = authContext.roles.find(role => pathRestrictions[role]);
    if (!userRole) {
      return {
        success: false,
        error: {
          name: 'AuthorizationError',
          message: 'No valid role for path access',
          code: 'INVALID_ROLE_FOR_PATH',
          statusCode: 403,
          isOperational: true
        }
      };
    }

    const allowedPaths = pathRestrictions[userRole];
    if (allowedPaths.length === 0) {
      return { success: true, data: undefined }; // No restrictions
    }

    // Check if file path starts with any allowed path
    const isAllowed = allowedPaths.some(allowedPath => 
      filePath.startsWith(allowedPath)
    );

    if (!isAllowed) {
      return {
        success: false,
        error: {
          name: 'AuthorizationError',
          message: 'Access denied to file path',
          code: 'PATH_ACCESS_DENIED',
          statusCode: 403,
          isOperational: true
        }
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * Authorize category access
   */
  private authorizeCategory(authContext: AuthContext, category: string): Result<void> {
    // Define category restrictions
    const categoryRestrictions: Record<string, string[]> = {
      'admin': [], // Admin can access all categories
      'user': [
        'active',
        'completed',
        'general',
        'status'
      ],
      'readonly': [
        'active',
        'completed',
        'status'
      ]
    };

    // Check if user has admin role (can access everything)
    if (authContext.roles.includes('admin')) {
      return { success: true, data: undefined };
    }

    // Check category restrictions for user roles
    const userRole = authContext.roles.find(role => categoryRestrictions[role]);
    if (!userRole) {
      return {
        success: false,
        error: {
          name: 'AuthorizationError',
          message: 'No valid role for category access',
          code: 'INVALID_ROLE_FOR_CATEGORY',
          statusCode: 403,
          isOperational: true
        }
      };
    }

    const allowedCategories = categoryRestrictions[userRole];
    if (allowedCategories.length === 0) {
      return { success: true, data: undefined }; // No restrictions
    }

    // Check if category is allowed
    const isAllowed = allowedCategories.includes(category);

    if (!isAllowed) {
      return {
        success: false,
        error: {
          name: 'AuthorizationError',
          message: 'Access denied to category',
          code: 'CATEGORY_ACCESS_DENIED',
          statusCode: 403,
          isOperational: true
        }
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * Create anonymous auth context for public access
   */
  createAnonymousContext(): AuthContext {
    return {
      user: {
        id: 'anonymous',
        email: 'anonymous@local',
        name: 'Anonymous User',
        avatar: undefined,
        provider: 'anonymous',
        providerUserId: 'anonymous',
        roles: ['anonymous'],
        permissions: ['read'],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        active: true
      },
      token: '',
      permissions: ['read'],
      roles: ['anonymous']
    };
  }

  /**
   * Extract auth context from request headers
   */
  async extractAuthContext(headers: Record<string, string>): Promise<AuthContext | null> {
    const authHeader = headers['authorization'] || headers['Authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const authResult = await this.validateToken(token);
    
    return authResult.success ? authResult.data : null;
  }

  /**
   * Log authentication events
   */
  logAuthEvent(
    event: 'login' | 'logout' | 'access_granted' | 'access_denied' | 'token_expired',
    authContext: AuthContext | null,
    details?: any
  ): void {
    this.logger.info('Auth event', {
      event,
      userId: authContext?.user.id || 'anonymous',
      userEmail: authContext?.user.email || 'anonymous',
      timestamp: new Date().toISOString(),
      details
    });
  }
}

interface ToolPermissions {
  requiredPermissions: string[];
  requiredRoles: string[];
  allowAnonymous: boolean;
}