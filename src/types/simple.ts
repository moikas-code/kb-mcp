/**
 * Simple type definitions for minimal KB-MCP
 */

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}