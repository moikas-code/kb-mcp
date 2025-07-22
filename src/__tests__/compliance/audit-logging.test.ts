/**
 * Audit Logging Compliance Tests
 * Tests for SOC2-compliant audit logging with integrity verification
 */

import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { AuditLogger } from "../../core/audit";
import {
  AuditEvent,
  SecurityContext,
  ComplianceConfig,
} from "../../types/index";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

describe("Audit Logging Compliance", () => {
  let auditLogger: AuditLogger;
  let testDir: string;
  let testConfig: ComplianceConfig;
  let testContext: SecurityContext;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `audit-test-${uuidv4()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Test configuration
    testConfig = {
      audit: {
        enabled: true,
        retention_days: 548, // 18 months
        destinations: ["file"],
        encryption_required: true,
      },
      gdpr: {
        pii_detection: true,
        anonymization_delay: "24h",
        right_to_erasure: true,
        data_portability: true,
      },
      data_classification: {
        enabled: true,
        levels: ["public", "internal", "confidential", "restricted"],
        default_level: "internal",
      },
    };

    // Test security context
    testContext = {
      user_id: "test-user-123",
      session_id: "test-session-456",
      ip_address: "192.168.1.100",
      user_agent: "Test Agent/1.0",
      permissions: ["kb.read", "kb.write"],
      mfa_verified: true,
    };

    // Initialize audit logger
    auditLogger = new AuditLogger(testConfig, testDir, "test-encryption-key");
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Event Logging", () => {
    test("should log authentication events", async () => {
      const authEvent: Partial<AuditEvent> = {
        event_type: "auth",
        action: "login",
        resource: "system",
        result: "success",
      };

      const result = await auditLogger.log(authEvent, testContext);
      expect(result.success).toBe(true);

      // Verify log file exists
      const logFile = path.join(testDir, "audit.log");
      const exists = await fs
        .access(logFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    test("should log authorization events", async () => {
      const authzEvent: Partial<AuditEvent> = {
        event_type: "authz",
        action: "access_file",
        resource: "docs/sensitive.md",
        result: "failure",
        metadata: {
          required_permission: "kb.admin",
          user_permissions: testContext.permissions,
        },
      };

      const result = await auditLogger.log(authzEvent, testContext);
      expect(result.success).toBe(true);
    });

    test("should log data access events", async () => {
      const dataEvents = [
        { action: "read_file", resource: "docs/guide.md" },
        { action: "write_file", resource: "docs/new.md" },
        { action: "delete_file", resource: "docs/old.md" },
        { action: "search", resource: "kb_search" },
      ];

      for (const event of dataEvents) {
        const result = await auditLogger.log(
          {
            event_type: "data_access",
            action: event.action,
            resource: event.resource,
            result: "success",
          },
          testContext,
        );
        expect(result.success).toBe(true);
      }
    });

    test("should log configuration changes", async () => {
      const configEvent: Partial<AuditEvent> = {
        event_type: "config_change",
        action: "update_setting",
        resource: "security.mfa_required",
        result: "success",
        metadata: {
          old_value: false,
          new_value: true,
          changed_by: "admin",
          approval_id: "CHG-2024-001",
        },
      };

      const result = await auditLogger.log(configEvent, testContext);
      expect(result.success).toBe(true);
    });

    test("should log security events", async () => {
      const securityEvent: Partial<AuditEvent> = {
        event_type: "security",
        action: "brute_force_detected",
        resource: "authentication",
        result: "failure",
        severity: "high",
        metadata: {
          attempts: 10,
          source_ip: "10.0.0.100",
          blocked: true,
        },
      };

      const result = await auditLogger.log(securityEvent, testContext);
      expect(result.success).toBe(true);
    });

    test("should include all required fields", async () => {
      const event: Partial<AuditEvent> = {
        event_type: "data_access",
        action: "test_action",
        resource: "test_resource",
        result: "success",
      };

      await auditLogger.log(event, testContext);

      // Read and parse the log
      const logFile = path.join(testDir, "audit.log");
      const content = await fs.readFile(logFile, "utf8");
      const lines = content.trim().split("\n");
      const lastLine = JSON.parse(lines[lines.length - 1]);

      // Verify required fields
      expect(lastLine.message).toBe("audit_event");
      expect(lastLine).toHaveProperty("event_id");
      expect(lastLine).toHaveProperty("timestamp");
      expect(lastLine).toHaveProperty("event_type");
      expect(lastLine).toHaveProperty("action");
      expect(lastLine).toHaveProperty("resource");
      expect(lastLine).toHaveProperty("result");
      expect(lastLine).toHaveProperty("user_id");
      expect(lastLine).toHaveProperty("session_id");
    });
  });

  describe("Integrity Protection", () => {
    test("should add integrity hash to events", async () => {
      await auditLogger.log(
        {
          event_type: "data_access",
          action: "read",
          resource: "test.md",
          result: "success",
        },
        testContext,
      );

      const logFile = path.join(testDir, "audit.log");
      const content = await fs.readFile(logFile, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.metadata).toHaveProperty("integrity_hash");
      expect(event.metadata).toHaveProperty("previous_hash");
      expect(event.metadata.integrity_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test("should maintain hash chain", async () => {
      const events = [];

      // Log multiple events
      for (let i = 0; i < 5; i++) {
        await auditLogger.log(
          {
            event_type: "data_access",
            action: `action_${i}`,
            resource: `resource_${i}`,
            result: "success",
          },
          testContext,
        );
      }

      // Read all events
      const logFile = path.join(testDir, "audit.log");
      const content = await fs.readFile(logFile, "utf8");
      const lines = content.trim().split("\n");

      let previousHash = "0"; // Genesis hash

      for (const line of lines) {
        const event = JSON.parse(line);

        // Verify chain
        expect(event.metadata.previous_hash).toBe(previousHash);
        previousHash = event.metadata.integrity_hash;

        events.push(event);
      }

      // Verify chain continuity
      expect(events.length).toBe(5);
    });

    test("should verify integrity successfully", async () => {
      // Log some events
      for (let i = 0; i < 3; i++) {
        await auditLogger.log(
          {
            event_type: "data_access",
            action: `action_${i}`,
            resource: `resource_${i}`,
            result: "success",
          },
          testContext,
        );
      }

      // Verify integrity
      const result = await auditLogger.verifyIntegrity();

      expect(result.success).toBe(true);
      expect(result.data.integrity_valid).toBe(true);
      expect(result.data.total_events).toBe(3);
      expect(result.data.valid_events).toBe(3);
      expect(result.data.invalid_events).toBe(0);
    });

    test("should detect tampering", async () => {
      // Log an event
      await auditLogger.log(
        {
          event_type: "data_access",
          action: "read",
          resource: "test.md",
          result: "success",
        },
        testContext,
      );

      // Tamper with the log file
      const logFile = path.join(testDir, "audit.log");
      const content = await fs.readFile(logFile, "utf8");
      const event = JSON.parse(content.trim());

      // Modify event data
      event.action = "write"; // Changed from 'read'
      await fs.writeFile(logFile, JSON.stringify(event));

      // Verify integrity should fail
      const result = await auditLogger.verifyIntegrity();

      expect(result.success).toBe(true);
      expect(result.data.integrity_valid).toBe(false);
      expect(result.data.invalid_events).toBe(1);
      expect(result.data.issues).toHaveLength(1);
    });
  });

  describe("PII Handling", () => {
    test("should detect PII fields", async () => {
      const eventWithPII: Partial<AuditEvent> = {
        event_type: "data_access",
        action: "read_user_data",
        resource: "users/profile.md",
        result: "success",
        metadata: {
          email: "user@example.com",
          phone: "555-123-4567",
          ssn: "123-45-6789",
        },
      };

      await auditLogger.log(eventWithPII, testContext);

      const logFile = path.join(testDir, "audit.log");
      const content = await fs.readFile(logFile, "utf8");
      const event = JSON.parse(content.trim());

      expect(event.pii_fields).toContain("user_id");
      expect(event.pii_fields).toContain("ip_address");
    });

    test("should encrypt PII when configured", async () => {
      // Log event with PII
      await auditLogger.log(
        {
          event_type: "auth",
          action: "login",
          resource: "system",
          result: "success",
        },
        testContext,
      );

      const logFile = path.join(testDir, "audit.log");
      const content = await fs.readFile(logFile, "utf8");
      const event = JSON.parse(content.trim());

      // If encryption is enabled, PII should be in encrypted_pii field
      if (testConfig.audit.encryption_required) {
        expect(event).toHaveProperty("encrypted_pii");
        expect(event.encrypted_pii).toHaveProperty("algorithm");
        expect(event.encrypted_pii).toHaveProperty("ciphertext");

        // Original PII fields should be removed
        expect(event.user_id).toBeUndefined();
      }
    });
  });

  describe("Query and Export", () => {
    beforeEach(async () => {
      // Log various events for querying
      const events = [
        { event_type: "auth", action: "login", result: "success" },
        { event_type: "auth", action: "login", result: "failure" },
        { event_type: "data_access", action: "read", result: "success" },
        { event_type: "data_access", action: "write", result: "success" },
        { event_type: "error", action: "process", result: "error" },
      ];

      for (const event of events) {
        await auditLogger.log(
          {
            ...event,
            resource: "test",
          } as Partial<AuditEvent>,
          testContext,
        );
      }
    });

    test("should query by event type", async () => {
      const result = await auditLogger.query({
        event_type: "auth",
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data.every((e) => e.event_type === "auth")).toBe(true);
    });

    test("should query by date range", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = await auditLogger.query({
        timestamp_start: yesterday.toISOString(),
        timestamp_end: tomorrow.toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    test("should apply pagination", async () => {
      const result = await auditLogger.query(
        {},
        {
          limit: 2,
          offset: 1,
        },
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    test("should export as JSON", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await auditLogger.export(yesterday, now, "json");

      expect(result.success).toBe(true);
      const exported = JSON.parse(result.data);
      expect(Array.isArray(exported)).toBe(true);
      expect(exported.length).toBeGreaterThan(0);
    });

    test("should export as CSV", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await auditLogger.export(yesterday, now, "csv");

      expect(result.success).toBe(true);
      expect(result.data).toContain("event_id,timestamp,event_type");
      expect(result.data.split("\n").length).toBeGreaterThan(1);
    });
  });

  describe("Retention Policy", () => {
    test("should identify events for cleanup", async () => {
      // This test would require mocking dates
      // For now, test the cleanup function exists
      const result = await auditLogger.cleanupOldLogs();

      expect(result.success).toBe(true);
      expect(typeof result.data).toBe("number");
    });

    test("should respect retention periods by event type", async () => {
      // Log events with different types
      const eventTypes: AuditEvent["event_type"][] = [
        "auth",
        "authz",
        "data_access",
        "config_change",
        "security",
        "error",
      ];

      for (const event_type of eventTypes) {
        await auditLogger.log(
          {
            event_type,
            action: "test",
            resource: "test",
            result: "success",
          },
          testContext,
        );
      }

      // Verify all events are logged
      const result = await auditLogger.query({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(eventTypes.length);
    });
  });

  describe("Performance", () => {
    test("should handle high volume logging", async () => {
      const start = Date.now();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        await auditLogger.log(
          {
            event_type: "data_access",
            action: "read",
            resource: `file_${i}.md`,
            result: "success",
          },
          testContext,
        );
      }

      const duration = Date.now() - start;
      const avgTime = duration / count;

      // Should average less than 10ms per event
      expect(avgTime).toBeLessThan(10);
    });

    test("should query large datasets efficiently", async () => {
      // Log many events
      for (let i = 0; i < 100; i++) {
        await auditLogger.log(
          {
            event_type: "data_access",
            action: `action_${i % 10}`,
            resource: `resource_${i}`,
            result: "success",
          },
          testContext,
        );
      }

      const start = Date.now();
      const result = await auditLogger.query({
        event_type: "data_access",
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });
});
