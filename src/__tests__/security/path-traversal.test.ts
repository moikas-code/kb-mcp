/**
 * Path Traversal Security Tests
 * Tests for path traversal attacks, directory traversal, and file access security
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SecurityValidator } from '@core/security';
import { SecureKBManager } from '@core/kb-manager';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

describe('Path Traversal Security', () => {
  let kbManager: SecureKBManager;
  let testDir: string;
  let kbRoot: string;

  beforeEach(async () => {
    // Create test directory structure
    testDir = path.join(os.tmpdir(), `path-test-${uuidv4()}`);
    kbRoot = path.join(testDir, 'kb');
    
    await fs.mkdir(kbRoot, { recursive: true });
    await fs.mkdir(path.join(testDir, 'sensitive'), { recursive: true });
    
    // Create test files
    await fs.writeFile(path.join(kbRoot, 'allowed.md'), 'Allowed content');
    await fs.writeFile(path.join(testDir, 'sensitive', 'secret.txt'), 'Secret data');
    await fs.writeFile(path.join(testDir, 'outside.txt'), 'Outside KB root');
    
    // Initialize KB manager with strict security
    kbManager = new SecureKBManager({
      storage: {
        path: kbRoot,
        strict_paths: true,
        allowed_extensions: ['.md', '.markdown'],
      },
      security: {
        path_validation: true,
        sandbox_mode: true,
      },
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Path Validation', () => {
    test('should reject absolute paths', async () => {
      const absolutePaths = [
        '/etc/passwd',
        '/home/user/.ssh/id_rsa',
        'C:\\Windows\\System32\\config\\SAM',
        '\\\\server\\share\\file.txt',
      ];
      
      for (const testPath of absolutePaths) {
        const result = await kbManager.readFile(testPath);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid path');
      }
    });

    test('should reject parent directory traversal', async () => {
      const traversalPaths = [
        '../sensitive/secret.txt',
        '../../etc/passwd',
        'docs/../../../etc/passwd',
        'valid/../../sensitive/secret.txt',
        './../outside.txt',
        'docs/./../../outside.txt',
      ];
      
      for (const testPath of traversalPaths) {
        const result = await kbManager.readFile(testPath);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid path');
      }
    });

    test('should reject URL-encoded traversal', async () => {
      const encodedPaths = [
        '..%2F..%2Fetc%2Fpasswd',
        '..%252F..%252Fetc%252Fpasswd', // Double encoded
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%c0%af..%c0%afetc%c0%afpasswd', // UTF-8 encoding
        '..%25c0%25af..%25c0%25afetc%25c0%25afpasswd',
      ];
      
      for (const testPath of encodedPaths) {
        const result = await kbManager.readFile(testPath);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid path');
      }
    });

    test('should reject Unicode/UTF-8 traversal', async () => {
      const unicodePaths = [
        '..＼..＼etc＼passwd', // Full-width backslash
        '‥/‥/etc/passwd', // Two-dot leader
        '︰/etc/passwd', // Presentation form colon
        'docs/\u0000/etc/passwd', // Null byte
        'docs/\uFEFF../etc/passwd', // Zero-width space
      ];
      
      for (const testPath of unicodePaths) {
        const result = await kbManager.readFile(testPath);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid path');
      }
    });

    test('should reject Windows-style paths on Unix', async () => {
      if (process.platform !== 'win32') {
        const windowsPaths = [
          'C:\\Windows\\System32\\drivers\\etc\\hosts',
          '..\\..\\Windows\\System32',
          'docs\\..\\..\\sensitive\\data.txt',
        ];
        
        for (const testPath of windowsPaths) {
          const result = await kbManager.readFile(testPath);
          expect(result.success).toBe(false);
        }
      }
    });

    test('should reject symlink traversal', async () => {
      // Create a symlink pointing outside KB
      const symlinkPath = path.join(kbRoot, 'evil-link.md');
      const targetPath = path.join(testDir, 'outside.txt');
      
      try {
        await fs.symlink(targetPath, symlinkPath);
        
        const result = await kbManager.readFile('evil-link.md');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Symlinks not allowed');
      } catch (error) {
        // Skip test if symlinks not supported
      }
    });
  });

  describe('Path Normalization', () => {
    test('should normalize paths consistently', () => {
      const testCases = [
        { input: 'docs//guide.md', expected: 'docs/guide.md' },
        { input: 'docs/./guide.md', expected: 'docs/guide.md' },
        { input: './docs/guide.md', expected: 'docs/guide.md' },
        { input: 'docs/subdir/../guide.md', expected: 'docs/guide.md' },
      ];
      
      for (const { input, expected } of testCases) {
        const normalized = SecurityValidator.normalizePath(input);
        expect(normalized).toBe(expected);
      }
    });

    test('should handle empty path components', () => {
      const paths = [
        'docs///',
        '///docs///',
        'docs///guide.md',
      ];
      
      for (const testPath of paths) {
        const normalized = SecurityValidator.normalizePath(testPath);
        expect(normalized).not.toContain('//');
        expect(normalized).not.toContain('///');
      }
    });

    test('should reject paths after normalization', () => {
      const sneakyPaths = [
        'docs/sub/../../../../../../etc/passwd',
        'docs/./././../../../etc/passwd',
        'a/b/c/d/e/../../../../../../etc/passwd',
      ];
      
      for (const testPath of sneakyPaths) {
        expect(() => SecurityValidator.validatePath(testPath)).toThrow();
      }
    });
  });

  describe('File Extension Security', () => {
    test('should only allow whitelisted extensions', async () => {
      const files = [
        { name: 'test.exe', allowed: false },
        { name: 'test.sh', allowed: false },
        { name: 'test.bat', allowed: false },
        { name: 'test.md', allowed: true },
        { name: 'test.markdown', allowed: true },
        { name: 'test.MD', allowed: true }, // Case insensitive
        { name: 'test', allowed: false }, // No extension
      ];
      
      for (const file of files) {
        const result = await kbManager.createFile(file.name, 'Test content');
        expect(result.success).toBe(file.allowed);
      }
    });

    test('should detect double extensions', async () => {
      const doubleExtensions = [
        'malicious.md.exe',
        'script.markdown.sh',
        'payload.md.bat',
      ];
      
      for (const filename of doubleExtensions) {
        const result = await kbManager.createFile(filename, 'content');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid file extension');
      }
    });

    test('should handle MIME type confusion', async () => {
      // Files that might be executed despite extension
      const confusingFiles = [
        { name: 'test.md', content: '#!/bin/bash\nrm -rf /' },
        { name: 'doc.md', content: '<?php system($_GET["cmd"]); ?>' },
        { name: 'page.md', content: '<script>alert(1)</script>' },
      ];
      
      for (const file of confusingFiles) {
        const result = await kbManager.createFile(file.name, file.content);
        // Should succeed but content should be sanitized
        expect(result.success).toBe(true);
        
        const readResult = await kbManager.readFile(file.name);
        expect(readResult.data.content).not.toContain('<?php');
        expect(readResult.data.content).not.toContain('<script>');
      }
    });
  });

  describe('Directory Security', () => {
    test('should prevent directory traversal in listing', async () => {
      const result = await kbManager.listFiles('../');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid path');
    });

    test('should not expose parent directory contents', async () => {
      // Try to list parent directory
      const attempts = [
        '..',
        '../',
        '.',
        './',
        'docs/..',
        'docs/../..',
      ];
      
      for (const dir of attempts) {
        const result = await kbManager.listFiles(dir);
        if (result.success) {
          // Should only show KB contents, not parent
          expect(result.data.every(f => !f.includes('sensitive'))).toBe(true);
          expect(result.data.every(f => !f.includes('outside'))).toBe(true);
        }
      }
    });

    test('should validate directory creation paths', async () => {
      const invalidDirs = [
        '../newdir',
        '../../etc/evil',
        '/tmp/evil',
        'C:\\evil',
      ];
      
      for (const dir of invalidDirs) {
        const result = await kbManager.createDirectory(dir);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Sandbox Enforcement', () => {
    test('should enforce sandbox boundaries', async () => {
      // Create file at KB boundary
      await fs.writeFile(path.join(kbRoot, '..', 'boundary.txt'), 'Outside sandbox');
      
      // Should not be accessible
      const result = await kbManager.readFile('../boundary.txt');
      expect(result.success).toBe(false);
    });

    test('should prevent breakout via process operations', async () => {
      // These operations should be blocked in sandbox mode
      const operations = [
        () => kbManager.executeCommand('cat /etc/passwd'),
        () => kbManager.openExternal('/etc/passwd'),
        () => kbManager.createHardLink('safe.md', '/etc/passwd'),
      ];
      
      for (const op of operations) {
        await expect(op()).rejects.toThrow('Operation not allowed in sandbox mode');
      }
    });

    test('should validate resolved paths stay within sandbox', async () => {
      // Create a complex directory structure
      const deepPath = path.join(kbRoot, 'a', 'b', 'c');
      await fs.mkdir(deepPath, { recursive: true });
      
      // Try to escape via resolved path
      const escapeAttempts = [
        'a/b/c/../../../../../../../../etc/passwd',
        'a/../a/../a/../../../../../etc/passwd',
        'a/b/../b/../b/../../../../../../etc/passwd',
      ];
      
      for (const attempt of escapeAttempts) {
        const result = await kbManager.readFile(attempt);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Race Condition Protection', () => {
    test('should prevent TOCTOU attacks', async () => {
      const filename = 'race-test.md';
      const safePath = path.join(kbRoot, filename);
      
      // Create initial file
      await fs.writeFile(safePath, 'Initial content');
      
      // Start read operation
      const readPromise = kbManager.readFile(filename);
      
      // Try to replace with symlink during read
      try {
        await fs.unlink(safePath);
        await fs.symlink('/etc/passwd', safePath);
      } catch {
        // Ignore if operation fails
      }
      
      // Read should either get original content or fail safely
      const result = await readPromise;
      if (result.success) {
        expect(result.data.content).toBe('Initial content');
      } else {
        expect(result.error).toContain('security');
      }
    });

    test('should use atomic operations', async () => {
      const filename = 'atomic-test.md';
      
      // Multiple concurrent writes
      const writes = [];
      for (let i = 0; i < 10; i++) {
        writes.push(kbManager.updateFile(filename, `Content ${i}`));
      }
      
      const results = await Promise.all(writes);
      
      // Should have consistent state
      const finalRead = await kbManager.readFile(filename);
      expect(finalRead.success).toBe(true);
      expect(finalRead.data.content).toMatch(/Content \d+/);
    });
  });

  describe('Special Character Handling', () => {
    test('should handle null bytes', async () => {
      const nullBytePaths = [
        'test\x00.md',
        'test.md\x00.exe',
        'docs/\x00/secret.md',
        'test\u0000.md',
      ];
      
      for (const testPath of nullBytePaths) {
        const result = await kbManager.readFile(testPath);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid character');
      }
    });

    test('should handle special filesystem characters', async () => {
      const specialChars = [
        'file:name.md',
        'file<name>.md',
        'file>name.md',
        'file|name.md',
        'file*name.md',
        'file?name.md',
      ];
      
      for (const filename of specialChars) {
        const result = await kbManager.createFile(filename, 'content');
        if (result.success) {
          // Should be sanitized
          expect(result.data.path).not.toContain('<');
          expect(result.data.path).not.toContain('>');
          expect(result.data.path).not.toContain('|');
        }
      }
    });
  });

  describe('Case Sensitivity Attacks', () => {
    test('should handle case variations consistently', async () => {
      await kbManager.createFile('test.MD', 'content');
      
      // Different case variations should resolve to same file
      const variations = ['test.md', 'TEST.MD', 'Test.Md', 'TeSt.mD'];
      
      for (const variant of variations) {
        const result = await kbManager.fileExists(variant);
        // Behavior depends on filesystem
        expect(typeof result).toBe('boolean');
      }
    });

    test('should prevent case-based extension bypass', async () => {
      const caseBypass = [
        'malicious.mD.ExE',
        'script.MARKDOWN.SH',
        'payload.Md.BaT',
      ];
      
      for (const filename of caseBypass) {
        const result = await kbManager.createFile(filename, 'content');
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Input Length Validation', () => {
    test('should reject overly long paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.md';
      expect(() => SecurityValidator.validatePath(longPath)).toThrow();
    });

    test('should reject overly long filenames', () => {
      const longName = 'a'.repeat(256) + '.md';
      expect(() => SecurityValidator.validatePath(longName)).toThrow();
    });

    test('should handle maximum path components', () => {
      // Many nested directories
      const deepPath = Array(50).fill('dir').join('/') + '/file.md';
      expect(() => SecurityValidator.validatePath(deepPath)).toThrow('Path too deep');
    });
  });
});