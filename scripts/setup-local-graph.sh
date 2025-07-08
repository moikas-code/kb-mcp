#!/bin/bash

# Setup script for using KB-MCP with local graph database
# This provides the full graph-based features while running locally

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}KB-MCP Local Graph Database Setup${NC}"
echo "===================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Step 1: Start the databases
echo -e "\n${YELLOW}Step 1: Starting FalkorDB and Redis...${NC}"
$DOCKER_COMPOSE -f docker-compose.local.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Check if services are running
if ! docker ps | grep -q kb-falkordb-local; then
    echo -e "${RED}Error: FalkorDB failed to start${NC}"
    exit 1
fi

if ! docker ps | grep -q kb-redis-local; then
    echo -e "${RED}Error: Redis failed to start${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Databases are running${NC}"

# Step 2: Set up configuration
echo -e "\n${YELLOW}Step 2: Setting up configuration...${NC}"

if [ -f .kbconfig.yaml ]; then
    echo -e "${YELLOW}Found existing .kbconfig.yaml${NC}"
    read -p "Do you want to backup and replace it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp .kbconfig.yaml .kbconfig.yaml.backup
        echo -e "${GREEN}✓ Backed up to .kbconfig.yaml.backup${NC}"
    else
        echo -e "${YELLOW}Please manually update your config to use graph backend${NC}"
        exit 0
    fi
fi

# Copy graph configuration
cp .kbconfig.graph.yaml .kbconfig.yaml
echo -e "${GREEN}✓ Graph configuration installed${NC}"

# Step 3: Set up environment
echo -e "\n${YELLOW}Step 3: Setting up environment...${NC}"

# Generate encryption key if not exists
if [ ! -f .env.local ] || ! grep -q "KB_ENCRYPTION_KEY=" .env.local; then
    echo "Generating encryption keys..."
    cat > .env.local << EOF
# Auto-generated local environment
export FALKORDB_HOST=localhost
export FALKORDB_PORT=6380
export FALKORDB_PASSWORD=localdev123
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=localdev123
export KB_ENCRYPTION_KEY=$(openssl rand -hex 32)
export KB_JWT_SECRET=$(openssl rand -base64 32)
export KB_STORAGE_BACKEND=graph
export KB_GRAPH_NAME=kb_local
EOF
fi

# Source environment
source .env.local
echo -e "${GREEN}✓ Environment configured${NC}"

# Step 4: Initialize KB with graph backend
echo -e "\n${YELLOW}Step 4: Initializing knowledge base...${NC}"

# Check if kb command is available
if command -v kb &> /dev/null; then
    echo "Initializing with graph backend..."
    kb init --template enterprise --backend graph || true
    echo -e "${GREEN}✓ Knowledge base initialized${NC}"
else
    echo -e "${YELLOW}KB-MCP not installed globally${NC}"
    echo "Run: npm install -g kb-mcp"
    echo "Then: kb init --template enterprise --backend graph"
fi

# Step 5: Test connection
echo -e "\n${YELLOW}Step 5: Testing connection...${NC}"

# Test Redis
if redis-cli -h localhost -p 6379 -a localdev123 ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis connection OK${NC}"
else
    echo -e "${RED}✗ Redis connection failed${NC}"
fi

# Test FalkorDB
if redis-cli -h localhost -p 6380 -a localdev123 ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ FalkorDB connection OK${NC}"
else
    echo -e "${RED}✗ FalkorDB connection failed${NC}"
fi

# Summary
echo -e "\n${GREEN}Setup Complete!${NC}"
echo "================"
echo
echo "Graph databases are running locally:"
echo "  - FalkorDB: localhost:6380"
echo "  - Redis: localhost:6379"
echo "  - Password: localdev123"
echo
echo "To use KB-MCP with graph features:"
echo -e "${YELLOW}  source .env.local${NC}"
echo -e "${YELLOW}  kb serve${NC}"
echo
echo "To stop the databases:"
echo -e "${YELLOW}  $DOCKER_COMPOSE -f docker-compose.local.yml down${NC}"
echo
echo "To view logs:"
echo -e "${YELLOW}  $DOCKER_COMPOSE -f docker-compose.local.yml logs -f${NC}"
echo
echo -e "${GREEN}Enjoy the full power of graph-based knowledge management!${NC}"