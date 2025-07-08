/**
 * Auto-Update System for KB-MCP
 * Checks for updates and manages the update process
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import semver from 'semver';
import { Result } from '@types/index.js';
import winston from 'winston';

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

export class AutoUpdater extends EventEmitter {
  private config: Required<UpdaterConfig>;
  private checkTimer?: NodeJS.Timeout;
  private logger: winston.Logger;
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

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.File({ filename: 'updater.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
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

    this.logger.info('Auto-updater started', {
      currentVersion: this.config.currentVersion,
      checkInterval: this.config.checkInterval,
      channel: this.config.channel
    });
  }

  /**
   * Stop auto-update checks
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    
    this.logger.info('Auto-updater stopped');
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
      const latestRelease = await this.fetchLatestRelease();
      
      if (!latestRelease) {
        this.emit('update-not-available');
        return { success: true, data: null };
      }

      const isNewer = semver.gt(latestRelease.version, this.config.currentVersion);
      
      if (isNewer) {
        this.updateInfo = latestRelease;
        this.emit('update-available', latestRelease);
        
        if (this.config.autoDownload) {
          await this.downloadUpdate();
        }
        
        return { success: true, data: latestRelease };
      } else {
        this.emit('update-not-available');
        return { success: true, data: null };
      }
    } catch (error) {
      const errorMsg = `Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error(errorMsg);
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
    this.emit('download-progress', { percent: 0, bytesDownloaded: 0, totalBytes: this.updateInfo.size });

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
      this.logger.error(errorMsg);
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
    this.emit('before-quit-for-update');

    try {
      const platform = process.platform;
      const backupPath = await this.createBackup();
      
      if (platform === 'win32') {
        // Windows update process
        await this.installWindowsUpdate(updatePath);
      } else {
        // Unix-like update process
        await this.installUnixUpdate(updatePath);
      }
      
      this.logger.info('Update installed successfully', {
        version: this.updateInfo?.version,
        backupPath
      });
      
      this.emit('update-installed');
      
      // Schedule restart
      setTimeout(() => {
        this.quitAndInstall();
      }, 1000);
      
      return { success: true, data: undefined };
    } catch (error) {
      const errorMsg = `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error(errorMsg);
      this.emit('error', new Error(errorMsg));
      
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Quit and install the update
   */
  quitAndInstall(): void {
    this.emit('before-quit-for-update');
    
    // Restart the application
    const args = process.argv.slice(1);
    const options = {
      detached: true,
      stdio: 'ignore'
    };
    
    require('child_process').spawn(process.argv[0], args, options).unref();
    process.exit(0);
  }

  /**
   * Get current update info
   */
  getUpdateInfo(): UpdateInfo | undefined {
    return this.updateInfo;
  }

  /**
   * Fetch latest release from GitHub
   */
  private async fetchLatestRelease(): Promise<UpdateInfo | null> {
    const url = `https://api.github.com/repos/${this.config.githubRepo}/releases/latest`;
    
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'KB-MCP-Updater',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      https.get(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            
            if (release.message) {
              // Error response from GitHub
              reject(new Error(release.message));
              return;
            }
            
            // Find appropriate asset
            const platform = process.platform;
            const arch = process.arch;
            const assetName = `kb-mcp-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`;
            
            const asset = release.assets.find((a: any) => a.name === assetName);
            
            if (!asset) {
              resolve(null);
              return;
            }
            
            // Find checksum
            const checksumAsset = release.assets.find((a: any) => a.name === `${assetName}.sha256`);
            
            const updateInfo: UpdateInfo = {
              version: release.tag_name.replace(/^v/, ''),
              releaseDate: release.published_at,
              downloadUrl: asset.browser_download_url,
              sha256: '', // Will be fetched separately
              size: asset.size,
              releaseNotes: release.body || '',
              mandatory: release.name?.includes('[MANDATORY]') || false
            };
            
            // Fetch checksum if available
            if (checksumAsset) {
              this.fetchChecksum(checksumAsset.browser_download_url)
                .then(checksum => {
                  updateInfo.sha256 = checksum;
                  resolve(updateInfo);
                })
                .catch(() => resolve(updateInfo));
            } else {
              resolve(updateInfo);
            }
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Fetch checksum file
   */
  private async fetchChecksum(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const checksum = data.trim().split(/\s+/)[0];
          resolve(checksum);
        });
      }).on('error', reject);
    });
  }

  /**
   * Download a file with progress
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = require('fs').createWriteStream(destPath);
      let downloaded = 0;
      const startTime = Date.now();
      
      https.get(url, (response) => {
        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        
        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          file.write(chunk);
          
          const percent = totalSize > 0 ? (downloaded / totalSize) * 100 : 0;
          const elapsed = (Date.now() - startTime) / 1000;
          const bytesPerSecond = downloaded / elapsed;
          
          this.emit('download-progress', {
            percent,
            bytesDownloaded: downloaded,
            totalBytes: totalSize,
            bytesPerSecond
          });
        });
        
        response.on('end', () => {
          file.end();
          resolve();
        });
        
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Verify file checksum
   */
  private async verifyChecksum(filePath: string, expectedHash: string): Promise<boolean> {
    if (!expectedHash) {
      this.logger.warn('No checksum provided, skipping verification');
      return true;
    }

    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');
    
    return hash === expectedHash;
  }

  /**
   * Get update file name for current platform
   */
  private getUpdateFileName(): string {
    const platform = process.platform;
    const arch = process.arch;
    return `kb-mcp-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`;
  }

  /**
   * Create backup of current installation
   */
  private async createBackup(): Promise<string> {
    const execPath = process.execPath;
    const backupPath = `${execPath}.backup-${Date.now()}`;
    
    await fs.copyFile(execPath, backupPath);
    
    return backupPath;
  }

  /**
   * Install update on Windows
   */
  private async installWindowsUpdate(updatePath: string): Promise<void> {
    const execPath = process.execPath;
    const tempPath = `${execPath}.new`;
    
    // Copy new file
    await fs.copyFile(updatePath, tempPath);
    
    // Create batch script to replace file
    const batchScript = `
@echo off
echo Updating KB-MCP...
ping 127.0.0.1 -n 2 > nul
move /Y "${tempPath}" "${execPath}"
start "" "${execPath}"
del "%~f0"
`;
    
    const batchPath = path.join(os.tmpdir(), 'kb-mcp-update.bat');
    await fs.writeFile(batchPath, batchScript);
    
    // Execute batch script
    execSync(`start /b ${batchPath}`, { shell: true, detached: true });
  }

  /**
   * Install update on Unix-like systems
   */
  private async installUnixUpdate(updatePath: string): Promise<void> {
    const execPath = process.execPath;
    
    // Make update executable
    await fs.chmod(updatePath, 0o755);
    
    // Create update script
    const updateScript = `#!/bin/bash
echo "Updating KB-MCP..."
sleep 1
mv -f "${updatePath}" "${execPath}"
chmod +x "${execPath}"
exec "${execPath}" "$@"
`;
    
    const scriptPath = path.join(os.tmpdir(), 'kb-mcp-update.sh');
    await fs.writeFile(scriptPath, updateScript);
    await fs.chmod(scriptPath, 0o755);
    
    // Execute update script
    execSync(`${scriptPath} ${process.argv.slice(1).join(' ')} &`, { 
      shell: '/bin/bash',
      detached: true 
    });
  }
}