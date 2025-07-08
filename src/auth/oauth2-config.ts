/**
 * OAuth2 Configuration for KB-MCP
 * Default configuration and configuration helpers
 */

import { OAuth2Config } from './oauth2-provider.js';
import { randomUUID } from 'crypto';

/**
 * Create default OAuth2 configuration
 */
export function createDefaultOAuth2Config(): OAuth2Config {
  return {
    enabled: false,
    jwtSecret: process.env.JWT_SECRET || randomUUID(),
    tokenExpiration: '1h',
    refreshTokenExpiration: '7d',
    issuer: 'kb-mcp',
    audience: 'kb-mcp-client',
    
    providers: {
      // Google OAuth2
      google: process.env.GOOGLE_CLIENT_ID ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2/google/callback'
      } : undefined,
      
      // GitHub OAuth2
      github: process.env.GITHUB_CLIENT_ID ? {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/oauth2/github/callback'
      } : undefined,
      
      // Azure AD OAuth2
      azure: process.env.AZURE_CLIENT_ID ? {
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
        redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/oauth2/azure/callback',
        tenantId: process.env.AZURE_TENANT_ID!
      } : undefined,
      
      // Custom OAuth2 provider
      custom: process.env.CUSTOM_CLIENT_ID ? {
        authorizationUrl: process.env.CUSTOM_AUTH_URL!,
        tokenUrl: process.env.CUSTOM_TOKEN_URL!,
        userInfoUrl: process.env.CUSTOM_USERINFO_URL!,
        clientId: process.env.CUSTOM_CLIENT_ID,
        clientSecret: process.env.CUSTOM_CLIENT_SECRET!,
        redirectUri: process.env.CUSTOM_REDIRECT_URI || 'http://localhost:3000/oauth2/custom/callback'
      } : undefined
    },
    
    // Local authentication
    localAuth: {
      enabled: process.env.LOCAL_AUTH_ENABLED === 'true',
      requireRegistration: process.env.LOCAL_AUTH_REQUIRE_REGISTRATION !== 'false',
      adminUsers: process.env.LOCAL_AUTH_ADMIN_USERS?.split(',') || []
    }
  };
}

/**
 * Create OAuth2 configuration from environment variables
 */
export function createOAuth2ConfigFromEnv(): OAuth2Config {
  const config = createDefaultOAuth2Config();
  
  // Enable OAuth2 if any provider is configured
  config.enabled = !!(
    process.env.GOOGLE_CLIENT_ID ||
    process.env.GITHUB_CLIENT_ID ||
    process.env.AZURE_CLIENT_ID ||
    process.env.CUSTOM_CLIENT_ID ||
    process.env.LOCAL_AUTH_ENABLED === 'true'
  );
  
  // Override defaults with environment variables
  if (process.env.JWT_SECRET) {
    config.jwtSecret = process.env.JWT_SECRET;
  }
  
  if (process.env.TOKEN_EXPIRATION) {
    config.tokenExpiration = process.env.TOKEN_EXPIRATION;
  }
  
  if (process.env.REFRESH_TOKEN_EXPIRATION) {
    config.refreshTokenExpiration = process.env.REFRESH_TOKEN_EXPIRATION;
  }
  
  if (process.env.OAUTH2_ISSUER) {
    config.issuer = process.env.OAUTH2_ISSUER;
  }
  
  if (process.env.OAUTH2_AUDIENCE) {
    config.audience = process.env.OAUTH2_AUDIENCE;
  }
  
  return config;
}

/**
 * Validate OAuth2 configuration
 */
export function validateOAuth2Config(config: OAuth2Config): string[] {
  const errors: string[] = [];
  
  if (!config.enabled) {
    return errors; // Skip validation if disabled
  }
  
  // Validate JWT secret
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    errors.push('JWT secret must be at least 32 characters long');
  }
  
  // Validate token expiration formats
  if (!config.tokenExpiration.match(/^\d+[smhd]$/)) {
    errors.push('Token expiration must be in format like "1h", "30m", "7d"');
  }
  
  if (!config.refreshTokenExpiration.match(/^\d+[smhd]$/)) {
    errors.push('Refresh token expiration must be in format like "1h", "30m", "7d"');
  }
  
  // Validate that at least one provider is configured
  const hasProvider = !!(
    config.providers.google ||
    config.providers.github ||
    config.providers.azure ||
    config.providers.custom ||
    config.localAuth?.enabled
  );
  
  if (!hasProvider) {
    errors.push('At least one authentication provider must be configured');
  }
  
  // Validate provider configurations
  if (config.providers.google) {
    if (!config.providers.google.clientId) {
      errors.push('Google OAuth: clientId is required');
    }
    if (!config.providers.google.clientSecret) {
      errors.push('Google OAuth: clientSecret is required');
    }
    if (!config.providers.google.redirectUri) {
      errors.push('Google OAuth: redirectUri is required');
    }
  }
  
  if (config.providers.github) {
    if (!config.providers.github.clientId) {
      errors.push('GitHub OAuth: clientId is required');
    }
    if (!config.providers.github.clientSecret) {
      errors.push('GitHub OAuth: clientSecret is required');
    }
    if (!config.providers.github.redirectUri) {
      errors.push('GitHub OAuth: redirectUri is required');
    }
  }
  
  if (config.providers.azure) {
    if (!config.providers.azure.clientId) {
      errors.push('Azure OAuth: clientId is required');
    }
    if (!config.providers.azure.clientSecret) {
      errors.push('Azure OAuth: clientSecret is required');
    }
    if (!config.providers.azure.redirectUri) {
      errors.push('Azure OAuth: redirectUri is required');
    }
    if (!config.providers.azure.tenantId) {
      errors.push('Azure OAuth: tenantId is required');
    }
  }
  
  if (config.providers.custom) {
    if (!config.providers.custom.authorizationUrl) {
      errors.push('Custom OAuth: authorizationUrl is required');
    }
    if (!config.providers.custom.tokenUrl) {
      errors.push('Custom OAuth: tokenUrl is required');
    }
    if (!config.providers.custom.userInfoUrl) {
      errors.push('Custom OAuth: userInfoUrl is required');
    }
    if (!config.providers.custom.clientId) {
      errors.push('Custom OAuth: clientId is required');
    }
    if (!config.providers.custom.clientSecret) {
      errors.push('Custom OAuth: clientSecret is required');
    }
    if (!config.providers.custom.redirectUri) {
      errors.push('Custom OAuth: redirectUri is required');
    }
  }
  
  return errors;
}

