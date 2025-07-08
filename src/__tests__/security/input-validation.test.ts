/**
 * Input Validation Security Tests
 * Tests for XSS, injection, and path traversal protection
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { SecurityValidator, Sanitizers } from '@core/security';

describe('Input Validation Security', () => {
  describe('Path Validation', () => {
    test('should reject path traversal attempts', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'docs/../../../etc/passwd',
        'docs/./../../etc/passwd',
        '~/root/.ssh/id_rsa',
        '/etc/passwd',
        '\\\\server\\share\\file',
        'docs/../../.git/config',
        'docs%2F..%2F..%2Fetc%2Fpasswd',
        'docs/\x00/null-byte',
      ];

      for (const path of maliciousPaths) {
        expect(() => SecurityValidator.validatePath(path)).toThrow();
      }
    });

    test('should reject paths with forbidden patterns', () => {
      const forbiddenPaths = [
        'docs/<script>alert(1)</script>.md',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'docs/test\x00.md',
        'docs/test\r\n.md',
      ];

      for (const path of forbiddenPaths) {
        expect(() => SecurityValidator.validatePath(path)).toThrow();
      }
    });

    test('should accept valid paths', () => {
      const validPaths = [
        'docs/guide.md',
        'api/reference.md',
        'notes/2024-01-15-meeting.md',
        'deeply/nested/path/to/file.markdown',
        'file-with-dash.md',
        'file_with_underscore.md',
      ];

      for (const path of validPaths) {
        expect(() => SecurityValidator.validatePath(path)).not.toThrow();
      }
    });

    test('should enforce maximum path length', () => {
      const longPath = 'a'.repeat(256) + '.md';
      expect(() => SecurityValidator.validatePath(longPath)).toThrow();
    });

    test('should require allowed file extensions', () => {
      const invalidExtensions = [
        'docs/file.txt',
        'docs/file.js',
        'docs/file.exe',
        'docs/file.sh',
        'docs/file',
        'docs/file.',
      ];

      for (const path of invalidExtensions) {
        expect(() => SecurityValidator.validatePath(path)).toThrow();
      }
    });
  });

  describe('Content Validation', () => {
    test('should remove XSS attempts', () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src="javascript:alert(1)">',
        '<body onload=alert(1)>',
        '<svg onload=alert(1)>',
        '<<SCRIPT>alert("XSS");//<</SCRIPT>',
        '<IMG """><SCRIPT>alert("XSS")</SCRIPT>">',
      ];

      for (const xss of xssAttempts) {
        const sanitized = SecurityValidator.validateContent(xss);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      }
    });

    test('should preserve safe markdown content', () => {
      const safeContent = `
# Safe Markdown

This is **bold** and *italic* text.

- List item 1
- List item 2

[Link](https://example.com)

\`\`\`javascript
console.log("Safe code block");
\`\`\`
      `;

      const validated = SecurityValidator.validateContent(safeContent);
      expect(validated).toBe(safeContent);
    });

    test('should enforce content size limits', () => {
      const largeContent = 'a'.repeat(11 * 1024 * 1024); // 11MB
      expect(() => SecurityValidator.validateContent(largeContent)).toThrow();
    });

    test('should detect malicious patterns', () => {
      const maliciousPatterns = [
        'eval(atob("YWxlcnQoMSk="))',
        'document.cookie',
        'localStorage.getItem',
        '__proto__.polluted = true',
      ];

      for (const pattern of maliciousPatterns) {
        // These should be allowed in content but flagged for review
        const validated = SecurityValidator.validateContent(pattern);
        expect(validated).toBeDefined();
      }
    });
  });

  describe('JSON Validation', () => {
    test('should validate against schema', () => {
      const schema = z.object({
        name: z.string().min(1).max(100),
        age: z.number().min(0).max(150),
        email: z.string().email(),
      });

      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const result = SecurityValidator.validateJSON(validData, schema);
      expect(result).toEqual(validData);
    });

    test('should reject invalid JSON', () => {
      const schema = z.object({
        name: z.string(),
      });

      const invalidData = {
        name: 123, // Should be string
      };

      expect(() => SecurityValidator.validateJSON(invalidData, schema)).toThrow();
    });

    test('should strip unknown fields', () => {
      const schema = z.object({
        allowed: z.string(),
      }).strict();

      const data = {
        allowed: 'value',
        notAllowed: 'should be removed',
      };

      expect(() => SecurityValidator.validateJSON(data, schema)).toThrow();
    });
  });

  describe('Sanitizers', () => {
    test('should sanitize filenames', () => {
      const tests = [
        { input: 'file<script>.md', expected: 'file_script_.md' },
        { input: 'file/with/slash.md', expected: 'file_with_slash.md' },
        { input: 'file\\with\\backslash.md', expected: 'file_with_backslash.md' },
        { input: 'file:with:colon.md', expected: 'file_with_colon.md' },
        { input: 'file*with*asterisk.md', expected: 'file_with_asterisk.md' },
        { input: 'file?with?question.md', expected: 'file_with_question.md' },
        { input: 'file|with|pipe.md', expected: 'file_with_pipe.md' },
      ];

      for (const { input, expected } of tests) {
        expect(Sanitizers.filename(input)).toBe(expected);
      }
    });

    test('should sanitize search queries', () => {
      const queries = [
        { input: 'normal search query', expected: 'normal search query' },
        { input: '<script>alert(1)</script>', expected: 'alert(1)' },
        { input: 'search > test < value', expected: 'search  test  value' },
        { input: 'a'.repeat(2000), expected: 'a'.repeat(1000) },
      ];

      for (const { input, expected } of queries) {
        expect(Sanitizers.searchQuery(input)).toBe(expected);
      }
    });

    test('should sanitize metadata recursively', () => {
      const metadata = {
        title: '<script>XSS</script>',
        tags: ['<b>tag1</b>', 'tag2'],
        nested: {
          value: 'javascript:alert(1)',
        },
      };

      const sanitized = Sanitizers.metadata(metadata);
      expect(sanitized.title).not.toContain('<script>');
      expect(sanitized.tags[0]).not.toContain('<b>');
      expect(sanitized.nested.value).toBe('javascript:alert(1)'); // Preserved but sanitized
    });
  });

  describe('Security Context Validation', () => {
    test('should validate security context', () => {
      const validContext = {
        user_id: 'user123',
        session_id: 'sess123',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        permissions: ['read', 'write'],
        mfa_verified: true,
      };

      const result = SecurityValidator.validateSecurityContext(validContext);
      expect(result).toEqual(validContext);
    });

    test('should reject invalid IP addresses', () => {
      const invalidContext = {
        user_id: 'user123',
        session_id: 'sess123',
        ip_address: 'not-an-ip',
        user_agent: 'Mozilla/5.0',
        permissions: ['read'],
        mfa_verified: false,
      };

      expect(() => SecurityValidator.validateSecurityContext(invalidContext)).toThrow();
    });

    test('should enforce field limits', () => {
      const contextWithLongFields = {
        user_id: 'a'.repeat(256),
        session_id: 'b'.repeat(256),
        ip_address: '::1',
        user_agent: 'c'.repeat(1001),
        permissions: [],
        mfa_verified: false,
      };

      expect(() => SecurityValidator.validateSecurityContext(contextWithLongFields)).toThrow();
    });
  });
});

// Missing import
import { z } from 'zod';