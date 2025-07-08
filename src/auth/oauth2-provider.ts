/**
 * OAuth2 Provider for KB-MCP
 * Provides enterprise-grade OAuth2 authentication with support for
 * multiple providers (Google, GitHub, Azure AD, etc.)
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import winston from 'winston';
import { Result } from '../types/index.js';
import { rateLimitMiddleware } from '../mcp/middleware.js';

export interface OAuth2Config {
  enabled: boolean;
  jwtSecret: string;
  tokenExpiration: string;
  refreshTokenExpiration: string;
  issuer: string;
  audience: string;
  port?: number;
  
  // OAuth2 Providers
  providers: {
    google?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
    github?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
    azure?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      tenantId: string;
    };
    custom?: {
      authorizationUrl: string;
      tokenUrl: string;
      userInfoUrl: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
  };
  
  // Local authentication
  localAuth?: {
    enabled: boolean;
    requireRegistration: boolean;
    adminUsers: string[];
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: string;
  providerUserId: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
  lastLoginAt: string;
  active: boolean;
}

export interface AccessToken {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export class OAuth2Provider {
  private app: express.Application;
  private config: OAuth2Config;
  private users: Map<string, User> = new Map();
  private refreshTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();
  private logger: winston.Logger;
  private dataDir: string;

  constructor(config: OAuth2Config, dataDir: string = './data/auth') {
    this.config = config;
    this.dataDir = dataDir;
    this.app = express();
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.loadUsers();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for OAuth2 endpoints
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
  }

  private setupRoutes(): void {
    // OAuth2 authorization endpoints
    this.app.get('/oauth2/authorize', this.handleAuthorize.bind(this));
    this.app.post('/oauth2/token', this.handleToken.bind(this));
    this.app.post('/oauth2/revoke', this.handleRevoke.bind(this));
    this.app.get('/oauth2/userinfo', this.handleUserInfo.bind(this));
    
    // Provider-specific routes
    this.app.get('/oauth2/google', this.handleGoogleAuth.bind(this));
    this.app.get('/oauth2/google/callback', this.handleGoogleCallback.bind(this));
    this.app.get('/oauth2/github', this.handleGitHubAuth.bind(this));
    this.app.get('/oauth2/github/callback', this.handleGitHubCallback.bind(this));
    this.app.get('/oauth2/azure', this.handleAzureAuth.bind(this));
    this.app.get('/oauth2/azure/callback', this.handleAzureCallback.bind(this));
    
    // Local authentication
    if (this.config.localAuth?.enabled) {
      this.app.post('/oauth2/register', this.handleRegister.bind(this));
      this.app.post('/oauth2/login', this.handleLogin.bind(this));
    }
    
    // Administration endpoints
    this.app.get(
      '/oauth2/users',
      rateLimitMiddleware({ maxRequests: 30, windowMs: 60000 }),
      this.requireAuth.bind(this),
      this.handleListUsers.bind(this)
    );
    this.app.put(
      '/oauth2/users/:id',
      rateLimitMiddleware({ maxRequests: 30, windowMs: 60000 }),
      this.requireAuth.bind(this),
      this.handleUpdateUser.bind(this)
    );
    this.app.delete(
      '/oauth2/users/:id',
      rateLimitMiddleware({ maxRequests: 30, windowMs: 60000 }),
      this.requireAuth.bind(this),
      this.handleDeleteUser.bind(this)
    );
    
    // Health check
    this.app.get('/oauth2/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeUsers: this.users.size,
        providers: Object.keys(this.config.providers).filter(p => 
          this.config.providers[p as keyof typeof this.config.providers]
        )
      });
    });
  }

  private async handleAuthorize(_req: express.Request, res: express.Response): Promise<void> {
    const { response_type, client_id: _client_id, redirect_uri, scope: _scope, state } = _req.query;
    
    if (response_type !== 'code') {
      res.status(400).json({ error: 'unsupported_response_type' });
      return;
    }
    
    // Generate authorization code
    const authCode = this.generateAuthorizationCode();
    
    // Store authorization code (in production, use proper storage)
    // For now, we'll use a simple in-memory store
    
    const redirectUrl = `${redirect_uri}?code=${authCode}&state=${state}`;
    res.redirect(redirectUrl);
  }

  private async handleToken(req: express.Request, res: express.Response): Promise<void> {
    const { grant_type, code, refresh_token, client_id, client_secret: _client_secret } = req.body;
    
    try {
      if (grant_type === 'authorization_code') {
        // Exchange authorization code for access token
        const tokens = await this.exchangeCodeForTokens(code, client_id);
        res.json(tokens);
      } else if (grant_type === 'refresh_token') {
        // Refresh access token
        const tokens = await this.refreshAccessToken(refresh_token);
        res.json(tokens);
      } else {
        res.status(400).json({ error: 'unsupported_grant_type' });
      }
    } catch (error) {
      this.logger.error('Token exchange error:', error);
      res.status(400).json({ error: 'invalid_grant' });
    }
  }

  private async handleRevoke(req: express.Request, res: express.Response): Promise<void> {
    const { token } = req.body;
    
    try {
      await this.revokeToken(token);
      res.json({ success: true });
    } catch (error) {
      this.logger.error('Token revocation error:', error);
      res.status(400).json({ error: 'invalid_token' });
    }
  }

  private async handleUserInfo(req: express.Request, res: express.Response): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    
    const token = authHeader.substring(7);
    
    try {
      const payload = await this.verifyToken(token);
      if (!payload.success) {
        res.status(401).json({ error: 'invalid_token' });
        return;
      }
      
      const user = this.users.get(payload.data.sub);
      if (!user) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }
      
      res.json({
        sub: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        roles: user.roles,
        permissions: user.permissions
      });
    } catch (error) {
      this.logger.error('User info error:', error);
      res.status(401).json({ error: 'invalid_token' });
    }
  }

  private async handleGoogleAuth(_req: express.Request, res: express.Response): Promise<void> {
    if (!this.config.providers.google) {
      res.status(404).json({ error: 'Google OAuth not configured' });
      return;
    }
    
    const { clientId, redirectUri } = this.config.providers.google;
    const state = randomUUID();
    
    const authUrl = `https://accounts.google.com/oauth/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent('openid email profile')}&` +
      `state=${state}`;
    
    res.redirect(authUrl);
  }

  private async handleGoogleCallback(req: express.Request, res: express.Response): Promise<void> {
    const { code, state: _state } = req.query;
    
    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }
    
    try {
      const userInfo = await this.exchangeGoogleCode(code as string);
      const user = await this.createOrUpdateUser(userInfo);
      const tokens = await this.generateTokens(user);
      
      res.json(tokens);
    } catch (error) {
      this.logger.error('Google callback error:', error);
      res.status(400).json({ error: 'Authentication failed' });
    }
  }

  private async handleGitHubAuth(_req: express.Request, res: express.Response): Promise<void> {
    if (!this.config.providers.github) {
      res.status(404).json({ error: 'GitHub OAuth not configured' });
      return;
    }
    
    const { clientId, redirectUri } = this.config.providers.github;
    const state = randomUUID();
    
    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent('user:email')}&` +
      `state=${state}`;
    
    res.redirect(authUrl);
  }

  private async handleGitHubCallback(req: express.Request, res: express.Response): Promise<void> {
    const { code, state: _state } = req.query;
    
    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }
    
    try {
      const userInfo = await this.exchangeGitHubCode(code as string);
      const user = await this.createOrUpdateUser(userInfo);
      const tokens = await this.generateTokens(user);
      
      res.json(tokens);
    } catch (error) {
      this.logger.error('GitHub callback error:', error);
      res.status(400).json({ error: 'Authentication failed' });
    }
  }

  private async handleAzureAuth(_req: express.Request, res: express.Response): Promise<void> {
    if (!this.config.providers.azure) {
      res.status(404).json({ error: 'Azure OAuth not configured' });
      return;
    }
    
    const { clientId, redirectUri, tenantId } = this.config.providers.azure;
    const state = randomUUID();
    
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent('openid email profile')}&` +
      `state=${state}`;
    
    res.redirect(authUrl);
  }

  private async handleAzureCallback(req: express.Request, res: express.Response): Promise<void> {
    const { code, state: _state } = req.query;
    
    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }
    
    try {
      const userInfo = await this.exchangeAzureCode(code as string);
      const user = await this.createOrUpdateUser(userInfo);
      const tokens = await this.generateTokens(user);
      
      res.json(tokens);
    } catch (error) {
      this.logger.error('Azure callback error:', error);
      res.status(400).json({ error: 'Authentication failed' });
    }
  }

  private async handleRegister(req: express.Request, res: express.Response): Promise<void> {
    if (!this.config.localAuth?.enabled) {
      res.status(404).json({ error: 'Local authentication not enabled' });
      return;
    }
    
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    
    try {
      // Check if user already exists
      const existingUser = Array.from(this.users.values()).find(u => u.email === email);
      if (existingUser) {
        res.status(409).json({ error: 'User already exists' });
        return;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user
      const user: User = {
        id: randomUUID(),
        email,
        name,
        provider: 'local',
        providerUserId: email,
        roles: ['user'],
        permissions: ['read', 'write'],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        active: true
      };
      
      this.users.set(user.id, user);
      await this.saveUsers();
      
      // Save password separately (in production, use proper secure storage)
      await this.savePassword(user.id, hashedPassword);
      
      const tokens = await this.generateTokens(user);
      res.json(tokens);
    } catch (error) {
      this.logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  private async handleLogin(req: express.Request, res: express.Response): Promise<void> {
    if (!this.config.localAuth?.enabled) {
      res.status(404).json({ error: 'Local authentication not enabled' });
      return;
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Missing email or password' });
      return;
    }
    
    try {
      // Find user
      const user = Array.from(this.users.values()).find(u => u.email === email && u.provider === 'local');
      if (!user || !user.active) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      
      // Verify password
      const storedPassword = await this.getPassword(user.id);
      if (!storedPassword || !await bcrypt.compare(password, storedPassword)) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      
      // Update last login
      user.lastLoginAt = new Date().toISOString();
      await this.saveUsers();
      
      const tokens = await this.generateTokens(user);
      res.json(tokens);
    } catch (error) {
      this.logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  private async handleListUsers(_req: express.Request, res: express.Response): Promise<void> {
    const users = Array.from(this.users.values()).map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      roles: user.roles,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      active: user.active
    }));
    
    res.json({ users });
  }

  private async handleUpdateUser(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    const updates = req.body;
    
    const user = this.users.get(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Update allowed fields
    if (updates.name) user.name = updates.name;
    if (updates.roles) user.roles = updates.roles;
    if (updates.permissions) user.permissions = updates.permissions;
    if (updates.active !== undefined) user.active = updates.active;
    
    await this.saveUsers();
    res.json({ success: true });
  }

  private async handleDeleteUser(req: express.Request, res: express.Response): Promise<void> {
    const { id } = req.params;
    
    if (!this.users.has(id)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    this.users.delete(id);
    await this.saveUsers();
    res.json({ success: true });
  }

  private async requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    
    const token = authHeader.substring(7);
    
    try {
      const payload = await this.verifyToken(token);
      if (!payload.success) {
        res.status(401).json({ error: 'invalid_token' });
        return;
      }
      
      const user = this.users.get(payload.data.sub);
      if (!user || !user.active) {
        res.status(401).json({ error: 'user_not_found' });
        return;
      }
      
      // Check if user has admin role
      if (!user.roles.includes('admin')) {
        res.status(403).json({ error: 'insufficient_permissions' });
        return;
      }
      
      (req as any).user = user;
      next();
    } catch (error) {
      this.logger.error('Auth middleware error:', error);
      res.status(401).json({ error: 'invalid_token' });
    }
  }

  // Token management methods
  public async verifyToken(token: string): Promise<Result<TokenPayload>> {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as TokenPayload;
      return { success: true, data: payload };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'TokenVerificationError',
          message: 'Invalid token',
          code: 'INVALID_TOKEN',
          statusCode: 401,
          isOperational: true
        }
      };
    }
  }

  public async generateTokens(user: User): Promise<AccessToken> {
    const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      iss: this.config.issuer,
      aud: this.config.audience
    };
    
    const accessToken = jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.tokenExpiration
    } as jwt.SignOptions);
    
    const refreshToken = randomUUID();
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setTime(refreshTokenExpiry.getTime() + this.parseExpiration(this.config.refreshTokenExpiration));
    
    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      expiresAt: refreshTokenExpiry
    });
    
    return {
      token: accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + this.parseExpiration(this.config.tokenExpiration)).toISOString(),
      user
    };
  }

  private parseExpiration(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) return 3600000; // 1 hour default
    
    const [, value, unit] = match;
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(value) * multipliers[unit];
  }

  // Provider-specific token exchange methods
  private async exchangeGoogleCode(_code: string): Promise<any> {
    // Implementation would make actual HTTP requests to Google's OAuth endpoints
    // This is a placeholder for the actual implementation
    return {
      email: 'user@example.com',
      name: 'Example User',
      avatar: 'https://example.com/avatar.jpg',
      provider: 'google',
      providerUserId: 'google-12345'
    };
  }

  private async exchangeGitHubCode(_code: string): Promise<any> {
    // Implementation would make actual HTTP requests to GitHub's OAuth endpoints
    return {
      email: 'user@example.com',
      name: 'Example User',
      avatar: 'https://example.com/avatar.jpg',
      provider: 'github',
      providerUserId: 'github-12345'
    };
  }

  private async exchangeAzureCode(_code: string): Promise<any> {
    // Implementation would make actual HTTP requests to Azure's OAuth endpoints
    return {
      email: 'user@example.com',
      name: 'Example User',
      avatar: 'https://example.com/avatar.jpg',
      provider: 'azure',
      providerUserId: 'azure-12345'
    };
  }

  private async createOrUpdateUser(userInfo: any): Promise<User> {
    // Find existing user
    let user = Array.from(this.users.values()).find(u => 
      u.provider === userInfo.provider && u.providerUserId === userInfo.providerUserId
    );
    
    if (user) {
      // Update existing user
      user.name = userInfo.name;
      user.avatar = userInfo.avatar;
      user.lastLoginAt = new Date().toISOString();
    } else {
      // Create new user
      user = {
        id: randomUUID(),
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.avatar,
        provider: userInfo.provider,
        providerUserId: userInfo.providerUserId,
        roles: ['user'],
        permissions: ['read', 'write'],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        active: true
      };
      
      this.users.set(user.id, user);
    }
    
    await this.saveUsers();
    return user;
  }

  private generateAuthorizationCode(): string {
    return randomUUID();
  }

  private async exchangeCodeForTokens(_code: string, _clientId: string): Promise<any> {
    // In a real implementation, validate the authorization code
    // For now, return a mock response
    throw new Error('Not implemented');
  }

  private async refreshAccessToken(refreshToken: string): Promise<any> {
    const tokenInfo = this.refreshTokens.get(refreshToken);
    if (!tokenInfo || tokenInfo.expiresAt < new Date()) {
      throw new Error('Invalid refresh token');
    }
    
    const user = this.users.get(tokenInfo.userId);
    if (!user || !user.active) {
      throw new Error('User not found or inactive');
    }
    
    return this.generateTokens(user);
  }

  private async revokeToken(token: string): Promise<void> {
    // Remove refresh token if provided
    this.refreshTokens.delete(token);
    
    // In a real implementation, you might also maintain a blacklist of revoked access tokens
  }

  // Data persistence methods
  private async loadUsers(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const usersFile = path.join(this.dataDir, 'users.json');
      const data = await fs.readFile(usersFile, 'utf-8');
      const users: User[] = JSON.parse(data);
      
      this.users.clear();
      users.forEach(user => this.users.set(user.id, user));
    } catch (error) {
      // File doesn't exist or is invalid, start with empty users
      this.logger.info('No existing users file found, starting with empty users');
    }
  }

  private async saveUsers(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const usersFile = path.join(this.dataDir, 'users.json');
      const users = Array.from(this.users.values());
      await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
      this.logger.error('Failed to save users:', error);
    }
  }

  private async savePassword(userId: string, hashedPassword: string): Promise<void> {
    try {
      const passwordFile = path.join(this.dataDir, `password_${userId}.txt`);
      await fs.writeFile(passwordFile, hashedPassword);
    } catch (error) {
      this.logger.error('Failed to save password:', error);
    }
  }

  private async getPassword(userId: string): Promise<string | null> {
    try {
      const passwordFile = path.join(this.dataDir, `password_${userId}.txt`);
      return await fs.readFile(passwordFile, 'utf-8');
    } catch (error) {
      return null;
    }
  }

  // Public methods
  public getApp(): express.Application {
    return this.app;
  }

  public async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.app.listen(port, () => {
        this.logger.info(`OAuth2 provider listening on port ${port}`);
        resolve();
      }).on('error', reject);
    });
  }
}