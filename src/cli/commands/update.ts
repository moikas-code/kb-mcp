/**
 * Update command for KB-MCP CLI
 * Manages self-updates of the application
 */

import chalk from 'chalk';
import ora from 'ora';
import { AutoUpdater } from '../../updater/index.js';
import { ConfigManager } from '../../core/config.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get current version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../../package.json'), 'utf-8')
);
const CURRENT_VERSION = packageJson.version;

export async function updateCommand(
  action: string,
  options: any
): Promise<void> {
  const updater = new AutoUpdater({
    currentVersion: CURRENT_VERSION,
    allowPrerelease: options.prerelease || false,
    autoDownload: false,
    autoInstall: false,
    channel: options.channel || 'stable'
  });

  switch (action) {
    case 'check':
      await checkForUpdates(updater);
      break;
    
    case 'install':
      await installUpdate(updater, options);
      break;
    
    case 'config':
      await configureUpdates(options);
      break;
    
    default:
      console.error(chalk.red(`Unknown update action: ${action}`));
      console.log('Available actions: check, install, config');
      process.exit(1);
  }
}

/**
 * Check for available updates
 */
async function checkForUpdates(updater: AutoUpdater): Promise<void> {
  const spinner = ora('Checking for updates...').start();

  try {
    const result = await updater.checkForUpdates();
    
    if (!result.success) {
      spinner.fail(`Update check failed: ${result.error}`);
      return;
    }

    if (result.data) {
      spinner.succeed('Update available!');
      
      console.log('\n' + chalk.green('New version available:'), chalk.cyan(result.data.version));
      console.log(chalk.gray('Current version:'), CURRENT_VERSION);
      console.log(chalk.gray('Release date:'), new Date(result.data.releaseDate).toLocaleDateString());
      
      if (result.data.mandatory) {
        console.log(chalk.yellow('\n⚠️  This is a mandatory security update!'));
      }
      
      console.log('\n' + chalk.bold('Release notes:'));
      console.log(result.data.releaseNotes || 'No release notes available');
      
      console.log('\n' + chalk.gray('To install the update, run:'));
      console.log(chalk.cyan('  kb update install'));
    } else {
      spinner.succeed('You are running the latest version!');
      console.log(chalk.gray('Current version:'), chalk.green(CURRENT_VERSION));
    }
  } catch (error) {
    spinner.fail(`Error checking for updates: ${error}`);
  }
}

/**
 * Install available update
 */
async function installUpdate(updater: AutoUpdater, options: any): Promise<void> {
  // First check for updates
  const checkSpinner = ora('Checking for updates...').start();
  
  try {
    const checkResult = await updater.checkForUpdates();
    
    if (!checkResult.success) {
      checkSpinner.fail(`Update check failed: ${checkResult.error}`);
      return;
    }

    if (!checkResult.data) {
      checkSpinner.succeed('You are already running the latest version!');
      return;
    }

    checkSpinner.succeed('Update found');
    
    const updateInfo = checkResult.data;
    
    // Show update info
    console.log('\n' + chalk.bold('Update Information:'));
    console.log('  Version:', chalk.cyan(updateInfo.version));
    console.log('  Size:', chalk.gray(formatBytes(updateInfo.size)));
    console.log('  Mandatory:', updateInfo.mandatory ? chalk.yellow('Yes') : chalk.gray('No'));
    
    // Confirm installation
    if (!options.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to install this update?',
          default: true
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('Update cancelled'));
        return;
      }
    }

    // Download update
    const downloadSpinner = ora('Downloading update...').start();
    
    updater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      const speed = formatBytes(progress.bytesPerSecond) + '/s';
      downloadSpinner.text = `Downloading update... ${percent}% (${speed})`;
    });
    
    const downloadResult = await updater.downloadUpdate();
    
    if (!downloadResult.success) {
      downloadSpinner.fail(`Download failed: ${downloadResult.error}`);
      return;
    }
    
    downloadSpinner.succeed('Update downloaded');
    
    // Warn about restart
    console.log('\n' + chalk.yellow('⚠️  The application will restart to complete the update.'));
    
    if (!options.yes) {
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Proceed with installation?',
          default: true
        }
      ]);
      
      if (!proceed) {
        console.log(chalk.yellow('Installation cancelled'));
        return;
      }
    }
    
    // Install update
    const installSpinner = ora('Installing update...').start();
    
    const installResult = await updater.installUpdate(downloadResult.data);
    
    if (!installResult.success) {
      installSpinner.fail(`Installation failed: ${installResult.error}`);
      return;
    }
    
    installSpinner.succeed('Update installed successfully!');
    console.log(chalk.green('\n✅ The application will now restart...'));
    
  } catch (error) {
    checkSpinner.fail(`Error: ${error}`);
  }
}

/**
 * Configure update settings
 */
async function configureUpdates(options: any): Promise<void> {
  const configManager = new ConfigManager();
  await configManager.load();
  
  if (options.enable !== undefined) {
    await configManager.set('updates.enabled', options.enable === 'true');
    console.log(chalk.green(`Auto-updates ${options.enable === 'true' ? 'enabled' : 'disabled'}`));
  }
  
  if (options.channel) {
    await configManager.set('updates.channel', options.channel);
    console.log(chalk.green(`Update channel set to: ${options.channel}`));
  }
  
  if (options.interval) {
    const hours = parseInt(options.interval);
    if (isNaN(hours) || hours < 1) {
      console.error(chalk.red('Invalid interval. Must be a number of hours >= 1'));
      return;
    }
    await configManager.set('updates.checkInterval', hours * 60 * 60 * 1000);
    console.log(chalk.green(`Update check interval set to: ${hours} hours`));
  }
  
  if (options.show) {
    const config = configManager.getConfig();
    console.log('\n' + chalk.bold('Update Configuration:'));
    console.log('  Enabled:', config.updates?.enabled ?? true);
    console.log('  Channel:', config.updates?.channel || 'stable');
    console.log('  Check interval:', formatInterval(config.updates?.checkInterval || 4 * 60 * 60 * 1000));
    console.log('  Auto-download:', config.updates?.autoDownload ?? false);
    console.log('  Auto-install:', config.updates?.autoInstall ?? false);
  }
  
  await configManager.save();
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format interval to human readable
 */
function formatInterval(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours} hours`;
  } else {
    const days = Math.floor(hours / 24);
    return `${days} days`;
  }
}