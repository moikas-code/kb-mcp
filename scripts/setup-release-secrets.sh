#!/bin/bash

# Setup Release Secrets for KB-MCP
# This script helps configure the necessary GitHub secrets for the release workflow

set -e

echo "🔧 KB-MCP Release Secrets Setup"
echo "================================"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Please install it from: https://cli.github.com/"
    echo ""
    echo "For macOS: brew install gh"
    echo "For Ubuntu: sudo apt install gh"
    echo "For Windows: winget install GitHub.cli"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 Please authenticate with GitHub first:"
    gh auth login
fi

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "📦 Repository: $REPO"
echo ""

# Function to set secret
set_secret() {
    local name=$1
    local description=$2
    local required=$3
    
    echo "🔑 Setting up: $name"
    echo "   Description: $description"
    
    if [ "$required" = "true" ]; then
        echo "   Status: ⚠️  Required"
    else
        echo "   Status: 🔵 Optional"
    fi
    
    echo -n "   Enter value (or press Enter to skip): "
    read -s value
    echo ""
    
    if [ -n "$value" ]; then
        echo "$value" | gh secret set "$name"
        echo "   ✅ Secret '$name' set successfully"
    else
        if [ "$required" = "true" ]; then
            echo "   ⚠️  Warning: Required secret '$name' was skipped"
        else
            echo "   ⏭️  Optional secret '$name' skipped"
        fi
    fi
    echo ""
}

echo "Setting up GitHub secrets for release workflow..."
echo ""

# Required secrets
echo "🚨 Required Secrets"
echo "==================="
set_secret "NPM_TOKEN" "NPM authentication token for publishing packages" "true"

echo ""
echo "📋 Optional Secrets"
echo "==================="
set_secret "DOCKER_USERNAME" "Docker Hub username for container publishing" "false"
set_secret "DOCKER_PASSWORD" "Docker Hub password or access token" "false"

echo ""
echo "📝 How to get NPM_TOKEN:"
echo "========================"
echo "1. Go to https://www.npmjs.com/"
echo "2. Sign in to your account"
echo "3. Go to Account Settings → Access Tokens"
echo "4. Generate a new 'Automation' token"
echo "5. Copy the token and paste it above"
echo ""

echo "🔍 Verifying secrets..."
echo "======================="

# Check which secrets are set
secrets=$(gh secret list --json name -q '.[].name')

echo "Currently configured secrets:"
for secret in NPM_TOKEN DOCKER_USERNAME DOCKER_PASSWORD; do
    if echo "$secrets" | grep -q "$secret"; then
        echo "   ✅ $secret"
    else
        echo "   ❌ $secret"
    fi
done

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Verify your secrets are working by running a test workflow"
echo "2. Create your first release:"
echo "   - Go to Actions → Release and Distribution → Run workflow"
echo "   - Select 'patch' for version type"
echo "   - Click 'Run workflow'"
echo ""
echo "3. Monitor the workflow execution:"
echo "   - Check the Actions tab for progress"
echo "   - Verify the release appears in the Releases section"
echo "   - Test the auto-update functionality"
echo ""
echo "📚 Documentation:"
echo "   - Release Workflow: docs/RELEASE_WORKFLOW.md"
echo "   - Auto-Update System: Covered in the workflow docs"
echo ""
echo "🆘 Need help?"
echo "   - GitHub Issues: https://github.com/$REPO/issues"
echo "   - Documentation: https://github.com/$REPO/tree/master/docs"
echo ""
echo "Happy releasing! 🚀"