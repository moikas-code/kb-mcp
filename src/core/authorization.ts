/**
 * Authorization Service
 * Handles RBAC, permission enforcement, and access control
 */

import { SecurityContext } from "../types/index.js";

export interface AuthorizationConfig {
  enableRBAC: boolean;
  defaultRole: string;
  adminRoles: string[];
  permissions: Record<string, string[]>;
}

export class AuthorizationService {
  private config: AuthorizationConfig;
  private rolePermissions: Map<string, Set<string>>;

  constructor(config: AuthorizationConfig) {
    this.config = config;
    this.rolePermissions = new Map();
    this.initializeRolePermissions();
  }

  private initializeRolePermissions(): void {
    // Initialize default role permissions
    this.rolePermissions.set(
      "admin",
      new Set(["read", "write", "delete", "manage"]),
    );
    this.rolePermissions.set("user", new Set(["read", "write"]));
    this.rolePermissions.set("readonly", new Set(["read"]));
  }

  hasPermission(context: SecurityContext, permission: string): boolean {
    if (!this.config.enableRBAC) {
      return true; // RBAC disabled, allow all
    }

    const userRole = context.role || this.config.defaultRole;
    const rolePermissions = this.rolePermissions.get(userRole);

    if (!rolePermissions) {
      return false;
    }

    return (
      rolePermissions.has(permission) ||
      this.config.adminRoles.includes(userRole)
    );
  }

  checkAccess(
    context: SecurityContext,
    resource: string,
    action: string,
  ): boolean {
    const permission = `${resource}:${action}`;
    return this.hasPermission(context, permission);
  }

  addRole(role: string, permissions: string[]): void {
    this.rolePermissions.set(role, new Set(permissions));
  }

  removeRole(role: string): void {
    this.rolePermissions.delete(role);
  }

  getRolePermissions(role: string): string[] {
    const permissions = this.rolePermissions.get(role);
    return permissions ? Array.from(permissions) : [];
  }

  getAllRoles(): string[] {
    return Array.from(this.rolePermissions.keys());
  }
}
