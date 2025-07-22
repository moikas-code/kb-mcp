/**
 * Core Security Module
 * Implements input validation, encryption, and security controls
 * SOC2 Compliant
 */

import crypto from "crypto";
import { createHash, randomBytes } from "crypto";
// import CryptoJS from 'crypto-js';
import bcrypt from "bcrypt";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
import { KBError, EncryptedData, SecurityContext } from "../types/index.js";

// Security constants
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
// const TAG_LENGTH = 16;
const SALT_ROUNDS = 12;
const MAX_PATH_LENGTH = 255;
const ALLOWED_EXTENSIONS = [".md", ".markdown"];

// Path validation regex - allows more characters but still ensures safety
const SAFE_PATH_REGEX = /^[a-zA-Z0-9\-_/\s.()]+\.(md|markdown)$/;
const FORBIDDEN_PATTERNS = [
  /\.\./, // Directory traversal
  /~\//, // Home directory access
  /^\//, // Absolute paths
  /<script/i, // Script tags
  /javascript:/i, // JavaScript protocol
  /data:/i, // Data URLs
];

// Check for null bytes separately to avoid ESLint control character warning
const hasNullBytes = (str: string): boolean => str.includes("\x00");

/**
 * Security validator for input sanitization and validation
 */
export class SecurityValidator {
  /**
   * Validate and sanitize file paths
   */
  static validatePath(path: string): string {
    // Length check
    if (!path || path.length > MAX_PATH_LENGTH) {
      throw new KBSecurityError("Invalid path length", "INVALID_PATH_LENGTH");
    }

    // Remove any leading/trailing whitespace
    const trimmedPath = path.trim();

    // Check against forbidden patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(trimmedPath)) {
        throw new KBSecurityError(
          "Path contains forbidden pattern",
          "FORBIDDEN_PATH_PATTERN",
        );
      }
    }

    // Validate path format
    if (!SAFE_PATH_REGEX.test(trimmedPath)) {
      throw new KBSecurityError("Invalid path format", "INVALID_PATH_FORMAT");
    }

    // Normalize the path (remove double slashes, etc.)
    const normalizedPath = trimmedPath.split("/").filter(Boolean).join("/");

    // Ensure it has an allowed extension
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
      normalizedPath.endsWith(ext),
    );

    if (!hasValidExtension) {
      throw new KBSecurityError(
        "Invalid file extension",
        "INVALID_FILE_EXTENSION",
      );
    }

    return normalizedPath;
  }

  /**
   * Validate and sanitize content
   */
  static validateContent(content: string): string {
    if (!content) {
      return "";
    }

    // Check content size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (Buffer.byteLength(content, "utf8") > maxSize) {
      throw new KBSecurityError(
        "Content exceeds maximum size",
        "CONTENT_TOO_LARGE",
      );
    }

    // Sanitize HTML/XSS
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [], // No HTML tags in markdown
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    });

    // Check for malicious patterns
    const maliciousPatterns = [
      /<script[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // Event handlers
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.test(sanitized)) {
        throw new KBSecurityError(
          "Content contains potentially malicious code",
          "MALICIOUS_CONTENT",
        );
      }
    }

    return sanitized;
  }

  /**
   * Validate JSON data against schema
   */
  static validateJSON<T>(data: unknown, schema: z.ZodSchema<T>): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new KBSecurityError(
          `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
          "VALIDATION_ERROR",
        );
      }
      throw error;
    }
  }

  /**
   * Validate security context
   */
  static validateSecurityContext(context: unknown): SecurityContext {
    const schema = z.object({
      user_id: z.string().min(1).max(255),
      session_id: z.string().min(1).max(255),
      ip_address: z.string().ip(),
      user_agent: z.string().max(1000),
      permissions: z.array(z.string()),
      mfa_verified: z.boolean(),
    });

    return this.validateJSON(context, schema);
  }
}

/**
 * Encryption service for data protection
 */
export class EncryptionService {
  // private static keyCache = new Map<string, Buffer>();

  /**
   * Generate encryption key from password
   */
  private static async deriveKey(
    password: string,
    salt: Buffer,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        100000,
        KEY_LENGTH,
        "sha256",
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        },
      );
    });
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  static async encrypt(
    data: string,
    password: string,
    keyId?: string,
  ): Promise<EncryptedData> {
    try {
      // Generate random salt and IV
      const salt = randomBytes(16);
      const iv = randomBytes(IV_LENGTH);

      // Derive key
      const key = await this.deriveKey(password, salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(data, "utf8"),
        cipher.final(),
      ]);

      // Get auth tag
      const authTag = cipher.getAuthTag();

      return {
        algorithm: ENCRYPTION_ALGORITHM,
        iv: iv.toString("base64"),
        salt: salt.toString("base64"),
        auth_tag: authTag.toString("base64"),
        ciphertext: encrypted.toString("base64"),
        key_id: keyId || "default",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new KBSecurityError("Encryption failed", "ENCRYPTION_ERROR", error);
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  static async decrypt(
    encryptedData: EncryptedData,
    password: string,
  ): Promise<string> {
    try {
      // Decode from base64
      const iv = Buffer.from(encryptedData.iv, "base64");
      const salt = Buffer.from(encryptedData.salt, "base64");
      const authTag = Buffer.from(encryptedData.auth_tag || "", "base64");
      const ciphertext = Buffer.from(encryptedData.ciphertext, "base64");

      // Derive key using the stored salt
      const key = await this.deriveKey(password, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
      if (authTag.length > 0) {
        decipher.setAuthTag(authTag);
      }

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    } catch (error) {
      throw new KBSecurityError("Decryption failed", "DECRYPTION_ERROR", error);
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  static hash(data: string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate secure random token
   */
  static generateToken(length: number = 32): string {
    return randomBytes(length).toString("hex");
  }

  /**
   * Anonymize IP address for GDPR compliance
   */
  static anonymizeIP(ip: string): string {
    if (ip.includes(".")) {
      // IPv4: Keep first 3 octets
      const parts = ip.split(".");
      parts[3] = "0";
      return parts.join(".");
    } else if (ip.includes(":")) {
      // IPv6: Keep first 4 groups
      const parts = ip.split(":");
      return parts.slice(0, 4).join(":") + "::";
    }
    return "anonymous";
  }

  /**
   * Mask PII data
   */
  static maskPII(data: string, showLast: number = 4): string {
    if (data.length <= showLast) {
      return "*".repeat(data.length);
    }
    const masked = "*".repeat(data.length - showLast);
    return masked + data.slice(-showLast);
  }
}

/**
 * Rate limiting service
 */
export class RateLimiter {
  private static limiters = new Map<string, Map<string, number[]>>();

  /**
   * Check if request should be rate limited
   */
  static isRateLimited(
    identifier: string,
    resource: string,
    maxRequests: number,
    windowMs: number,
  ): boolean {
    const now = Date.now();
    const resourceLimiters = this.limiters.get(resource) || new Map();

    // Get timestamps for this identifier
    const timestamps = resourceLimiters.get(identifier) || [];

    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(
      (ts: number) => now - ts < windowMs,
    );

    // Check if limit exceeded
    if (validTimestamps.length >= maxRequests) {
      return true;
    }

    // Add current timestamp
    validTimestamps.push(now);
    resourceLimiters.set(identifier, validTimestamps);
    this.limiters.set(resource, resourceLimiters);

    return false;
  }

  /**
   * Clear rate limit data for an identifier
   */
  static clearRateLimit(identifier: string, resource?: string): void {
    if (resource) {
      const resourceLimiters = this.limiters.get(resource);
      resourceLimiters?.delete(identifier);
    } else {
      // Clear from all resources
      for (const [, resourceLimiters] of this.limiters) {
        resourceLimiters.delete(identifier);
      }
    }
  }
}

/**
 * Custom security error
 */
export class KBSecurityError extends Error implements KBError {
  code: string;
  statusCode: number;
  context?: Record<string, any>;
  isOperational: boolean = true;

  constructor(message: string, code: string, originalError?: any) {
    super(message);
    this.name = "KBSecurityError";
    this.code = code;
    this.statusCode = 403;

    if (originalError) {
      this.context = {
        originalError: originalError.message || originalError,
      };
    }
  }
}

/**
 * Input sanitization utilities
 */
export const Sanitizers = {
  /**
   * Sanitize filename
   */
  filename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\-_.]/g, "_")
      .replace(/_{2,}/g, "_")
      .substring(0, 255);
  },

  /**
   * Sanitize search query
   */
  searchQuery(query: string): string {
    return query.replace(/[<>]/g, "").substring(0, 1000).trim();
  },

  /**
   * Sanitize metadata values
   */
  metadata(value: any): any {
    if (typeof value === "string") {
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.metadata(v));
    }
    if (typeof value === "object" && value !== null) {
      const sanitized: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        sanitized[this.filename(k)] = this.metadata(v);
      }
      return sanitized;
    }
    return value;
  },
};
