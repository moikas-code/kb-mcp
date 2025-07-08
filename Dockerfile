# Multi-stage Dockerfile for KB-MCP
# Optimized for production with security best practices

# Stage 1: Build
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    tini \
    dumb-init \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/kb /app/logs /app/config && \
    chown -R nodejs:nodejs /app

# Set environment variables
ENV NODE_ENV=production \
    KB_STORAGE_PATH=/app/kb \
    KB_LOG_PATH=/app/logs \
    KB_CONFIG_PATH=/app/config/kbconfig.yaml

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/monitoring/health.js || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default command (can be overridden)
CMD ["node", "dist/mcp/index.js"]

# Labels
LABEL maintainer="moikas-code" \
      version="1.0.0" \
      description="KB-MCP - Enterprise Knowledge Base Management System" \
      org.opencontainers.image.source="https://github.com/moikas-code/kb-mcp" \
      org.opencontainers.image.vendor="moikas-code" \
      org.opencontainers.image.title="KB-MCP" \
      org.opencontainers.image.description="Production-ready, SOC2-compliant knowledge base management system" \
      org.opencontainers.image.licenses="MIT"