/**
 * Get OAuth2 configuration documentation
 */
export function getOAuth2ConfigDocs(): string {
  return `
# OAuth2 Configuration for KB-MCP

KB-MCP supports multiple OAuth2 providers for enterprise authentication.

## Environment Variables

### JWT Configuration
- JWT_SECRET: Secret key for signing JWT tokens (required, min 32 chars)
- TOKEN_EXPIRATION: Access token expiration (default: 1h)
- REFRESH_TOKEN_EXPIRATION: Refresh token expiration (default: 7d)
- OAUTH2_ISSUER: Token issuer (default: kb-mcp)
- OAUTH2_AUDIENCE: Token audience (default: kb-mcp-client)

### Google OAuth2
- GOOGLE_CLIENT_ID: Google OAuth2 client ID
- GOOGLE_CLIENT_SECRET: Google OAuth2 client secret
- GOOGLE_REDIRECT_URI: Google OAuth2 redirect URI

### GitHub OAuth2
- GITHUB_CLIENT_ID: GitHub OAuth2 client ID
- GITHUB_CLIENT_SECRET: GitHub OAuth2 client secret
- GITHUB_REDIRECT_URI: GitHub OAuth2 redirect URI

### Azure AD OAuth2
- AZURE_CLIENT_ID: Azure AD client ID
- AZURE_CLIENT_SECRET: Azure AD client secret
- AZURE_REDIRECT_URI: Azure AD redirect URI
- AZURE_TENANT_ID: Azure AD tenant ID

### Custom OAuth2 Provider
- CUSTOM_CLIENT_ID: Custom OAuth2 client ID
- CUSTOM_CLIENT_SECRET: Custom OAuth2 client secret
- CUSTOM_REDIRECT_URI: Custom OAuth2 redirect URI
- CUSTOM_AUTH_URL: Custom OAuth2 authorization URL
- CUSTOM_TOKEN_URL: Custom OAuth2 token URL
- CUSTOM_USERINFO_URL: Custom OAuth2 user info URL

### Local Authentication
- LOCAL_AUTH_ENABLED: Enable local authentication (true/false)
- LOCAL_AUTH_REQUIRE_REGISTRATION: Require registration for local auth (default: true)
- LOCAL_AUTH_ADMIN_USERS: Comma-separated list of admin user emails

## Usage

1. Set environment variables for desired providers
2. Enable OAuth2 in server configuration
3. Start server with OAuth2 enabled
4. Access OAuth2 endpoints at http://localhost:3000/oauth2/

## OAuth2 Endpoints

- GET /oauth2/authorize - Authorization endpoint
- POST /oauth2/token - Token endpoint
- POST /oauth2/revoke - Token revocation endpoint
- GET /oauth2/userinfo - User info endpoint
- GET /oauth2/google - Google OAuth2 login
- GET /oauth2/github - GitHub OAuth2 login
- GET /oauth2/azure - Azure AD OAuth2 login
- POST /oauth2/register - Local registration (if enabled)
- POST /oauth2/login - Local login (if enabled)
- GET /oauth2/health - Health check endpoint

## Examples

### Google OAuth2 Setup
\`\`\`bash
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
export GOOGLE_REDIRECT_URI="http://localhost:3000/oauth2/google/callback"
export JWT_SECRET="your-jwt-secret-at-least-32-characters-long"
\`\`\`

### GitHub OAuth2 Setup
\`\`\`bash
export GITHUB_CLIENT_ID="your-github-client-id"
export GITHUB_CLIENT_SECRET="your-github-client-secret"
export GITHUB_REDIRECT_URI="http://localhost:3000/oauth2/github/callback"
export JWT_SECRET="your-jwt-secret-at-least-32-characters-long"
\`\`\`

### Local Authentication Setup
\`\`\`bash
export LOCAL_AUTH_ENABLED="true"
export LOCAL_AUTH_ADMIN_USERS="admin@example.com,manager@example.com"
export JWT_SECRET="your-jwt-secret-at-least-32-characters-long"
\`\`\`
`;
}

/**
 * Create OAuth2 configuration for testing
 */
export function createTestOAuth2Config(): OAuth2Config {
  return {
    enabled: true,
    jwtSecret: 'test-jwt-secret-for-testing-only-32-chars',
    tokenExpiration: '1h',
    refreshTokenExpiration: '7d',
    issuer: 'kb-mcp-test',
    audience: 'kb-mcp-test-client',
    
    providers: {
      // Enable local auth for testing
    },
    
    localAuth: {
      enabled: true,
      requireRegistration: false,
      adminUsers: ['admin@test.com']
    }
  };
}