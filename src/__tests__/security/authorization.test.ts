/**
 * Authorization Security Tests
 * Tests for RBAC, permission enforcement, and access control
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import { AuthorizationService } from "../../core/authorization";
import { SecurityContext, Permission, Role } from "../../types/index";

describe("Authorization Security", () => {
  let authService: AuthorizationService;

  const testRoles: Role[] = [
    {
      name: "admin",
      permissions: ["kb.*", "user.*", "system.*"],
      description: "Full system access",
    },
    {
      name: "editor",
      permissions: ["kb.read", "kb.write", "kb.delete"],
      description: "Can manage knowledge base content",
    },
    {
      name: "viewer",
      permissions: ["kb.read", "kb.list", "kb.search"],
      description: "Read-only access",
    },
    {
      name: "api_user",
      permissions: ["kb.read", "kb.write", "api.access"],
      description: "API access with limited permissions",
    },
  ];

  const testContexts: Record<string, SecurityContext> = {
    admin: {
      user_id: "admin-user",
      session_id: "admin-session",
      ip_address: "192.168.1.100",
      user_agent: "Test Agent",
      permissions: ["kb.*", "user.*", "system.*"],
      mfa_verified: true,
      roles: ["admin"],
    },
    editor: {
      user_id: "editor-user",
      session_id: "editor-session",
      ip_address: "192.168.1.101",
      user_agent: "Test Agent",
      permissions: ["kb.read", "kb.write", "kb.delete"],
      mfa_verified: true,
      roles: ["editor"],
    },
    viewer: {
      user_id: "viewer-user",
      session_id: "viewer-session",
      ip_address: "192.168.1.102",
      user_agent: "Test Agent",
      permissions: ["kb.read", "kb.list", "kb.search"],
      mfa_verified: false,
      roles: ["viewer"],
    },
  };

  beforeEach(() => {
    authService = new AuthorizationService();

    // Load test roles
    testRoles.forEach((role) => authService.addRole(role));
  });

  describe("Permission Checking", () => {
    test("should allow exact permission match", () => {
      const result = authService.checkPermission(
        testContexts.editor,
        "kb.read",
      );
      expect(result).toBe(true);
    });

    test("should deny missing permission", () => {
      const result = authService.checkPermission(
        testContexts.viewer,
        "kb.write",
      );
      expect(result).toBe(false);
    });

    test("should handle wildcard permissions", () => {
      // Admin has kb.*
      expect(authService.checkPermission(testContexts.admin, "kb.read")).toBe(
        true,
      );
      expect(authService.checkPermission(testContexts.admin, "kb.write")).toBe(
        true,
      );
      expect(authService.checkPermission(testContexts.admin, "kb.delete")).toBe(
        true,
      );
      expect(authService.checkPermission(testContexts.admin, "kb.admin")).toBe(
        true,
      );
    });

    test("should handle nested wildcard permissions", () => {
      const context: SecurityContext = {
        ...testContexts.viewer,
        permissions: ["kb.docs.*"],
      };

      expect(authService.checkPermission(context, "kb.docs.read")).toBe(true);
      expect(authService.checkPermission(context, "kb.docs.write")).toBe(true);
      expect(authService.checkPermission(context, "kb.api.read")).toBe(false);
    });

    test("should require all permissions when multiple provided", () => {
      const result = authService.checkPermissions(testContexts.editor, [
        "kb.read",
        "kb.write",
      ]);
      expect(result).toBe(true);

      const result2 = authService.checkPermissions(testContexts.editor, [
        "kb.read",
        "kb.admin",
      ]);
      expect(result2).toBe(false);
    });

    test("should check any permission with OR logic", () => {
      const result = authService.checkAnyPermission(testContexts.viewer, [
        "kb.write",
        "kb.read",
        "kb.admin",
      ]);
      expect(result).toBe(true); // Has kb.read

      const result2 = authService.checkAnyPermission(testContexts.viewer, [
        "kb.write",
        "kb.delete",
        "kb.admin",
      ]);
      expect(result2).toBe(false); // Has none
    });
  });

  describe("Role-Based Access Control", () => {
    test("should grant permissions based on role", () => {
      const permissions = authService.getRolePermissions("editor");
      expect(permissions).toEqual(["kb.read", "kb.write", "kb.delete"]);
    });

    test("should check role membership", () => {
      expect(authService.hasRole(testContexts.admin, "admin")).toBe(true);
      expect(authService.hasRole(testContexts.admin, "editor")).toBe(false);
    });

    test("should handle role hierarchy", () => {
      // Add role hierarchy
      authService.addRole({
        name: "super_admin",
        permissions: ["*"],
        inherits: ["admin"],
      });

      const context: SecurityContext = {
        ...testContexts.admin,
        roles: ["super_admin"],
      };

      // Should have all permissions
      expect(authService.checkPermission(context, "anything.at.all")).toBe(
        true,
      );
    });

    test("should merge inherited role permissions", () => {
      authService.addRole({
        name: "power_editor",
        permissions: ["kb.approve", "kb.publish"],
        inherits: ["editor"],
      });

      const permissions = authService.getRolePermissions("power_editor");
      expect(permissions).toContain("kb.read"); // From editor
      expect(permissions).toContain("kb.write"); // From editor
      expect(permissions).toContain("kb.approve"); // Own permission
    });

    test("should prevent circular role inheritance", () => {
      authService.addRole({
        name: "role_a",
        permissions: ["a.permission"],
        inherits: ["role_b"],
      });

      expect(() => {
        authService.addRole({
          name: "role_b",
          permissions: ["b.permission"],
          inherits: ["role_a"], // Circular!
        });
      }).toThrow("Circular role inheritance detected");
    });
  });

  describe("Resource-Based Access Control", () => {
    test("should check resource ownership", () => {
      const resource = {
        id: "doc-123",
        owner_id: "editor-user",
        type: "document",
      };

      // Owner should have access
      expect(
        authService.checkResourceAccess(testContexts.editor, resource, "write"),
      ).toBe(true);

      // Non-owner needs permission
      expect(
        authService.checkResourceAccess(testContexts.viewer, resource, "write"),
      ).toBe(false);
    });

    test("should respect resource sharing", () => {
      const resource = {
        id: "doc-456",
        owner_id: "other-user",
        type: "document",
        shared_with: ["viewer-user"],
        share_permissions: ["read"],
      };

      // Shared user can read
      expect(
        authService.checkResourceAccess(testContexts.viewer, resource, "read"),
      ).toBe(true);

      // But not write
      expect(
        authService.checkResourceAccess(testContexts.viewer, resource, "write"),
      ).toBe(false);
    });

    test("should handle group-based resource access", () => {
      const resource = {
        id: "doc-789",
        owner_id: "other-user",
        type: "document",
        group_access: {
          editors: ["read", "write"],
          viewers: ["read"],
        },
      };

      // Editor group member
      const editorContext = {
        ...testContexts.editor,
        groups: ["editors"],
      };

      expect(
        authService.checkResourceAccess(editorContext, resource, "write"),
      ).toBe(true);

      // Viewer group member
      const viewerContext = {
        ...testContexts.viewer,
        groups: ["viewers"],
      };

      expect(
        authService.checkResourceAccess(viewerContext, resource, "write"),
      ).toBe(false);
    });
  });

  describe("Policy-Based Access Control", () => {
    test("should evaluate simple policies", () => {
      const policy = {
        effect: "allow" as const,
        actions: ["kb.read", "kb.list"],
        resources: ["kb/*"],
        conditions: {},
      };

      const result = authService.evaluatePolicy(
        testContexts.viewer,
        policy,
        "kb.read",
        "kb/docs/guide.md",
      );

      expect(result).toBe(true);
    });

    test("should handle deny policies", () => {
      const policy = {
        effect: "deny" as const,
        actions: ["kb.delete"],
        resources: ["kb/system/*"],
        conditions: {},
      };

      // Even admin should be denied
      const result = authService.evaluatePolicy(
        testContexts.admin,
        policy,
        "kb.delete",
        "kb/system/config.md",
      );

      expect(result).toBe(false);
    });

    test("should evaluate policy conditions", () => {
      const policy = {
        effect: "allow" as const,
        actions: ["kb.write"],
        resources: ["kb/*"],
        conditions: {
          mfa_required: true,
          ip_range: "192.168.1.0/24",
        },
      };

      // Editor with MFA should be allowed
      const result1 = authService.evaluatePolicy(
        testContexts.editor,
        policy,
        "kb.write",
        "kb/docs/new.md",
      );
      expect(result1).toBe(true);

      // Viewer without MFA should be denied
      const result2 = authService.evaluatePolicy(
        testContexts.viewer,
        policy,
        "kb.write",
        "kb/docs/new.md",
      );
      expect(result2).toBe(false);
    });

    test("should handle time-based conditions", () => {
      const policy = {
        effect: "allow" as const,
        actions: ["kb.write"],
        resources: ["kb/*"],
        conditions: {
          time_range: {
            start: "09:00",
            end: "17:00",
            timezone: "UTC",
          },
        },
      };

      // Mock current time
      const currentHour = new Date().getUTCHours();
      const isBusinessHours = currentHour >= 9 && currentHour < 17;

      const result = authService.evaluatePolicy(
        testContexts.editor,
        policy,
        "kb.write",
        "kb/docs/test.md",
      );

      expect(result).toBe(isBusinessHours);
    });
  });

  describe("Permission Delegation", () => {
    test("should allow permission delegation", () => {
      const delegation = {
        from: "admin-user",
        to: "editor-user",
        permissions: ["system.config.read"],
        expires_at: new Date(Date.now() + 3600000), // 1 hour
      };

      authService.addDelegation(delegation);

      // Editor should now have the delegated permission
      const editorWithDelegation = {
        ...testContexts.editor,
        delegated_permissions:
          authService.getDelegatedPermissions("editor-user"),
      };

      expect(
        authService.checkPermission(editorWithDelegation, "system.config.read"),
      ).toBe(true);
    });

    test("should respect delegation expiry", () => {
      const delegation = {
        from: "admin-user",
        to: "editor-user",
        permissions: ["system.config.write"],
        expires_at: new Date(Date.now() - 1000), // Already expired
      };

      authService.addDelegation(delegation);

      const delegated = authService.getDelegatedPermissions("editor-user");
      expect(delegated).not.toContain("system.config.write");
    });

    test("should limit delegation chain", () => {
      // Admin delegates to Editor
      authService.addDelegation({
        from: "admin-user",
        to: "editor-user",
        permissions: ["system.admin"],
        can_delegate: true,
      });

      // Editor tries to delegate to Viewer
      expect(() => {
        authService.addDelegation({
          from: "editor-user",
          to: "viewer-user",
          permissions: ["system.admin"],
          can_delegate: true, // Should fail - too many levels
        });
      }).toThrow("Delegation chain too deep");
    });
  });

  describe("Attribute-Based Access Control", () => {
    test("should evaluate attribute-based rules", () => {
      const rule = {
        resource_type: "document",
        action: "read",
        condition: {
          "resource.classification": ["public", "internal"],
          "user.department": "engineering",
        },
      };

      const context = {
        ...testContexts.viewer,
        attributes: {
          department: "engineering",
          clearance_level: "internal",
        },
      };

      const resource = {
        type: "document",
        classification: "internal",
        department: "engineering",
      };

      const result = authService.evaluateABACRule(
        context,
        resource,
        "read",
        rule,
      );
      expect(result).toBe(true);
    });

    test("should handle complex attribute expressions", () => {
      const rule = {
        resource_type: "project",
        action: "approve",
        condition: {
          or: [
            { "user.role": "manager" },
            {
              and: [
                { "user.seniority": { gte: 5 } },
                { "resource.budget": { lt: 10000 } },
              ],
            },
          ],
        },
      };

      const context = {
        ...testContexts.editor,
        attributes: {
          seniority: 7,
          role: "senior_engineer",
        },
      };

      const resource = {
        type: "project",
        budget: 5000,
      };

      const result = authService.evaluateABACRule(
        context,
        resource,
        "approve",
        rule,
      );
      expect(result).toBe(true); // Meets seniority + budget condition
    });
  });

  describe("Security Context Validation", () => {
    test("should validate required MFA for sensitive operations", () => {
      const sensitiveOps = ["kb.delete", "user.modify", "system.config"];

      for (const op of sensitiveOps) {
        // With MFA
        expect(
          authService.validateContextForOperation(testContexts.admin, op),
        ).toBe(true);

        // Without MFA
        expect(
          authService.validateContextForOperation(testContexts.viewer, op),
        ).toBe(false);
      }
    });

    test("should enforce IP restrictions", () => {
      const restrictedContext = {
        ...testContexts.admin,
        ip_address: "10.0.0.1", // Internal IP
      };

      authService.setIPRestriction("admin", ["192.168.1.0/24"]);

      // Should fail - IP not in allowed range
      expect(
        authService.validateContextForOperation(
          restrictedContext,
          "system.admin",
        ),
      ).toBe(false);
    });

    test("should check session age for sensitive operations", () => {
      const oldSession = {
        ...testContexts.admin,
        session_created_at: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours old
      };

      // Should require re-authentication
      expect(
        authService.validateContextForOperation(oldSession, "user.delete"),
      ).toBe(false);
    });
  });

  describe("Audit Trail", () => {
    test("should log authorization decisions", () => {
      const logs: any[] = [];
      authService.on("authorization", (log) => logs.push(log));

      authService.checkPermission(testContexts.viewer, "kb.write");

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        user_id: "viewer-user",
        action: "kb.write",
        result: "deny",
        reason: "Missing required permission",
      });
    });

    test("should include context in audit logs", () => {
      const logs: any[] = [];
      authService.on("authorization", (log) => logs.push(log));

      authService.checkResourceAccess(
        testContexts.editor,
        { id: "doc-123", owner_id: "other-user" },
        "delete",
      );

      expect(logs[0]).toHaveProperty("resource_id", "doc-123");
      expect(logs[0]).toHaveProperty("ip_address", "192.168.1.101");
    });
  });
});
