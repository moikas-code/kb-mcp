# Release Workflow and Auto-Update System

This document explains the comprehensive release workflow and auto-update system implemented for KB-MCP.

## 🚀 **Release Workflow Overview**

The release workflow is fully automated through GitHub Actions and provides:
- **Cross-platform executables** (Linux, Windows, macOS Intel/ARM)
- **NPM package publishing**
- **Auto-update manifest generation**
- **Security checksum verification**
- **Automated release notes**

## 📋 **Workflow Triggers**

### 1. **Manual Release (Recommended)**
```bash
# Trigger via GitHub Actions UI
# Go to: Actions → Release and Distribution → Run workflow
# Select version type: patch/minor/major/prerelease
```

### 2. **Tag-based Release**
```bash
git tag v1.2.3
git push origin v1.2.3
```

## 🔧 **Workflow Steps**

### **Phase 1: Build and Test**
- ✅ Checkout code and setup Node.js 20
- ✅ Install dependencies and build CLI
- ✅ Run tests and security audit
- ✅ Version determination and tagging

### **Phase 2: Create Executables**
- ✅ Build standalone executables for all platforms:
  - `kb-mcp-linux-x64`
  - `kb-mcp-win32-x64.exe`
  - `kb-mcp-darwin-x64`
  - `kb-mcp-darwin-arm64`
- ✅ Generate SHA256 checksums for verification
- ✅ Compress with GZip for smaller downloads

### **Phase 3: Package and Release**
- ✅ Create NPM package tarball
- ✅ Generate automated release notes from git commits
- ✅ Create GitHub release with all assets
- ✅ Upload executables, checksums, and NPM package

### **Phase 4: Publish and Distribute**
- ✅ Publish to NPM registry (for stable releases)
- ✅ Generate auto-update manifest
- ✅ Upload manifest to GitHub release

### **Phase 5: Notification**
- ✅ Release summary with download links
- ✅ Auto-update system activation

## 📦 **Auto-Update System**

### **Architecture**
The auto-update system consists of:

1. **Update Manifest** (`update-manifest.json`)
2. **GitHub Auto-Updater** (`src/updater/github-updater.ts`)
3. **CLI Update Commands** (`kb update check/install`)

### **Update Manifest Format**
```json
{
  "version": "1.2.3",
  "releaseDate": "2025-01-08T10:30:00Z",
  "mandatory": false,
  "channel": "stable",
  "platforms": {
    "linux-x64": {
      "url": "https://github.com/moikas-code/kb-mcp/releases/download/v1.2.3/kb-mcp-linux-x64",
      "sha256": "abc123..."
    },
    "win32-x64": {
      "url": "https://github.com/moikas-code/kb-mcp/releases/download/v1.2.3/kb-mcp-win32-x64.exe",
      "sha256": "def456..."
    },
    "darwin-x64": {
      "url": "https://github.com/moikas-code/kb-mcp/releases/download/v1.2.3/kb-mcp-darwin-x64",
      "sha256": "ghi789..."
    },
    "darwin-arm64": {
      "url": "https://github.com/moikas-code/kb-mcp/releases/download/v1.2.3/kb-mcp-darwin-arm64",
      "sha256": "jkl012..."
    }
  },
  "npm": {
    "version": "1.2.3",
    "url": "https://registry.npmjs.org/@moikas/kb-mcp/-/kb-mcp-1.2.3.tgz"
  },
  "releaseNotes": "https://github.com/moikas-code/kb-mcp/releases/tag/v1.2.3"
}
```

### **CLI Update Commands**

#### **Check for Updates**
```bash
kb update check
```
- Fetches latest manifest from GitHub
- Compares versions using semantic versioning
- Shows available updates with release notes

#### **Install Updates**
```bash
kb update install
```
- Downloads platform-specific executable
- Verifies SHA256 checksum
- Backs up current version
- Replaces executable atomically
- Restarts with new version

#### **Configure Auto-Updates**
```bash
kb update config --enable true --interval 24
```
- Enable/disable automatic update checking
- Set check interval (hours)
- Configure update channel (stable/beta/alpha)

## 🔐 **Security Features**

### **Checksum Verification**
- SHA256 checksums for all executables
- Automatic verification before installation
- Prevents corrupted or tampered downloads

### **Backup and Rollback**
- Automatic backup of current version
- Rollback capability if update fails
- Safe atomic replacement process

### **Secure Downloads**
- HTTPS-only downloads from GitHub
- No third-party CDNs or mirrors
- Official GitHub releases only

## 🛠 **Development Setup**

### **Required Secrets**
Add these secrets to your GitHub repository:

```bash
# NPM publishing
NPM_TOKEN=npm_xxxxxxxxxx

# Optional: Docker publishing
DOCKER_USERNAME=your-username
DOCKER_PASSWORD=your-password
```

### **Local Testing**
```bash
# Test update checking
npm run dev:basic-cli -- update check

# Test with prerelease
npm run dev:basic-cli -- update check --prerelease

# Simulate version bump
npm version patch --no-git-tag-version
npm run dev:basic-cli -- update check
```

## 📊 **Release Monitoring**

### **GitHub Actions Monitoring**
- Monitor workflow runs in Actions tab
- Check for build failures or test issues
- Review security audit results

### **NPM Package Monitoring**
- Verify package published successfully
- Check download statistics
- Monitor for any publishing issues

### **Update Adoption Tracking**
The auto-updater includes telemetry for:
- Update check frequency
- Download success rates
- Installation completion rates
- Version adoption metrics

## 🚨 **Emergency Procedures**

### **Rollback Release**
If a release has critical issues:

1. **Mark as Pre-release**
   ```bash
   gh release edit v1.2.3 --prerelease
   ```

2. **Create Hotfix Release**
   ```bash
   git checkout v1.2.2
   git cherry-pick <hotfix-commit>
   git tag v1.2.4
   git push origin v1.2.4
   ```

3. **Update Manifest Manually**
   - Edit release to update manifest
   - Point to previous stable version

### **Security Update (Mandatory)**
For critical security updates:

1. **Mark as Mandatory**
   ```json
   {
     "mandatory": true,
     "version": "1.2.5-security"
   }
   ```

2. **Force Update Notification**
   - Users will be prompted to update immediately
   - Auto-install (if enabled) will proceed automatically

## 📈 **Best Practices**

### **Version Management**
- Use semantic versioning (SemVer)
- Patch: Bug fixes and minor improvements
- Minor: New features and enhancements  
- Major: Breaking changes or major overhauls

### **Release Notes**
- Automated from git commits
- Use conventional commit messages
- Include migration guides for breaking changes

### **Testing Strategy**
- Test all platforms before release
- Verify update process works correctly
- Check NPM package installation

### **Communication**
- Announce major releases
- Document breaking changes
- Provide migration assistance

## 🔄 **Continuous Improvement**

The release workflow is designed to be:
- **Reliable**: Extensive testing and verification
- **Secure**: Checksum verification and HTTPS
- **Fast**: Parallel builds and efficient distribution
- **Maintainable**: Clear documentation and monitoring
- **User-Friendly**: Seamless update experience

This system ensures KB-MCP users always have access to the latest features and security updates with minimal friction.