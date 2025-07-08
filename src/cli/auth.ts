/**
 * Authentication Manager for CLI
 * Handles user authentication, sessions, and API keys
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import inquirer from 'inquirer';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { SecurityContext, Result } from '@types/index.js';
import { EncryptionService, SecurityValidator } from '@core/security.js';

interface AuthSession {
  context: SecurityContext;
  token: string;
  refreshToken: string;
  expiresAt: number;
  expired: boolean;
}

interface StoredCredentials {
  username: string;
  hashedPassword: string;
  apiKeys: ApiKey[];
  mfaSecret?: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  hashedKey: string;
  permissions: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
}

/**
 * Authentication manager implementation
 */
export class AuthManager {
  private configDir: string;
  private sessionFile: string;
  private credentialsFile: string;
  private jwtSecret: string;

  constructor() {
    // Use OS-specific config directory
    this.configDir = path.join(os.homedir(), '.kb-manager');
    this.sessionFile = path.join(this.configDir, 'session.json');
    this.credentialsFile = path.join(this.configDir, 'credentials.enc');
    
    // Require JWT secret to be configured
    const jwtSecret = process.env.KB_JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('KB_JWT_SECRET environment variable is required for secure operation');
    }
    
    if (jwtSecret.length < 32) {
      throw new Error('KB_JWT_SECRET must be at least 32 characters long');
    }
    
