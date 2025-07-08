/**
 * Rate Limiting Security Tests
 * Tests for rate limiting, DDoS protection, and throttling
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { RateLimiter } from '@core/rate-limiter';
import { SecurityContext } from '@types/index';

describe('Rate Limiting Security', () => {
  let rateLimiter: RateLimiter;
  let testContext: SecurityContext;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      default: {
        requests_per_minute: 60,
        requests_per_hour: 1000,
        burst_size: 10,
      },
      endpoints: {
        '/api/auth/login': {
          requests_per_minute: 5,
          requests_per_hour: 20,
          penalty_duration: 300, // 5 minutes
        },
        '/api/kb/write': {
          requests_per_minute: 30,
          requests_per_hour: 500,
        },
        '/api/kb/read': {
          requests_per_minute: 100,
          requests_per_hour: 2000,
        },
      },
      ip_based: true,
      user_based: true,
    });

    testContext = {
      user_id: 'test-user',
      session_id: 'test-session',
      ip_address: '192.168.1.100',
      user_agent: 'Test Agent',
      permissions: ['kb.read', 'kb.write'],
      mfa_verified: true,
    };
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  describe('Basic Rate Limiting', () => {
    test('should allow requests within limit', async () => {
      const endpoint = '/api/kb/read';
      const limit = 100; // per minute
      
      for (let i = 0; i < limit; i++) {
        const result = await rateLimiter.checkLimit(endpoint, testContext);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - i - 1);
      }
    });

    test('should block requests exceeding limit', async () => {
      const endpoint = '/api/auth/login';
      const limit = 5; // per minute
      
      // Exhaust limit
      for (let i = 0; i < limit; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      // Next request should be blocked
      const result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retry_after).toBeGreaterThan(0);
    });

    test('should reset limits after time window', async () => {
      const endpoint = '/api/kb/write';
      
      // Exhaust limit
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      // Should be blocked
      let result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.allowed).toBe(false);
      
      // Simulate time passing (1 minute)
      await rateLimiter.advanceTime(60000);
      
      // Should be allowed again
      result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.allowed).toBe(true);
    });

    test('should track limits per endpoint', async () => {
      // Use different endpoints
      const readResult = await rateLimiter.checkLimit('/api/kb/read', testContext);
      const writeResult = await rateLimiter.checkLimit('/api/kb/write', testContext);
      
      expect(readResult.remaining).toBe(99); // 100 - 1
      expect(writeResult.remaining).toBe(29); // 30 - 1
    });
  });

  describe('IP-Based Limiting', () => {
    test('should limit by IP address', async () => {
      const endpoint = '/api/kb/read';
      const contexts = [
        { ...testContext, user_id: 'user1' },
        { ...testContext, user_id: 'user2' },
        { ...testContext, user_id: 'user3' },
      ];
      
      // All from same IP
      for (const ctx of contexts) {
        await rateLimiter.checkLimit(endpoint, ctx);
      }
      
      // Should count against same IP limit
      const result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.remaining).toBe(96); // 100 - 4
    });

    test('should track different IPs separately', async () => {
      const endpoint = '/api/kb/write';
      const context1 = { ...testContext, ip_address: '192.168.1.100' };
      const context2 = { ...testContext, ip_address: '192.168.1.101' };
      
      // Use limit for first IP
      for (let i = 0; i < 30; i++) {
        await rateLimiter.checkLimit(endpoint, context1);
      }
      
      // Second IP should still have full limit
      const result = await rateLimiter.checkLimit(endpoint, context2);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(29);
    });

    test('should detect and block IP flooding', async () => {
      const contexts = [];
      
      // Create many users from same IP
      for (let i = 0; i < 100; i++) {
        contexts.push({
          ...testContext,
          user_id: `flood-user-${i}`,
          session_id: `flood-session-${i}`,
        });
      }
      
      // Rapid requests from same IP
      let blocked = 0;
      for (const ctx of contexts) {
        const result = await rateLimiter.checkLimit('/api/kb/read', ctx);
        if (!result.allowed) blocked++;
      }
      
      expect(blocked).toBeGreaterThan(0);
    });
  });

  describe('User-Based Limiting', () => {
    test('should limit by user ID', async () => {
      const endpoint = '/api/kb/write';
      const contexts = [
        { ...testContext, ip_address: '10.0.0.1' },
        { ...testContext, ip_address: '10.0.0.2' },
        { ...testContext, ip_address: '10.0.0.3' },
      ];
      
      // Same user from different IPs
      for (const ctx of contexts) {
        await rateLimiter.checkLimit(endpoint, ctx);
      }
      
      // Should count against same user limit
      const result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.remaining).toBeLessThan(30);
    });

    test('should apply stricter limits to unauthenticated users', async () => {
      const endpoint = '/api/kb/read';
      const anonContext = {
        ...testContext,
        user_id: 'anonymous',
        permissions: [],
      };
      
      // Anonymous users get stricter limits
      const anonLimit = 20; // vs 100 for authenticated
      
      for (let i = 0; i < anonLimit; i++) {
        const result = await rateLimiter.checkLimit(endpoint, anonContext);
        expect(result.allowed).toBe(true);
      }
      
      const result = await rateLimiter.checkLimit(endpoint, anonContext);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Burst Protection', () => {
    test('should allow burst within limit', async () => {
      const endpoint = '/api/kb/read';
      const burstSize = 10;
      
      // Rapid burst
      const start = Date.now();
      for (let i = 0; i < burstSize; i++) {
        const result = await rateLimiter.checkLimit(endpoint, testContext);
        expect(result.allowed).toBe(true);
      }
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should be fast
    });

    test('should throttle after burst', async () => {
      const endpoint = '/api/kb/write';
      const burstSize = 10;
      
      // Exhaust burst
      for (let i = 0; i < burstSize; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      // Measure time for next requests
      const delays = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await rateLimiter.checkLimit(endpoint, testContext);
        delays.push(Date.now() - start);
      }
      
      // Should see increasing delays (throttling)
      expect(delays[4]).toBeGreaterThan(delays[0]);
    });
  });

  describe('Distributed Rate Limiting', () => {
    test('should sync limits across instances', async () => {
      // Create two rate limiter instances (simulating different servers)
      const limiter1 = new RateLimiter({ 
        redis: { host: 'localhost', port: 6379 },
      });
      const limiter2 = new RateLimiter({ 
        redis: { host: 'localhost', port: 6379 },
      });
      
      const endpoint = '/api/kb/write';
      
      // Use limit on first instance
      for (let i = 0; i < 15; i++) {
        await limiter1.checkLimit(endpoint, testContext);
      }
      
      // Second instance should see the usage
      const result = await limiter2.checkLimit(endpoint, testContext);
      expect(result.remaining).toBe(14); // 30 - 16
    });

    test('should handle Redis failures gracefully', async () => {
      const limiter = new RateLimiter({
        redis: { host: 'invalid-host', port: 6379 },
        fallback_to_local: true,
      });
      
      // Should fall back to local limiting
      const result = await limiter.checkLimit('/api/kb/read', testContext);
      expect(result.allowed).toBe(true);
      expect(result.mode).toBe('local');
    });
  });

  describe('Penalty System', () => {
    test('should apply penalties for violations', async () => {
      const endpoint = '/api/auth/login';
      
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      // Trigger penalty
      await rateLimiter.checkLimit(endpoint, testContext);
      
      // Check penalty duration
      const result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.allowed).toBe(false);
      expect(result.retry_after).toBeGreaterThanOrEqual(300); // 5 minutes
    });

    test('should escalate penalties for repeat offenders', async () => {
      const endpoint = '/api/auth/login';
      
      // First violation
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      // Wait for reset
      await rateLimiter.advanceTime(60000);
      
      // Second violation
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      // Should have longer penalty
      const result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.retry_after).toBeGreaterThan(300);
    });

    test('should blacklist repeat severe violators', async () => {
      const endpoint = '/api/auth/login';
      
      // Multiple violations
      for (let violation = 0; violation < 5; violation++) {
        // Exhaust limit
        for (let i = 0; i < 10; i++) {
          await rateLimiter.checkLimit(endpoint, testContext);
        }
        
        // Wait for reset
        await rateLimiter.advanceTime(60000);
      }
      
      // Should be blacklisted
      const result = await rateLimiter.checkLimit(endpoint, testContext);
      expect(result.allowed).toBe(false);
      expect(result.blacklisted).toBe(true);
      expect(result.retry_after).toBe(null); // Permanent until manual review
    });
  });

  describe('Custom Rules', () => {
    test('should apply custom rate limit rules', async () => {
      rateLimiter.addRule({
        name: 'api_key_higher_limit',
        condition: (context) => context.api_key !== undefined,
        limits: {
          requests_per_minute: 200,
          requests_per_hour: 5000,
        },
      });
      
      const apiContext = {
        ...testContext,
        api_key: 'test-api-key',
      };
      
      // Should get higher limit
      const result = await rateLimiter.checkLimit('/api/kb/read', apiContext);
      expect(result.limit).toBe(200);
    });

    test('should apply geo-based limits', async () => {
      rateLimiter.addRule({
        name: 'high_risk_country_limit',
        condition: (context) => {
          const highRiskCountries = ['XX', 'YY'];
          return highRiskCountries.includes(context.country_code || '');
        },
        limits: {
          requests_per_minute: 10,
          requests_per_hour: 100,
        },
      });
      
      const riskyContext = {
        ...testContext,
        country_code: 'XX',
      };
      
      // Should get stricter limit
      const result = await rateLimiter.checkLimit('/api/kb/write', riskyContext);
      expect(result.limit).toBe(10);
    });

    test('should bypass limits for whitelisted IPs', async () => {
      rateLimiter.addWhitelist(['192.168.1.100', '10.0.0.0/8']);
      
      const endpoint = '/api/kb/write';
      
      // Make many requests
      for (let i = 0; i < 100; i++) {
        const result = await rateLimiter.checkLimit(endpoint, testContext);
        expect(result.allowed).toBe(true);
        expect(result.whitelisted).toBe(true);
      }
    });
  });

  describe('Monitoring and Metrics', () => {
    test('should track rate limit metrics', async () => {
      const metrics = rateLimiter.getMetrics();
      
      // Make some requests
      await rateLimiter.checkLimit('/api/kb/read', testContext);
      await rateLimiter.checkLimit('/api/kb/write', testContext);
      
      // Check metrics
      const newMetrics = rateLimiter.getMetrics();
      expect(newMetrics.total_requests).toBe(metrics.total_requests + 2);
      expect(newMetrics.allowed_requests).toBe(metrics.allowed_requests + 2);
    });

    test('should track violations by endpoint', async () => {
      const endpoint = '/api/auth/login';
      
      // Cause violations
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(endpoint, testContext);
      }
      
      const metrics = rateLimiter.getMetrics();
      expect(metrics.violations_by_endpoint[endpoint]).toBeGreaterThan(0);
    });

    test('should emit events for violations', async () => {
      const violations: any[] = [];
      rateLimiter.on('violation', (event) => violations.push(event));
      
      // Exhaust limit
      for (let i = 0; i < 6; i++) {
        await rateLimiter.checkLimit('/api/auth/login', testContext);
      }
      
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatchObject({
        endpoint: '/api/auth/login',
        user_id: 'test-user',
        ip_address: '192.168.1.100',
      });
    });
  });

  describe('Integration with Other Systems', () => {
    test('should integrate with authentication system', async () => {
      // Simulate failed login attempts
      const loginEndpoint = '/api/auth/login';
      const failedContext = {
        ...testContext,
        auth_status: 'failed',
      };
      
      // Failed attempts should count double
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(loginEndpoint, failedContext);
      }
      
      const result = await rateLimiter.checkLimit(loginEndpoint, failedContext);
      expect(result.allowed).toBe(false); // Should be blocked after 3 failed attempts
    });

    test('should adjust limits based on user reputation', async () => {
      rateLimiter.addRule({
        name: 'reputation_based',
        condition: (context) => true,
        limits: (context) => {
          const reputation = context.user_reputation || 0;
          return {
            requests_per_minute: 60 + reputation * 10,
            requests_per_hour: 1000 + reputation * 100,
          };
        },
      });
      
      const trustedContext = {
        ...testContext,
        user_reputation: 5,
      };
      
      const result = await rateLimiter.checkLimit('/api/kb/write', trustedContext);
      expect(result.limit).toBe(110); // 60 + 5 * 10
    });
  });
});