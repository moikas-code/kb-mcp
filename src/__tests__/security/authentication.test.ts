/**
 * Authentication Security Tests
 * Tests for authentication flows, JWT tokens, and MFA
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthManager } from '@cli/auth';
import { SecurityContext } from '@types/index';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';

describe('Authentication Security', () => {
  let authManager: AuthManager;
  const testUser = {
    username: 'testuser',
    password: 'TestPassword123!',
    mfa_secret: speakeasy.generateSecret().base32,
  };

  beforeEach(() => {
    authManager = new AuthManager();
  });

  afterEach(() => {
    // Clear any cached data
    authManager.clearCache?.();
  });

  describe('User Authentication', () => {
    test('should authenticate valid credentials', async () => {
      const result = await authManager.authenticate(testUser.username, testUser.password);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('token');
      expect(result.data).toHaveProperty('expires_at');
      expect(result.data).toHaveProperty('refresh_token');
    });

    test('should reject invalid username', async () => {
      const result = await authManager.authenticate('invaliduser', testUser.password);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    test('should reject invalid password', async () => {
      const result = await authManager.authenticate(testUser.username, 'wrongpassword');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    test('should handle empty credentials', async () => {
      const result1 = await authManager.authenticate('', testUser.password);
      expect(result1.success).toBe(false);
      
      const result2 = await authManager.authenticate(testUser.username, '');
      expect(result2.success).toBe(false);
    });

    test('should enforce password complexity', async () => {
      const weakPasswords = [
        'password',
        '12345678',
        'qwerty123',
        'Password',  // No numbers
        'password1', // No uppercase
        'PASSWORD1', // No lowercase
        'Pass1',     // Too short
      ];

      for (const password of weakPasswords) {
        const result = await authManager.setPassword(testUser.username, password);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Password does not meet complexity requirements');
      }
    });

    test('should accept strong passwords', async () => {
      const strongPasswords = [
        'StrongP@ssw0rd',
        'Complex1ty!sG00d',
        'MyS3cur3P@ssphrase',
        '!QAZ2wsx#EDC4rfv',
      ];

      for (const password of strongPasswords) {
        const result = await authManager.validatePasswordStrength(password);
        expect(result).toBe(true);
      }
    });
  });

  describe('JWT Token Management', () => {
    test('should generate valid JWT tokens', async () => {
      const authResult = await authManager.authenticate(testUser.username, testUser.password);
      expect(authResult.success).toBe(true);
      
      const token = authResult.data.token;
      const decoded = jwt.decode(token) as any;
      
      expect(decoded).toHaveProperty('sub', testUser.username);
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('jti'); // JWT ID for tracking
    });

    test('should verify valid tokens', async () => {
      const authResult = await authManager.authenticate(testUser.username, testUser.password);
      const token = authResult.data.token;
      
      const verifyResult = await authManager.verifyToken(token);
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.data).toHaveProperty('user_id');
      expect(verifyResult.data).toHaveProperty('permissions');
    });

    test('should reject expired tokens', async () => {
      // Create token with 1 second expiry
      const shortLivedToken = await authManager.generateToken(testUser.username, { expiresIn: '1s' });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const verifyResult = await authManager.verifyToken(shortLivedToken);
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toContain('Token expired');
    });

    test('should reject tampered tokens', async () => {
      const authResult = await authManager.authenticate(testUser.username, testUser.password);
      const token = authResult.data.token;
      
      // Tamper with token
      const parts = token.split('.');
      const payload = Buffer.from(parts[1], 'base64');
      payload[0] ^= 0xFF; // Flip bits
      parts[1] = payload.toString('base64').replace(/=/g, '');
      const tamperedToken = parts.join('.');
      
      const verifyResult = await authManager.verifyToken(tamperedToken);
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toContain('Invalid token');
    });

    test('should handle token refresh', async () => {
      const authResult = await authManager.authenticate(testUser.username, testUser.password);
      const refreshToken = authResult.data.refresh_token;
      
      const refreshResult = await authManager.refreshToken(refreshToken);
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.data).toHaveProperty('token');
      expect(refreshResult.data.token).not.toBe(authResult.data.token);
    });

    test('should invalidate tokens on logout', async () => {
      const authResult = await authManager.authenticate(testUser.username, testUser.password);
      const token = authResult.data.token;
      
      // Logout
      await authManager.logout(token);
      
      // Token should now be invalid
      const verifyResult = await authManager.verifyToken(token);
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toContain('Token revoked');
    });
  });

  describe('Multi-Factor Authentication', () => {
    test('should generate MFA secret', async () => {
      const result = await authManager.generateMFASecret(testUser.username);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('secret');
      expect(result.data).toHaveProperty('qr_code');
      expect(result.data).toHaveProperty('backup_codes');
      expect(result.data.backup_codes).toHaveLength(10);
    });

    test('should verify valid MFA token', async () => {
      const token = speakeasy.totp({
        secret: testUser.mfa_secret,
        encoding: 'base32',
      });
      
      const result = await authManager.verifyMFA(testUser.username, token);
      expect(result.success).toBe(true);
    });

    test('should reject invalid MFA token', async () => {
      const result = await authManager.verifyMFA(testUser.username, '000000');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid MFA token');
    });

    test('should handle MFA window tolerance', async () => {
      // Generate token for 30 seconds ago
      const pastToken = speakeasy.totp({
        secret: testUser.mfa_secret,
        encoding: 'base32',
        time: Date.now() / 1000 - 30,
      });
      
      // Should still be valid within window
      const result = await authManager.verifyMFA(testUser.username, pastToken);
      expect(result.success).toBe(true);
    });

    test('should verify backup codes', async () => {
      const mfaResult = await authManager.generateMFASecret(testUser.username);
      const backupCode = mfaResult.data.backup_codes[0];
      
      const result = await authManager.verifyBackupCode(testUser.username, backupCode);
      expect(result.success).toBe(true);
      
      // Same code should not work twice
      const result2 = await authManager.verifyBackupCode(testUser.username, backupCode);
      expect(result2.success).toBe(false);
    });

    test('should require MFA for sensitive operations', async () => {
      // Enable MFA for user
      await authManager.enableMFA(testUser.username, testUser.mfa_secret);
      
      // Try to authenticate without MFA
      const authResult = await authManager.authenticate(testUser.username, testUser.password);
      expect(authResult.success).toBe(true);
      expect(authResult.data).toHaveProperty('requires_mfa', true);
      expect(authResult.data).toHaveProperty('mfa_token'); // Temporary token
      
      // Complete authentication with MFA
      const mfaToken = speakeasy.totp({
        secret: testUser.mfa_secret,
        encoding: 'base32',
      });
      
      const completeResult = await authManager.completeMFAAuthentication(
        authResult.data.mfa_token,
        mfaToken
      );
      expect(completeResult.success).toBe(true);
      expect(completeResult.data).toHaveProperty('token');
    });
  });

  describe('Session Management', () => {
    test('should track active sessions', async () => {
      // Create multiple sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const result = await authManager.authenticate(testUser.username, testUser.password);
        sessions.push(result.data.session_id);
      }
      
      const activeSessions = await authManager.getActiveSessions(testUser.username);
      expect(activeSessions.length).toBe(3);
    });

    test('should enforce session limits', async () => {
      // Create max sessions
      for (let i = 0; i < 5; i++) {
        await authManager.authenticate(testUser.username, testUser.password);
      }
      
      // Next session should fail or revoke oldest
      const result = await authManager.authenticate(testUser.username, testUser.password);
      expect(result.success).toBe(true);
      
      const activeSessions = await authManager.getActiveSessions(testUser.username);
      expect(activeSessions.length).toBeLessThanOrEqual(5);
    });

    test('should handle session timeout', async () => {
      const authResult = await authManager.authenticate(testUser.username, testUser.password, {
        session_timeout: 1, // 1 second
      });
      
      const token = authResult.data.token;
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const verifyResult = await authManager.verifyToken(token);
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toContain('Session expired');
    });

    test('should revoke all sessions', async () => {
      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        await authManager.authenticate(testUser.username, testUser.password);
      }
      
      // Revoke all
      await authManager.revokeAllSessions(testUser.username);
      
      const activeSessions = await authManager.getActiveSessions(testUser.username);
      expect(activeSessions.length).toBe(0);
    });
  });

  describe('Brute Force Protection', () => {
    test('should lock account after failed attempts', async () => {
      const maxAttempts = 5;
      
      // Make failed attempts
      for (let i = 0; i < maxAttempts; i++) {
        await authManager.authenticate(testUser.username, 'wrongpassword');
      }
      
      // Next attempt should be locked
      const result = await authManager.authenticate(testUser.username, testUser.password);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Account locked');
    });

    test('should implement exponential backoff', async () => {
      const attempts = [];
      
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        await authManager.authenticate(testUser.username, 'wrongpassword');
        const duration = Date.now() - start;
        attempts.push(duration);
      }
      
      // Each attempt should take longer
      expect(attempts[1]).toBeGreaterThan(attempts[0]);
      expect(attempts[2]).toBeGreaterThan(attempts[1]);
    });

    test('should track failed attempts by IP', async () => {
      const context: SecurityContext = {
        user_id: 'unknown',
        session_id: 'none',
        ip_address: '192.168.1.100',
        user_agent: 'Test Agent',
        permissions: [],
        mfa_verified: false,
      };
      
      // Make failed attempts from same IP
      for (let i = 0; i < 10; i++) {
        await authManager.authenticate(`user${i}`, 'wrongpassword', { context });
      }
      
      // Should block IP
      const result = await authManager.authenticate('validuser', 'validpassword', { context });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many attempts from this IP');
    });
  });

  describe('Password Reset', () => {
    test('should generate password reset token', async () => {
      const result = await authManager.generatePasswordResetToken(testUser.username);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('token');
      expect(result.data).toHaveProperty('expires_at');
    });

    test('should reset password with valid token', async () => {
      const tokenResult = await authManager.generatePasswordResetToken(testUser.username);
      const resetToken = tokenResult.data.token;
      
      const newPassword = 'NewSecureP@ssw0rd';
      const resetResult = await authManager.resetPassword(resetToken, newPassword);
      
      expect(resetResult.success).toBe(true);
      
      // Should be able to login with new password
      const authResult = await authManager.authenticate(testUser.username, newPassword);
      expect(authResult.success).toBe(true);
    });

    test('should reject expired reset tokens', async () => {
      const tokenResult = await authManager.generatePasswordResetToken(testUser.username, {
        expiresIn: '1s',
      });
      const resetToken = tokenResult.data.token;
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const resetResult = await authManager.resetPassword(resetToken, 'NewPassword123!');
      expect(resetResult.success).toBe(false);
      expect(resetResult.error).toContain('Token expired');
    });

    test('should invalidate token after use', async () => {
      const tokenResult = await authManager.generatePasswordResetToken(testUser.username);
      const resetToken = tokenResult.data.token;
      
      // First use should succeed
      await authManager.resetPassword(resetToken, 'NewPassword123!');
      
      // Second use should fail
      const result = await authManager.resetPassword(resetToken, 'AnotherPassword123!');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Token already used');
    });
  });

  describe('API Key Authentication', () => {
    test('should generate API keys', async () => {
      const result = await authManager.generateAPIKey(testUser.username, {
        name: 'Test API Key',
        permissions: ['kb.read'],
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('key');
      expect(result.data).toHaveProperty('key_id');
      expect(result.data.key).toMatch(/^kb_[a-zA-Z0-9]{32}$/);
    });

    test('should authenticate with API key', async () => {
      const keyResult = await authManager.generateAPIKey(testUser.username, {
        name: 'Test Key',
        permissions: ['kb.read', 'kb.write'],
      });
      
      const apiKey = keyResult.data.key;
      const authResult = await authManager.authenticateAPIKey(apiKey);
      
      expect(authResult.success).toBe(true);
      expect(authResult.data).toHaveProperty('user_id');
      expect(authResult.data.permissions).toEqual(['kb.read', 'kb.write']);
    });

    test('should revoke API keys', async () => {
      const keyResult = await authManager.generateAPIKey(testUser.username, {
        name: 'Test Key',
      });
      
      const keyId = keyResult.data.key_id;
      await authManager.revokeAPIKey(keyId);
      
      // Should no longer authenticate
      const authResult = await authManager.authenticateAPIKey(keyResult.data.key);
      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain('Invalid or revoked API key');
    });

    test('should enforce API key permissions', async () => {
      const keyResult = await authManager.generateAPIKey(testUser.username, {
        name: 'Read Only Key',
        permissions: ['kb.read'],
      });
      
      const context = await authManager.authenticateAPIKey(keyResult.data.key);
      
      // Should have limited permissions
      expect(context.data.permissions).toEqual(['kb.read']);
      expect(context.data.permissions).not.toContain('kb.write');
    });
  });

  describe('OAuth Integration', () => {
    test('should generate OAuth authorization URL', () => {
      const url = authManager.generateOAuthURL('google', {
        redirect_uri: 'http://localhost:3000/callback',
        state: 'random-state',
      });
      
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=random-state');
    });

    test('should validate OAuth state parameter', async () => {
      const state = authManager.generateOAuthState();
      
      // Valid state
      const valid = await authManager.validateOAuthState(state);
      expect(valid).toBe(true);
      
      // Invalid state
      const invalid = await authManager.validateOAuthState('invalid-state');
      expect(invalid).toBe(false);
    });

    test('should handle OAuth callback', async () => {
      // Mock OAuth callback
      const result = await authManager.handleOAuthCallback('google', {
        code: 'mock-auth-code',
        state: authManager.generateOAuthState(),
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('token');
      expect(result.data).toHaveProperty('user');
    });
  });
});