    this.jwtSecret = jwtSecret;
  }

  /**
   * Initialize auth system
   */
  async initialize(): Promise<void> {
    // Create config directory
    await fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    
    // Set restrictive permissions on files
    try {
      await fs.chmod(this.configDir, 0o700);
    } catch {
      // Windows may not support chmod
    }
  }

  /**
   * Authenticate user
   */
  async authenticate(
    username: string,
    password: string,
    mfaCode?: string
  ): Promise<Result<AuthSession>> {
    try {
      // Validate inputs
      if (!username || !password) {
        return {
          success: false,
          error: {
            name: 'ValidationError',
            message: 'Username and password are required',
            code: 'INVALID_CREDENTIALS',
            statusCode: 400,
            isOperational: true,
          }
        };
      }

      // Load stored credentials
      const credentials = await this.loadCredentials();
      
      // For demo, accept default credentials
      // In production, check against database
      if (!credentials) {
        // First time setup - create default admin
        if (username === 'admin' && password === 'changeme') {
          await this.createDefaultAdmin();
        } else {
          return {
            success: false,
            error: {
              name: 'AuthenticationError',
              message: 'Invalid credentials',
              code: 'INVALID_CREDENTIALS',
              statusCode: 401,
              isOperational: true,
            }
          };
        }
      } else {
        // Verify password
        const isValid = await EncryptionService.verifyPassword(
          password,
          credentials.hashedPassword
        );
        
        if (!isValid || credentials.username !== username) {
          return {
            success: false,
            error: {
              name: 'AuthenticationError',
              message: 'Invalid credentials',
              code: 'INVALID_CREDENTIALS',
              statusCode: 401,
              isOperational: true,
            }
          };
        }
        
        // Verify MFA if required
        if (credentials.mfaSecret && !this.verifyMFA(mfaCode || '', credentials.mfaSecret)) {
          return {
            success: false,
            error: {
              name: 'AuthenticationError',
              message: 'Invalid MFA code',
              code: 'INVALID_MFA',
              statusCode: 401,
              isOperational: true,
            }
          };
        }
      }

      // Create session
      const session = await this.createSession(username);
      
      // Save session
      await this.saveSession(session);
      
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'AuthenticationError',
          message: `Authentication failed: ${error}`,
          code: 'AUTH_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Authenticate with API key
   */
  async authenticateApiKey(apiKey: string): Promise<Result<AuthSession>> {
    try {
      // Load credentials
      const credentials = await this.loadCredentials();
      if (!credentials) {
        return {
          success: false,
          error: {
            name: 'AuthenticationError',
            message: 'No API keys configured',
            code: 'NO_API_KEYS',
            statusCode: 401,
            isOperational: true,
          }
        };
      }

      // Find matching API key
      const hashedKey = EncryptionService.hash(apiKey);
      const apiKeyRecord = credentials.apiKeys.find(k => k.hashedKey === hashedKey);
      
      if (!apiKeyRecord) {
        return {
          success: false,
          error: {
            name: 'AuthenticationError',
            message: 'Invalid API key',
            code: 'INVALID_API_KEY',
            statusCode: 401,
            isOperational: true,
          }
        };
      }

      // Check expiration
      if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
        return {
          success: false,
          error: {
            name: 'AuthenticationError',
            message: 'API key expired',
            code: 'API_KEY_EXPIRED',
            statusCode: 401,
            isOperational: true,
          }
        };
      }

      // Update last used
      apiKeyRecord.lastUsed = new Date().toISOString();
      await this.saveCredentials(credentials);

      // Create session
      const session = await this.createSession(`api-key:${apiKeyRecord.name}`, apiKeyRecord.permissions);
      
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'AuthenticationError',
          message: `API key authentication failed: ${error}`,
          code: 'API_KEY_AUTH_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  /**
   * Get current session
   */
  async getSession(): Promise<AuthSession | null> {
    try {
      const data = await fs.readFile(this.sessionFile, 'utf8');
      const session = JSON.parse(data) as AuthSession;
      
      // Check expiration
      session.expired = Date.now() > session.expiresAt;
      
      // Verify token
      if (!session.expired) {
        try {
          jwt.verify(session.token, this.jwtSecret);
        } catch {
          session.expired = true;
        }
      }
      
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Login interactively
   */
  async login(options: any): Promise<void> {
    try {
      let username = options.username;
      let password = options.password;
      
      // Interactive prompts if not provided
      if (!username) {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Username:',
            validate: (input) => input.length > 0,
          },
        ]);
        username = answer.username;
      }
      
      if (!password && !options.apiKey) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            mask: '*',
            validate: (input) => input.length > 0,
          },
        ]);
        password = answer.password;
      }
      
      // API key authentication
      if (options.apiKey) {
        const apiKeyAnswer = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'API Key:',
            mask: '*',
            validate: (input) => input.length > 0,
          },
        ]);
        
        const result = await this.authenticateApiKey(apiKeyAnswer.apiKey);
        if (!result.success) {
          console.error(chalk.red('Authentication failed:'), result.error.message);
          process.exit(1);
        }
        
        console.log(chalk.green('✓ Authenticated successfully with API key'));
        return;
      }
      
      // Regular authentication
      const result = await this.authenticate(username, password, options.mfa);
      
      if (!result.success) {
        // Check if MFA is required
        if (result.error.code === 'INVALID_MFA') {
          const mfaAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'mfaCode',
              message: 'MFA Code:',
              validate: (input) => /^\d{6}$/.test(input),
            },
          ]);
          
          const retryResult = await this.authenticate(username, password, mfaAnswer.mfaCode);
          if (!retryResult.success) {
            console.error(chalk.red('Authentication failed:'), retryResult.error.message);
            process.exit(1);
          }
        } else {
          console.error(chalk.red('Authentication failed:'), result.error.message);
          process.exit(1);
        }
      }
      
      console.log(chalk.green('✓ Authenticated successfully'));
      console.log(chalk.gray('Session expires:'), new Date(result.data!.expiresAt));
    } catch (error) {
      console.error(chalk.red('Login failed:'), error);
      process.exit(1);
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await fs.unlink(this.sessionFile);
    } catch {
      // Session file might not exist
    }
  }

  /**
   * Create API key
   */
  async createApiKey(
    name: string,
    permissions: string[],
    expiresInDays?: number
  ): Promise<Result<{ key: string; id: string }>> {
    try {
      // Generate secure API key
      const key = EncryptionService.generateToken(32);
      const hashedKey = EncryptionService.hash(key);
      
      // Load credentials
      const credentials = await this.loadCredentials();
      if (!credentials) {
        return {
          success: false,
          error: {
            name: 'ConfigError',
            message: 'No credentials configured',
            code: 'NO_CREDENTIALS',
            statusCode: 500,
            isOperational: true,
          }
        };
      }
      
      // Create API key record
      const apiKey: ApiKey = {
        id: uuidv4(),
        name,
        key: key.substring(0, 8) + '...',  // Store partial for display
        hashedKey,
        permissions,
        createdAt: new Date().toISOString(),
        expiresAt: expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
      };
      
      // Add to credentials
      credentials.apiKeys.push(apiKey);
      await this.saveCredentials(credentials);
      
      return {
        success: true,
        data: {
          key: `kb_${key}`,  // Prefixed for easy identification
          id: apiKey.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ApiKeyError',
          message: `Failed to create API key: ${error}`,
          code: 'API_KEY_CREATE_ERROR',
          statusCode: 500,
          isOperational: true,
        }
      };
    }
  }

  // Private helper methods

  private async createSession(
    userId: string,
    permissions?: string[]
  ): Promise<AuthSession> {
    const sessionId = uuidv4();
    const now = Date.now();
    const expiresIn = 3600000; // 1 hour
    
    const context: SecurityContext = {
      user_id: userId,
      session_id: sessionId,
      ip_address: '127.0.0.1',  // In production, get real IP
      user_agent: 'kb-cli/1.0.0',
      permissions: permissions || ['kb.read', 'kb.write', 'kb.delete'],
      mfa_verified: true,
    };
    
    const token = jwt.sign(
      {
        sub: userId,
        sid: sessionId,
        permissions: context.permissions,
      },
      this.jwtSecret,
      {
        expiresIn: '1h',
        issuer: 'kb-manager',
      }
    );
    
    const refreshToken = jwt.sign(
      { sub: userId, sid: sessionId },
      this.jwtSecret,
      {
        expiresIn: '7d',
        issuer: 'kb-manager',
      }
    );
    
    return {
      context,
      token,
      refreshToken,
      expiresAt: now + expiresIn,
      expired: false,
    };
  }

  private async saveSession(session: AuthSession): Promise<void> {
    await this.initialize();
    const data = JSON.stringify(session, null, 2);
    await fs.writeFile(this.sessionFile, data, { mode: 0o600 });
  }

  private async loadCredentials(): Promise<StoredCredentials | null> {
    try {
      const encrypted = await fs.readFile(this.credentialsFile, 'utf8');
      
      // Decrypt credentials
      // In production, use hardware security module
      const decrypted = await EncryptionService.decrypt(
        JSON.parse(encrypted),
        this.getCredentialKey()
      );
      
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  private async saveCredentials(credentials: StoredCredentials): Promise<void> {
    await this.initialize();
    
    // Encrypt credentials
    const encrypted = await EncryptionService.encrypt(
      JSON.stringify(credentials),
      this.getCredentialKey(),
      'credentials'
    );
    
    await fs.writeFile(
      this.credentialsFile,
      JSON.stringify(encrypted),
      { mode: 0o600 }
    );
  }

  private async createDefaultAdmin(): Promise<void> {
    // Force user to create secure credentials during setup
    console.log(chalk.blue('🔒 Setting up secure admin account...'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Enter admin username:',
        validate: (input: string) => {
          if (!input || input.length < 3) {
            return 'Username must be at least 3 characters long';
          }
          return true;
        }
      },
      {
        type: 'password',
        name: 'password',
        message: 'Enter admin password:',
        mask: '*',
        validate: (input: string) => {
          if (!input || input.length < 8) {
            return 'Password must be at least 8 characters long';
          }
          if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(input)) {
            return 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character';
          }
          return true;
        }
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm admin password:',
        mask: '*',
        validate: (input: string, answers: any) => {
          if (input !== answers.password) {
            return 'Passwords do not match';
          }
          return true;
        }
      }
    ]);
    
    const hashedPassword = await EncryptionService.hashPassword(answers.password);
    
    // Generate MFA secret
    const mfaSecret = this.generateSecret();
    
    const credentials: StoredCredentials = {
      username: answers.username,
      hashedPassword,
      apiKeys: [],
      mfaSecret,
    };
    
    await this.saveCredentials(credentials);
    
    // Display MFA QR code
    const otpauth = speakeasy.otpauthURL({
      secret: mfaSecret,
      label: answers.username,
      issuer: 'Secure KB Manager',
      encoding: 'base32',
    });
    
    console.log(chalk.green('✅ Admin account created successfully!'));
    console.log(chalk.blue('📱 Set up MFA by scanning this QR code:'));
    console.log(await qrcode.toString(otpauth, { type: 'terminal' }));
    console.log(chalk.yellow('Or manually enter this secret in your authenticator app:'));
    console.log(chalk.yellow(mfaSecret));
  }

  private verifyMFA(code: string, secret: string): boolean {
    if (!code || !secret) {
      return false;
    }
    
    // Use speakeasy to verify TOTP code
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 time steps of drift
    });
    
    return verified;
  }

  private generateSecret(): string {
    return speakeasy.generateSecret({
      name: 'KB Manager',
      issuer: 'Secure KB Manager',
      length: 32,
    }).base32;
  }

  private getCredentialKey(): string {
    const key = process.env.KB_CREDENTIAL_KEY;
    if (!key) {
      throw new Error('KB_CREDENTIAL_KEY environment variable is required for secure operation');
    }
    
    // Validate key meets minimum security requirements
    if (key.length < 32) {
      throw new Error('KB_CREDENTIAL_KEY must be at least 32 characters long');
    }
    
    return key;
  }
}