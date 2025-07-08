/**
 * Error utilities for standardized KBError creation
 */

import { KBError } from './index.js';

/**
 * Create a standardized KBError object
 */
export function createKBError(
  name: string,
  message: string,
  code: string,
  statusCode: number = 500,
  context?: Record<string, any>
): KBError {
  return {
    name,
    message,
    code,
    statusCode,
    isOperational: true,
    context
  };
}

/**
 * Convert unknown error to KBError
 */
export function toKBError(error: unknown, context?: Record<string, any>): KBError {
  if (error instanceof Error) {
    return createKBError(
      error.name || 'Error',
      error.message,
      'UNKNOWN_ERROR',
      500,
      context
    );
  }
  
  return createKBError(
    'UnknownError',
    String(error),
    'UNKNOWN_ERROR',
    500,
    context
  );
}

/**
 * Create common error types
 */
export const ErrorTypes = {
  CONNECTION_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('ConnectionError', message, 'CONNECTION_ERROR', 500, context),
    
  VALIDATION_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('ValidationError', message, 'VALIDATION_ERROR', 400, context),
    
  NOT_FOUND_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('NotFoundError', message, 'NOT_FOUND_ERROR', 404, context),
    
  AUTHENTICATION_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('AuthenticationError', message, 'AUTHENTICATION_ERROR', 401, context),
    
  AUTHORIZATION_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('AuthorizationError', message, 'AUTHORIZATION_ERROR', 403, context),
    
  INITIALIZATION_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('InitializationError', message, 'INITIALIZATION_ERROR', 500, context),
    
  OPERATION_ERROR: (message: string, context?: Record<string, any>) =>
    createKBError('OperationError', message, 'OPERATION_ERROR', 500, context)
}; 