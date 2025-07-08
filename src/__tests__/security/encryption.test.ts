/**
 * Encryption Security Tests
 * Tests for data encryption, key management, and cryptographic operations
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { EncryptionService, KBSecurityError } from '@core/security';
import { EncryptedData } from '@types/index';
import crypto from 'crypto';

describe('Encryption Security', () => {
  const testPassword = 'test-encryption-key-12345';
  const testData = 'Sensitive data that needs encryption';

  describe('AES-256-GCM Encryption', () => {
    test('should encrypt and decrypt data correctly', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      // Verify encrypted data structure
      expect(encrypted).toHaveProperty('algorithm', 'aes-256-gcm');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('auth_tag');
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('key_id');
      expect(encrypted).toHaveProperty('timestamp');
      
      // Verify data is actually encrypted
      expect(encrypted.ciphertext).not.toBe(testData);
      expect(encrypted.ciphertext).not.toContain(testData);
      
      // Decrypt and verify
      const decrypted = await EncryptionService.decrypt(encrypted, testPassword);
      expect(decrypted).toBe(testData);
    });

    test('should generate unique IVs for each encryption', async () => {
      const encrypted1 = await EncryptionService.encrypt(testData, testPassword);
      const encrypted2 = await EncryptionService.encrypt(testData, testPassword);
      
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    test('should fail decryption with wrong password', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      const wrongPassword = 'wrong-password';
      
      await expect(
        EncryptionService.decrypt(encrypted, wrongPassword)
      ).rejects.toThrow(KBSecurityError);
    });

    test('should fail decryption with tampered ciphertext', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      // Tamper with ciphertext
      const tampered = { ...encrypted };
      const ciphertextBuffer = Buffer.from(tampered.ciphertext, 'base64');
      ciphertextBuffer[0] ^= 0xFF; // Flip bits
      tampered.ciphertext = ciphertextBuffer.toString('base64');
      
      await expect(
        EncryptionService.decrypt(tampered, testPassword)
      ).rejects.toThrow(KBSecurityError);
    });

    test('should fail decryption with tampered auth tag', async () => {
      const encrypted = await EncryptionService.encrypt(testData, testPassword);
      
      // Tamper with auth tag
      const tampered = { ...encrypted };
      if (tampered.auth_tag) {
        const tagBuffer = Buffer.from(tampered.auth_tag, 'base64');
        tagBuffer[0] ^= 0xFF;
        tampered.auth_tag = tagBuffer.toString('base64');
      }
      
      await expect(
        EncryptionService.decrypt(tampered, testPassword)
      ).rejects.toThrow(KBSecurityError);
    });

    test('should handle large data encryption', async () => {
      const largeData = crypto.randomBytes(1024 * 1024).toString('base64'); // 1MB
      
      const encrypted = await EncryptionService.encrypt(largeData, testPassword);
      const decrypted = await EncryptionService.decrypt(encrypted, testPassword);
      
      expect(decrypted).toBe(largeData);
    });

    test('should handle special characters and unicode', async () => {
      const specialData = '🔐 Émojis & spëcial çharacters: <script>alert("test")</script>';
      
      const encrypted = await EncryptionService.encrypt(specialData, testPassword);
      const decrypted = await EncryptionService.decrypt(encrypted, testPassword);
      
      expect(decrypted).toBe(specialData);
    });
  });

  describe('Password Hashing', () => {
    test('should hash passwords with bcrypt', async () => {
      const password = 'SecurePassword123!';
      const hash = await EncryptionService.hashPassword(password);
      
      // Verify bcrypt format
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
      
      // Verify password
      const isValid = await EncryptionService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    test('should generate different hashes for same password', async () => {
      const password = 'SamePassword123!';
      const hash1 = await EncryptionService.hashPassword(password);
      const hash2 = await EncryptionService.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
      
      // Both should verify correctly
      expect(await EncryptionService.verifyPassword(password, hash1)).toBe(true);
      expect(await EncryptionService.verifyPassword(password, hash2)).toBe(true);
    });

    test('should reject wrong passwords', async () => {
      const password = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await EncryptionService.hashPassword(password);
      
      const isValid = await EncryptionService.verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    test('should handle long passwords', async () => {
      const longPassword = 'a'.repeat(72); // bcrypt max length
      const hash = await EncryptionService.hashPassword(longPassword);
      
      const isValid = await EncryptionService.verifyPassword(longPassword, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('Data Hashing', () => {
    test('should create consistent SHA-256 hashes', () => {
      const data = 'Test data for hashing';
      const hash1 = EncryptionService.hash(data);
      const hash2 = EncryptionService.hash(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should create different hashes for different data', () => {
      const data1 = 'Test data 1';
      const data2 = 'Test data 2';
      
      const hash1 = EncryptionService.hash(data1);
      const hash2 = EncryptionService.hash(data2);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty input', () => {
      const emptyHash = EncryptionService.hash('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('Token Generation', () => {
    test('should generate secure random tokens', () => {
      const token1 = EncryptionService.generateToken();
      const token2 = EncryptionService.generateToken();
      
      expect(token1).toHaveLength(64); // 32 bytes hex encoded
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should generate tokens of specified length', () => {
      const lengths = [16, 32, 64, 128];
      
      for (const length of lengths) {
        const token = EncryptionService.generateToken(length);
        expect(token).toHaveLength(length * 2); // Hex encoding doubles length
      }
    });

    test('should have sufficient entropy', () => {
      const tokens = new Set();
      const count = 1000;
      
      for (let i = 0; i < count; i++) {
        tokens.add(EncryptionService.generateToken(16));
      }
      
      // All tokens should be unique
      expect(tokens.size).toBe(count);
    });
  });

  describe('IP Anonymization', () => {
    test('should anonymize IPv4 addresses', () => {
      const tests = [
        { ip: '192.168.1.100', expected: '192.168.1.0' },
        { ip: '10.0.0.1', expected: '10.0.0.0' },
        { ip: '172.16.254.1', expected: '172.16.254.0' },
        { ip: '8.8.8.8', expected: '8.8.8.0' },
      ];
      
      for (const { ip, expected } of tests) {
        expect(EncryptionService.anonymizeIP(ip)).toBe(expected);
      }
    });

    test('should anonymize IPv6 addresses', () => {
      const tests = [
        { 
          ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', 
          expected: '2001:db8:85a3:0::' 
        },
        { 
          ip: 'fe80::1ff:fe23:4567:890a', 
          expected: 'fe80:0:0:1ff::' 
        },
      ];
      
      for (const { ip, expected } of tests) {
        expect(EncryptionService.anonymizeIP(ip)).toBe(expected);
      }
    });

    test('should handle invalid IPs', () => {
      const invalidIPs = ['not-an-ip', '', '999.999.999.999'];
      
      for (const ip of invalidIPs) {
        expect(EncryptionService.anonymizeIP(ip)).toBe('anonymous');
      }
    });
  });

  describe('PII Masking', () => {
    test('should mask PII data correctly', () => {
      const tests = [
        { data: '1234567890', showLast: 4, expected: '******7890' },
        { data: 'john.doe@example.com', showLast: 4, expected: '****************.com' },
        { data: '555-123-4567', showLast: 4, expected: '********4567' },
        { data: 'short', showLast: 4, expected: '*hort' },
      ];
      
      for (const { data, showLast, expected } of tests) {
        expect(EncryptionService.maskPII(data, showLast)).toBe(expected);
      }
    });

    test('should handle edge cases', () => {
      expect(EncryptionService.maskPII('', 4)).toBe('');
      expect(EncryptionService.maskPII('123', 4)).toBe('***');
      expect(EncryptionService.maskPII('12345', 0)).toBe('*****');
    });
  });

  describe('Key Derivation', () => {
    test('should derive consistent keys from passwords', async () => {
      // This test would require exposing the deriveKey method
      // For now, we test it indirectly through encryption
      const data = 'Test data';
      const password = 'consistent-password';
      
      const encrypted1 = await EncryptionService.encrypt(data, password, 'key1');
      const encrypted2 = await EncryptionService.encrypt(data, password, 'key1');
      
      // Different IVs but same key derivation
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      
      // Both should decrypt successfully
      const decrypted1 = await EncryptionService.decrypt(encrypted1, password);
      const decrypted2 = await EncryptionService.decrypt(encrypted2, password);
      
      expect(decrypted1).toBe(data);
      expect(decrypted2).toBe(data);
    });
  });

  describe('Timing Attack Resistance', () => {
    test('password verification should use constant-time comparison', async () => {
      const password = 'TestPassword123!';
      const hash = await EncryptionService.hashPassword(password);
      
      // Measure timing for correct vs incorrect passwords
      const iterations = 100;
      const correctTimes: number[] = [];
      const incorrectTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        // Correct password
        const start1 = process.hrtime.bigint();
        await EncryptionService.verifyPassword(password, hash);
        const end1 = process.hrtime.bigint();
        correctTimes.push(Number(end1 - start1));
        
        // Incorrect password (similar prefix)
        const start2 = process.hrtime.bigint();
        await EncryptionService.verifyPassword('TestPassword124!', hash);
        const end2 = process.hrtime.bigint();
        incorrectTimes.push(Number(end2 - start2));
      }
      
      // Times should be similar (constant-time comparison)
      const avgCorrect = correctTimes.reduce((a, b) => a + b) / iterations;
      const avgIncorrect = incorrectTimes.reduce((a, b) => a + b) / iterations;
      const difference = Math.abs(avgCorrect - avgIncorrect);
      
      // Difference should be minimal (bcrypt handles this)
      expect(difference).toBeLessThan(avgCorrect * 0.5);
    });
  });
});