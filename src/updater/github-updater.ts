/**
 * GitHub-based Auto-Update System for KB-MCP
 * Integrates with GitHub releases and the update manifest
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import semver from 'semver';
import { Result } from '../types/index.js';

export interface UpdateManifest {
  version: string;
  releaseDate: string;
  mandatory: boolean;
  channel: string;
  platforms: {
    [key: string]: {
      url: string;
      sha256: string;
    };
  };
  npm?: {
    version: string;
    url: string;
  };
  releaseNotes: string;
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  downloadUrl: string;
  sha256: string;
  size: number;
  releaseNotes: string;
  mandatory?: boolean;
}

export interface UpdaterConfig {
  currentVersion: string;
  checkInterval?: number; // ms
  allowPrerelease?: boolean;
  autoDownload?: boolean;
  autoInstall?: boolean;
  channel?: 'stable' | 'beta' | 'alpha';
  githubRepo?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export class GitHubAutoUpdater extends EventEmitter {
  private config: Required<UpdaterConfig>;
  private checkTimer?: NodeJS.Timeout;
  private updateInfo?: UpdateInfo;
  private isChecking = false;
  private isDownloading = false;

  constructor(config: UpdaterConfig) {
    super();
    
    this.config = {
      checkInterval: 4 * 60 * 60 * 1000, // 4 hours
      allowPrerelease: false,
      autoDownload: false,
      autoInstall: false,
      channel: 'stable',
      githubRepo: 'moikas-code/kb-mcp',
      ...config
    };
  }

  /**
   * Start auto-update checks
   */
  start(): void {
    this.checkForUpdates();
    
    if (this.config.checkInterval > 0) {
      this.checkTimer = setInterval(() => {
        this.checkForUpdates();
      }, this.config.checkInterval);
    }
  }

  /**
   * Stop auto-update checks
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<Result<UpdateInfo | null>> {
    if (this.isChecking) {
      return {
        success: false,
        error: 'Update check already in progress'
      };
    }

    this.isChecking = true;
    this.emit('checking-for-update');

    try {
      const manifest = await this.fetchUpdateManifest();
      
      if (!manifest) {
        this.emit('update-not-available');
        return { success: true, data: null };
      }

      const isNewer = semver.gt(manifest.version, this.config.currentVersion);
      
      if (isNewer) {
        const platformKey = this.getPlatformKey();
        const platformInfo = manifest.platforms[platformKey];
        
        if (!platformInfo) {
          throw new Error(`No update available for platform: ${platformKey}`);
        }

        this.updateInfo = {
          version: manifest.version,
          releaseDate: manifest.releaseDate,
          downloadUrl: platformInfo.url,
          sha256: platformInfo.sha256,
          size: 0, // Will be determined during download
          releaseNotes: manifest.releaseNotes,
          mandatory: manifest.mandatory
        };

        this.emit('update-available', this.updateInfo);
        
        if (this.config.autoDownload) {
          await this.downloadUpdate();
        }
        
        return { success: true, data: this.updateInfo };
      } else {
        this.emit('update-not-available');
        return { success: true, data: null };
      }
    } catch (error) {
      const errorMsg = `Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.emit('error', new Error(errorMsg));
      
      return {
        success: false,
        error: errorMsg
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Download the update
   */
  async downloadUpdate(): Promise<Result<string>> {
    if (!this.updateInfo) {
      return {
        success: false,
        error: 'No update available to download'
      };
    }

    if (this.isDownloading) {
      return {
        success: false,
        error: 'Download already in progress'
      };
    }

    this.isDownloading = true;
    this.emit('download-progress', { percent: 0, bytesDownloaded: 0, totalBytes: 0, bytesPerSecond: 0 });

    try {
      const tempDir = path.join(os.tmpdir(), 'kb-mcp-update');
      await fs.mkdir(tempDir, { recursive: true });
      
      const fileName = this.getUpdateFileName();
      const filePath = path.join(tempDir, fileName);
      
      // Download the update
      await this.downloadFile(this.updateInfo.downloadUrl, filePath);
      
      // Verify checksum
      const isValid = await this.verifyChecksum(filePath, this.updateInfo.sha256);
      if (!isValid) {
        throw new Error('Update file checksum verification failed');
      }
      
      this.emit('update-downloaded', this.updateInfo);
      
      if (this.config.autoInstall) {
        await this.installUpdate(filePath);
      }
      
      return { success: true, data: filePath };
    } catch (error) {
      const errorMsg = `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.emit('error', new Error(errorMsg));
      
      return {
        success: false,
        error: errorMsg
      };
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Install the downloaded update
   */
  async installUpdate(updatePath: string): Promise<Result<void>> {
    try {
      this.emit('update-installing');
      
      // Get current executable path
      const currentPath = process.execPath;
      const backupPath = `${currentPath}.backup`;
      
      // Create backup
      await fs.copyFile(currentPath, backupPath);
      
      // Make update executable
      await fs.chmod(updatePath, 0o755);
      
      // Replace current executable
      await fs.copyFile(updatePath, currentPath);
      
      // Clean up
      await fs.unlink(updatePath);
      
      this.emit('update-installed');
      
      return { success: true, data: undefined };
    } catch (error) {
      const errorMsg = `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.emit('error', new Error(errorMsg));
      
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Fetch the update manifest from GitHub releases
   */
  private async fetchUpdateManifest(): Promise<UpdateManifest | null> {
    const url = `https://github.com/${this.config.githubRepo}/releases/latest/download/update-manifest.json`;
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode === 404) {
          resolve(null);
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const manifest: UpdateManifest = JSON.parse(data);
            resolve(manifest);
          } catch (error) {
            reject(new Error(`Failed to parse manifest: ${error}`));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Download a file with progress tracking
   */
  private async downloadFile(url: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = require('fs').createWriteStream(filePath);
      let downloadedBytes = 0;
      let totalBytes = 0;
      let startTime = Date.now();

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        this.updateInfo!.size = totalBytes;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const elapsed = Date.now() - startTime;
          const bytesPerSecond = elapsed > 0 ? (downloadedBytes / elapsed) * 1000 : 0;
          const percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

          this.emit('download-progress', {
            percent: Math.round(percent),
            bytesDownloaded: downloadedBytes,
            totalBytes,
            bytesPerSecond: Math.round(bytesPerSecond)
          });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (error) => {
          require('fs').unlink(filePath, () => {});
          reject(error);
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Verify file checksum
   */
  private async verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = createHash('sha256');
      hash.update(fileBuffer);
      const actualSha256 = hash.digest('hex');
      
      return actualSha256.toLowerCase() === expectedSha256.toLowerCase();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get platform-specific key for the current system
   */
  private getPlatformKey(): string {
    const platform = process.platform;
    const arch = process.arch;
    
    if (platform === 'win32') {
      return 'win32-x64';
    } else if (platform === 'darwin') {
      return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    } else if (platform === 'linux') {
      return 'linux-x64';
    }
    
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }

  /**
   * Get the filename for the update file
   */
  private getUpdateFileName(): string {
    const platformKey = this.getPlatformKey();
    const ext = process.platform === 'win32' ? '.exe' : '';
    return `kb-mcp-${platformKey}${ext}`;
  }

  /**
   * Get current update info
   */
  getUpdateInfo(): UpdateInfo | undefined {
    return this.updateInfo;
  }

  /**
   * Check if update is in progress
   */
  isUpdateInProgress(): boolean {
    return this.isChecking || this.isDownloading;
  }
}