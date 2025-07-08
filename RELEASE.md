# Release Process for KB-MCP

This document describes the release process for KB-MCP.

## Prerequisites

1. **NPM Access**: Ensure you have publish access to the `kb-mcp` package on npm
2. **GitHub Access**: Ensure you have write access to the repository
3. **GPG Key**: Set up GPG signing for git commits (recommended)
4. **Tokens**: Set up the following secrets in GitHub:
   - `NPM_TOKEN`: NPM automation token
   - `DOCKER_USERNAME`: Docker Hub username
   - `DOCKER_PASSWORD`: Docker Hub password

## Release Types

- **Patch Release** (1.0.x): Bug fixes, security patches
- **Minor Release** (1.x.0): New features, backwards compatible
- **Major Release** (x.0.0): Breaking changes

## Release Process

### 1. Prepare the Release

```bash
# Ensure you're on main branch
git checkout main
git pull origin main

# Run all tests
npm test
npm run test:security
npm run test:compliance

# Check for vulnerabilities
npm audit

# Update CHANGELOG.md with release notes
```

### 2. Create the Release

#### For Patch Release:
```bash
npm run release
```

#### For Minor Release:
```bash
npm run release:minor
```

#### For Major Release:
```bash
npm run release:major
```

These commands will:
1. Run tests and linting
2. Build the project
3. Bump the version in package.json
4. Create a git commit and tag
5. Push to GitHub
6. Publish to npm

### 3. GitHub Release

The GitHub Actions workflow will automatically:
1. Run all tests
2. Build binaries for all platforms
3. Create Docker images
4. Create a GitHub release with:
   - Changelog
   - Binary downloads
   - SHA256 checksums

### 4. Post-Release

1. **Verify NPM Package**:
   ```bash
   npm view kb-mcp
   npm install -g kb-mcp@latest
   kb --version
   ```

2. **Verify Docker Images**:
   ```bash
   docker pull moikascode/kb-mcp:latest
   docker run --rm moikascode/kb-mcp:latest kb --version
   ```

3. **Test Binary Downloads**:
   - Download from GitHub releases
   - Verify checksums
   - Test on each platform

4. **Update Documentation**:
   - Update README if needed
   - Update GitHub wiki
   - Announce in discussions

## Manual Release (if automated fails)

1. **Build and Test**:
   ```bash
   npm run build
   npm test
   ```

2. **Create Tag**:
   ```bash
   git tag -s v1.0.1 -m "Release v1.0.1"
   git push origin v1.0.1
   ```

3. **Publish to NPM**:
   ```bash
   npm publish --access public
   ```

4. **Build Binaries**:
   ```bash
   node scripts/build-all-binaries.js
   ```

5. **Build Docker**:
   ```bash
   ./scripts/docker-build.sh --push --tag 1.0.1 --tag latest
   ```

6. **Create GitHub Release**:
   - Go to https://github.com/moikas-code/kb-mcp/releases
   - Click "Draft a new release"
   - Select the tag
   - Add release notes from CHANGELOG.md
   - Upload binaries and checksums
   - Publish release

## Rollback Process

If a release has critical issues:

1. **Unpublish from NPM** (within 72 hours):
   ```bash
   npm unpublish kb-mcp@1.0.1
   ```

2. **Delete GitHub Release**:
   - Mark as pre-release first
   - Then delete if necessary

3. **Remove Docker Tags**:
   ```bash
   # Login to Docker Hub and remove tags
   ```

4. **Communicate**:
   - Post in GitHub Discussions
   - Update status in README if needed

## Security Releases

For security patches:

1. Create the fix in a private branch
2. Test thoroughly
3. Release as a patch version
4. Mark as security release in GitHub
5. Add `[SECURITY]` prefix in changelog
6. Consider making it mandatory in update system

## Version Support

- **Latest**: Always supported
- **Previous Minor**: Supported for 6 months
- **Previous Major**: Supported for 12 months
- **Security Patches**: Backported to supported versions

## Checklist

Before each release, ensure:

- [ ] All tests pass
- [ ] No security vulnerabilities (`npm audit`)
- [ ] CHANGELOG.md is updated
- [ ] Documentation is current
- [ ] Version number is correct
- [ ] Previous version still works (upgrade test)
- [ ] Binary builds work on all platforms
- [ ] Docker images build and run
- [ ] Auto-update system recognizes new version