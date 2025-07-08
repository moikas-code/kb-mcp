#!/bin/bash

# Docker build script for KB-MCP
# Builds multi-architecture images for production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REPO="moikascode/kb-mcp"
PLATFORMS="linux/amd64,linux/arm64"

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}Building KB-MCP Docker images v${VERSION}${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed${NC}"
    exit 1
fi

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    echo -e "${YELLOW}Installing Docker buildx...${NC}"
    docker buildx create --use
fi

# Function to build and push
build_and_push() {
    local tag=$1
    local push=$2
    
    echo -e "${GREEN}Building ${tag}...${NC}"
    
    if [ "$push" = "true" ]; then
        docker buildx build \
            --platform ${PLATFORMS} \
            --tag ${DOCKER_REPO}:${tag} \
            --push \
            .
    else
        docker buildx build \
            --platform ${PLATFORMS} \
            --tag ${DOCKER_REPO}:${tag} \
            --load \
            .
    fi
}

# Parse arguments
PUSH=false
TAGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --tag)
            TAGS+=("$2")
            shift 2
            ;;
        --version)
            echo $VERSION
            exit 0
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --push          Push images to Docker Hub"
            echo "  --tag TAG       Additional tag to apply (can be used multiple times)"
            echo "  --version       Show version and exit"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Default tags
if [ ${#TAGS[@]} -eq 0 ]; then
    TAGS=("${VERSION}" "latest")
fi

# Login to Docker Hub if pushing
if [ "$PUSH" = "true" ]; then
    echo -e "${YELLOW}Logging in to Docker Hub...${NC}"
    if ! docker login; then
        echo -e "${RED}Docker login failed${NC}"
        exit 1
    fi
fi

# Build for each tag
for tag in "${TAGS[@]}"; do
    build_and_push "$tag" "$PUSH"
done

# Build Alpine variant
echo -e "${GREEN}Building Alpine variant...${NC}"
docker buildx build \
    --platform ${PLATFORMS} \
    --tag ${DOCKER_REPO}:${VERSION}-alpine \
    --tag ${DOCKER_REPO}:alpine \
    ${PUSH:+--push} \
    --file Dockerfile.alpine \
    . 2>/dev/null || echo -e "${YELLOW}Alpine variant not available${NC}"

echo -e "${GREEN}✅ Build complete!${NC}"

if [ "$PUSH" = "false" ]; then
    echo -e "${YELLOW}Images built locally. Use --push to push to Docker Hub${NC}"
fi

# Show image sizes
echo -e "\n${GREEN}Image sizes:${NC}"
docker images ${DOCKER_REPO} --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}"