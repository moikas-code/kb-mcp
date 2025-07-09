# KB-MCP - Enterprise Knowledge Base Management System

[![Version](https://img.shields.io/npm/v/kb-mcp)](https://www.npmjs.com/package/kb-mcp)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/SOC2-Ready-yellow)](docs/security/roadmap.md)
[![Security](https://img.shields.io/badge/Security-A+-brightgreen)](docs/security/README.md)

A knowledge base management system that works as both a CLI tool and MCP (Model Context Protocol) server. Features enterprise-ready security frameworks and is designed for scalability with SOC2 compliance roadmap.

## 🌟 Key Features

### Security & Compliance

> **Disclaimer:** While most security and compliance features described below are implemented in the codebase, some are not fully production-ready due to critical bugs or partial implementations (see the audit report in `docs/COMPREHENSIVE_AUDIT_REPORT.md`). Users are strongly advised to review the audit findings and address any outstanding issues before deploying in a production environment.

- 🔐 **Enterprise-Grade Security**: AES-256-GCM encryption, secure authentication, rate limiting
- 📋 **SOC2-Ready Frameworks**: Audit logging, data retention, and access control structures in place
- 🛡️ **GDPR Ready**: PII detection, data anonymization, right to erasure
- 🔑 **Multi-Factor Authentication**: TOTP-based MFA, API key management
- 🚦 **Rate Limiting**: DDoS protection, configurable limits per resource

### Dual-Mode Operation
- 💻 **CLI Tool**: Powerful command-line interface for local knowledge base management
- 🤖 **MCP Server**: Integration with Claude Desktop and other AI tools
- 📱 **REST API**: Optional HTTP API for web integrations
- 🔄 **Real-time Sync**: Keep knowledge bases synchronized across teams

### Enterprise Features
- 📊 **Version Control**: Git integration with automatic commits
- 💾 **Backup & Recovery**: Automated backups, point-in-time recovery
- 🌍 **Multi-Tenancy**: Isolated knowledge bases per team/project
- 📈 **Monitoring**: Prometheus metrics, OpenTelemetry tracing
- 🚨 **Alerting**: PagerDuty, Slack, email notifications

### Developer Experience
- 🎯 **Type-Safe**: Full TypeScript support with strict typing
- 🧪 **Well-Tested**: Comprehensive test suite with security tests
- 📚 **Documented**: Extensive documentation and examples
- 🔧 **Configurable**: YAML/JSON configuration with environment overrides
- 🎨 **Templates**: Pre-configured templates for different use cases

## 🚀 Quick Start

### Install as Global CLI Tool

```bash
npm install -g kb-mcp

# Note: If you encounter installation issues with native dependencies, try:
# npm install -g kb-mcp --ignore-scripts
# or use the installation script:
# curl -sSL https://raw.githubusercontent.com/moikas-code/kb-mcp/master/scripts/install-global.sh | bash

# Initialize a new knowledge base
kb init --template enterprise

# Optional: Use graph database for advanced AI features
kb init --template enterprise
# > Select "Graph Database" when prompted
# > Database containers start automatically!

# Start using it
kb write docs/welcome.md
kb list
kb search "important"
kb serve  # Start MCP server
```

### Install in Project

```bash
npm install kb-mcp

# Or with yarn
yarn add kb-mcp

# Or with pnpm
pnpm add kb-mcp
```

### Install from Source

```bash
git clone https://github.com/moikas-code/kb-mcp.git
cd kb-mcp
npm install
npm run build
npm link  # Makes 'kb' command available globally
```

## 📖 Usage

### CLI Mode

#### Initialize a Knowledge Base

```bash
# Basic setup
kb init

# Enterprise setup with encryption and audit logging
kb init --template enterprise --encrypt

# Interactive setup
kb init --interactive
```

#### Basic Commands

```bash
# Create or update a file
kb write guides/setup.md --content "# Setup Guide"
kb write guides/setup.md --file existing-doc.md
kb write guides/setup.md --template guide --interactive

# Read a file
kb read guides/setup.md
kb cat guides/setup.md --metadata  # Show only metadata

# List contents
kb list                    # List root directory
kb list docs              # List specific directory
kb ls -r                  # Recursive listing
kb ls -l                  # Long format with details

# Search
kb search "configuration"          # Search all files
kb search "security" -d docs      # Search in specific directory
kb find "error" --limit 50        # Limit results

# Delete (with backup)
kb delete old-file.md
kb rm old-file.md --force --no-backup
```

#### Advanced Commands

```bash
# Authentication
kb auth login                      # Interactive login
kb auth login -u admin            # Login with username
kb auth logout                    # Clear session
kb auth status                    # Check auth status

# API Key Management
kb auth create-api-key "CI/CD Key" --permissions read,write
kb auth list-api-keys
kb auth revoke-api-key <key-id>

# Audit Log Management
kb audit query --from 2024-01-01 --to 2024-12-31
kb audit export --format csv --output audit-report.csv
kb audit verify                   # Verify log integrity

# Backup and Restore
kb backup --output backups/kb-backup.tar.gz --encrypt
kb backup --incremental          # Only changed files
kb restore backups/kb-backup.tar.gz --verify

# Configuration
kb config get security.mfa_required
kb config set security.mfa_required true
kb config list                   # Show all settings

# Import/Export
kb export --format json --output kb-export.json
kb import kb-export.json --merge --validate
```

### MCP Server Mode

#### Start the Server

```bash
# Start as MCP server (stdio transport)
kb serve

# Start with specific configuration
kb serve --config production.yaml

# Start with TLS
kb serve --tls --cert server.crt --key server.key

# Start on specific port (for HTTP transport)
kb serve --port 8080 --http
```

#### Claude Desktop Integration

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kb-mcp": {
      "command": "kb",
      "args": ["serve", "--stdio"],
      "env": {
        "KB_CONFIG_PATH": "/path/to/your/kbconfig.yaml"
      }
    }
  }
}
```

#### Using with Claude Code

```json
{
  "mcpServers": {
    "project-kb": {
      "command": "npx",
      "args": ["kb-mcp", "serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### Environment Variables

```bash
# Core Settings
KB_CONFIG_PATH="/path/to/config.yaml"     # Configuration file path
KB_STORAGE_PATH="/path/to/kb"             # Knowledge base location
KB_LOG_LEVEL="info"                       # Logging level

# Security
KB_ENCRYPTION_KEY="your-secret-key"       # Encryption key (use secrets manager)
KB_JWT_SECRET="your-jwt-secret"           # JWT signing secret
KB_MFA_REQUIRED="true"                    # Require MFA

# Compliance
KB_AUDIT_ENABLED="true"                   # Enable audit logging
KB_AUDIT_RETENTION_DAYS="548"             # 18 months

# Performance
KB_RATE_LIMIT_PER_MINUTE="100"           # Rate limiting
KB_CACHE_TTL="300"                       # Cache TTL in seconds
```

## 🔧 Configuration

### Configuration File (.kbconfig.yaml)

```yaml
# Security Configuration
security:
  encryption:
    algorithm: AES-256-GCM
    key_rotation_days: 90
  authentication:
    providers: [jwt, oauth2, api_key]
    mfa_required: true
    session_timeout: 3600
  rate_limiting:
    enabled: true
    max_requests_per_minute: 100

# Compliance Configuration
compliance:
  audit:
    enabled: true
    retention_days: 548  # 18 months
    destinations: [file, siem, s3]
  gdpr:
    pii_detection: true
    anonymization_delay: 24h

# Storage Configuration
storage:
  primary: filesystem  # or s3, gcs, azure
  encryption_at_rest: true
  versioning: true
  backup:
    enabled: true
    schedule: "0 2 * * *"  # Daily at 2 AM
    retention_days: 30

# Monitoring Configuration
monitoring:
  metrics:
    enabled: true
    provider: prometheus
  tracing:
    enabled: true
    provider: opentelemetry
  alerts:
    channels: [pagerduty, slack]
```

### Templates

#### Basic Template
- Simple authentication
- File-based storage
- Basic audit logging
- Suitable for personal use

#### Enterprise Template
- Full authentication suite (JWT, OAuth2, SAML)
- Encrypted storage with backups
- SOC2-compliant audit logging
- GDPR compliance features
- Production monitoring

### Per-Project Configuration

Create `.kbconfig` in your project root:

```yaml
extends: ~/.kb-mcp/config.yaml
storage:
  path: ./docs/kb
compliance:
  audit:
    enabled: false  # Disable for local development
```

## 🔒 Security

### Security Features

#### Input Validation
- Path traversal prevention
- XSS/injection protection
- File type restrictions
- Content size limits
- Malicious pattern detection

#### Encryption
- **At Rest**: AES-256-GCM encryption for stored files
- **In Transit**: TLS 1.3 for all communications
- **Key Management**: Automatic key rotation, HSM support
- **Field-Level**: Sensitive field encryption in audit logs

#### Authentication & Authorization
- Multi-factor authentication (TOTP)
- JWT-based sessions
- API key management
- Role-based access control (RBAC)
- OAuth2/SAML integration

#### Audit & Compliance
- Tamper-proof audit logs
- Hash chain integrity
- Automated retention policies
- GDPR compliance (PII handling)
- SOC2 evidence collection

### Security Best Practices

1. **Never commit encryption keys**
   ```bash
   # Use environment variables or secrets manager
   export KB_ENCRYPTION_KEY=$(aws secretsmanager get-secret-value --secret-id kb-key)
   ```

2. **Enable MFA for production**
   ```yaml
   security:
     authentication:
       mfa_required: true
   ```

3. **Regular key rotation**
   ```bash
   kb rotate-keys --confirm
   ```

4. **Monitor audit logs**
   ```bash
   kb audit query --event-type security --severity high
   ```

## 🏢 Production Deployment

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Security: Run as non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/cli/index.js", "serve"]
```

```bash
# Build and run
docker build -t kb-manager:latest .
docker run -d \
  --name kb-manager \
  -p 3000:3000 \
  -v /path/to/kb:/app/kb \
  -v /path/to/config:/app/config \
  --env-file .env.production \
  kb-manager:latest
```

### Kubernetes Deployment

```yaml
# kb-manager-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kb-manager
  labels:
    app: kb-manager
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kb-manager
  template:
    metadata:
      labels:
        app: kb-manager
    spec:
      serviceAccountName: kb-manager
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: kb-manager
        image: kb-manager:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: KB_ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: kb-secrets
              key: encryption-key
        - name: KB_JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: kb-secrets
              key: jwt-secret
        volumeMounts:
        - name: kb-storage
          mountPath: /app/kb
        - name: config
          mountPath: /app/config
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: kb-storage
        persistentVolumeClaim:
          claimName: kb-storage-pvc
      - name: config
        configMap:
          name: kb-config
---
apiVersion: v1
kind: Service
metadata:
  name: kb-manager
spec:
  selector:
    app: kb-manager
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

### AWS Deployment

```bash
# Using AWS ECS with Fargate
aws ecs create-cluster --cluster-name kb-manager-cluster

# Create task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Create service
aws ecs create-service \
  --cluster kb-manager-cluster \
  --service-name kb-manager \
  --task-definition kb-manager:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"
```

### Monitoring Setup

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kb-manager'
    static_configs:
      - targets: ['kb-manager:3000']
    metrics_path: '/metrics'
```

```bash
# Grafana Dashboard Import
curl -X POST http://grafana:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @kb-manager-dashboard.json
```

## 🧪 Testing

### Run Tests

```bash
# All tests
npm test

# Security tests only
npm run test:security

# Compliance tests
npm run test:compliance

# Coverage report
npm test -- --coverage

# Integration tests
npm run test:integration
```

### Security Testing

```bash
# OWASP dependency check
npm audit --production

# Static analysis
npm run lint:security

# Penetration testing
npm run test:pentest
```

## 🚨 Troubleshooting

### Common Issues

#### Authentication Failed
```bash
# Reset credentials
kb auth reset --confirm

# Check session status
kb auth status --verbose
```

#### Encryption Key Lost
```bash
# Recover from backup (if configured)
kb recover --backup-key <backup-key>

# Export unencrypted data (requires admin)
kb export --decrypt --admin-override
```

#### Performance Issues
```bash
# Check metrics
kb metrics --component storage

# Optimize database
kb optimize --vacuum --reindex

# Clear cache
kb cache clear --all
```

#### MCP Connection Issues
```bash
# Test MCP server
kb serve --test

# Check Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp-server.log  # macOS

# Validate configuration
kb config validate --mcp
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=kb:*
kb --debug <command>

# Trace mode for detailed logs
kb --trace <command>
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/kb-manager.git
cd kb-manager

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build
npm run build
```

### Code Standards

- TypeScript strict mode
- 100% type coverage
- Security-first approach
- Comprehensive tests
- Clear documentation

## 🧪 Testing

The project includes a comprehensive test suite covering:
- **Unit tests**: Validate individual functions and modules.
- **Integration tests**: Ensure components work together as expected.
- **Security tests**: Check for vulnerabilities and compliance.
- **Compliance tests**: Validate SOC2, GDPR, and other requirements.

To run tests:

```bash
npm test                # All tests
npm run test:security   # Security tests only
npm run test:compliance # Compliance tests
npm test -- --coverage  # Coverage report
npm run test:integration # Integration tests
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## ⚠️ Important Disclaimers

- **Production Readiness:** This project is under active development. While many enterprise features are implemented, some components may not be fully production-ready. Users should thoroughly test and review the system in their own environment before deploying to production.

- **Compliance & Certification:** The presence of SOC2, GDPR, HIPAA, ISO 27001, and OWASP Top 10 features in this project does not constitute formal certification. Achieving compliance with these standards requires additional organizational processes, documentation, and third-party audits beyond the technical controls provided here.

- **Security Responsibility:** Security features are provided as a foundation, but ultimate responsibility for secure deployment, configuration, and key management lies with the user or deploying organization. Always follow best practices for secrets management, access control, and regular security reviews.

- **Third-Party Dependencies:** This project relies on several third-party libraries and services. Users are responsible for reviewing, updating, and monitoring these dependencies for vulnerabilities and licensing compliance.

- **Community Support:** This project is open source and community-driven. While we strive to address issues and pull requests promptly, there is no guarantee of commercial support or response times unless you have a separate enterprise agreement.

- **Experimental Features:** Some features (such as advanced graph search, vector embeddings, or SAML integration) may be experimental or incomplete. Use these features at your own risk and monitor for updates.

---