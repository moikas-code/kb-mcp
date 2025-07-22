/**
 * Database management commands
 * Manages local Docker instances for graph database
 */

import chalk from "chalk";
import ora from "ora";
import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { ConfigManager } from "../../core/config.js";
import { DockerManager } from "../../core/docker-manager.js";

interface DBStatus {
  running: boolean;
  containers: {
    falkordb: boolean;
    redis: boolean;
  };
  project: string;
  port: {
    falkordb: number;
    redis: number;
  };
}

export async function dbCommand(action: string, options: any): Promise<void> {
  switch (action) {
    case "start":
      await startDatabase(options);
      break;

    case "stop":
      await stopDatabase(options);
      break;

    case "status":
      await showStatus(options);
      break;

    case "reset":
      await resetDatabase(options);
      break;

    case "logs":
      await showLogs(options);
      break;

    default:
      console.error(chalk.red(`Unknown database action: ${action}`));
      console.log("Available actions: start, stop, status, reset, logs");
      process.exit(1);
  }
}

/**
 * Start the local database containers
 */
async function startDatabase(_options: any): Promise<void> {
  const spinner = ora("Starting local database...").start();

  try {
    // Check if Docker is available
    try {
      execSync("docker --version", { stdio: "ignore" });
    } catch {
      spinner.fail("Docker is not installed or not running");
      console.log(
        chalk.yellow(
          "\nPlease install Docker: https://docs.docker.com/get-docker/",
        ),
      );
      return;
    }

    const dockerManager = new DockerManager();

    spinner.text = "Starting database containers...";

    const result = await dockerManager.startDatabase(process.cwd());

    if (!result.success) {
      spinner.fail(`Failed to start database: ${result.error.message}`);
      process.exit(1);
    }

    spinner.succeed("Database started successfully");

    // Display connection info
    const status = result.data;
    console.log("\n" + chalk.bold("Connection Information:"));
    console.log(chalk.gray("─".repeat(40)));
    console.log("FalkorDB:");
    console.log("  Host:", chalk.cyan("localhost"));
    console.log("  Port:", chalk.cyan(status.ports?.falkordb || "6380"));
    console.log("  Password:", chalk.cyan(`dev_${status.projectId}`));
    console.log("\nRedis:");
    console.log("  Host:", chalk.cyan("localhost"));
    console.log("  Port:", chalk.cyan(status.ports?.redis || "6379"));
    console.log("  Password:", chalk.cyan(`dev_${status.projectId}`));
    console.log(
      "\n" +
        chalk.gray("These settings have been saved to your .kbconfig.yaml"),
    );
  } catch (error) {
    spinner.fail(
      `Failed to start database: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}

/**
 * Stop the database containers
 */
async function stopDatabase(_options: any): Promise<void> {
  const spinner = ora("Stopping database...").start();

  try {
    const dockerManager = new DockerManager();

    const result = await dockerManager.stopDatabase(process.cwd());

    if (!result.success) {
      spinner.fail(`Failed to stop database: ${result.error.message}`);
      return;
    }

    spinner.succeed("Database stopped");
  } catch (error) {
    spinner.fail(
      `Failed to stop database: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Show database status
 */
async function showStatus(_options: any): Promise<void> {
  try {
    const dockerManager = new DockerManager();

    const statusResult = await dockerManager.getProjectStatus(process.cwd());

    if (!statusResult.success) {
      console.error(
        chalk.red("Failed to get status:"),
        statusResult.error.message,
      );
      return;
    }

    const status = statusResult.data;

    console.log(chalk.bold("\nDatabase Status"));
    console.log(chalk.gray("─".repeat(40)));
    console.log("Project:", chalk.cyan(path.basename(process.cwd())));
    console.log("Project ID:", chalk.cyan(status.projectId));
    console.log(
      "Status:",
      status.status === "running"
        ? chalk.green("Running")
        : status.status === "partial"
          ? chalk.yellow("Partial")
          : chalk.red("Stopped"),
    );

    if (status.status !== "stopped") {
      console.log("\nContainers:");
      console.log(
        "  FalkorDB:",
        status.containers.falkordb.status === "running"
          ? chalk.green("✓")
          : chalk.red("✗"),
      );
      console.log(
        "  Redis:",
        status.containers.redis.status === "running"
          ? chalk.green("✓")
          : chalk.red("✗"),
      );

      console.log("\nPorts:");
      console.log(
        "  FalkorDB:",
        chalk.cyan(`localhost:${status.ports?.falkordb || "6380"}`),
      );
      console.log(
        "  Redis:",
        chalk.cyan(`localhost:${status.ports?.redis || "6379"}`),
      );
    }

    // Show all KB projects with databases
    console.log("\n" + chalk.bold("Other KB Projects:"));
    const allProjectsResult = await dockerManager.listProjects();
    if (allProjectsResult.success) {
      for (const project of allProjectsResult.data) {
        if (project.projectId !== status.projectId) {
          const projectName = path.basename(project.projectPath);
          const projectStatus =
            project.status === "running"
              ? chalk.green("running")
              : project.status === "partial"
                ? chalk.yellow("partial")
                : chalk.gray("stopped");
          console.log(`  ${projectName}: ${projectStatus}`);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red("Failed to get status:"), error);
  }
}

/**
 * Reset database (delete all data)
 */
async function resetDatabase(options: any): Promise<void> {
  const spinner = ora("Resetting database...").start();

  try {
    const dockerManager = new DockerManager();

    const result = await dockerManager.resetDatabase(process.cwd());

    if (!result.success) {
      spinner.fail(`Failed to reset database: ${result.error.message}`);
      return;
    }

    spinner.succeed("Database reset complete");

    if (!options.noStart) {
      console.log(chalk.yellow("\nRestarting database..."));
      await startDatabase({});
    }
  } catch (error) {
    spinner.fail(
      `Failed to reset database: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Show database logs
 */
async function showLogs(options: any): Promise<void> {
  try {
    const dockerManager = new DockerManager();

    const service = options.service === "all" ? undefined : options.service;
    const result = await dockerManager.getLogs(process.cwd(), service);

    if (!result.success) {
      console.error(chalk.red("Failed to get logs:"), result.error.message);
      return;
    }

    console.log(result.data);
  } catch (error) {
    console.error(chalk.red("Failed to show logs:"), error);
  }
}

/**
 * Get project identifier (hash of project path)
 */
async function getProjectId(): Promise<string> {
  const projectPath = process.cwd();
  const hash = crypto.createHash("sha256").update(projectPath).digest("hex");
  return hash.substring(0, 8);
}

/**
 * Create project-specific docker-compose file
 */
async function createProjectCompose(projectName: string): Promise<string> {
  const kbDir = path.join(os.homedir(), ".kb-mcp");
  const projectDir = path.join(kbDir, "projects", projectName);
  await fs.mkdir(projectDir, { recursive: true });

  const composeFile = path.join(projectDir, "docker-compose.yml");

  // Generate unique ports based on project hash
  const portOffset = parseInt(projectName.substring(3, 7), 16) % 1000;
  const falkorPort = 6380 + portOffset;
  const redisPort = 7379 + portOffset;

  const composeContent = `version: '3.8'

services:
  falkordb:
    image: falkordb/falkordb:latest
    container_name: ${projectName}_falkordb
    ports:
      - "${falkorPort}:6379"
    environment:
      - FALKORDB_PASSWORD=dev_${projectName}
    volumes:
      - ${projectName}_falkordb_data:/data
    networks:
      - ${projectName}_network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "dev_${projectName}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ${projectName}_redis
    ports:
      - "${redisPort}:6379"
    environment:
      - REDIS_PASSWORD=dev_${projectName}
    volumes:
      - ${projectName}_redis_data:/data
    networks:
      - ${projectName}_network
    command: redis-server --requirepass dev_${projectName} --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "dev_${projectName}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  ${projectName}_falkordb_data:
    driver: local
  ${projectName}_redis_data:
    driver: local

networks:
  ${projectName}_network:
    driver: bridge`;

  await fs.writeFile(composeFile, composeContent);

  // Save port mapping
  const portMap = {
    falkordb: falkorPort,
    redis: redisPort,
    password: `dev_${projectName}`,
  };
  await fs.writeFile(
    path.join(projectDir, "ports.json"),
    JSON.stringify(portMap, null, 2),
  );

  return composeFile;
}

/**
 * Get project compose file path
 */
function getProjectComposeFile(projectName: string): string {
  const kbDir = path.join(os.homedir(), ".kb-mcp");
  return path.join(kbDir, "projects", projectName, "docker-compose.yml");
}

/**
 * Get database status
 */
async function getDBStatus(projectName: string): Promise<DBStatus> {
  try {
    // Check container status
    const falkordbRunning = isContainerRunning(`${projectName}_falkordb`);
    const redisRunning = isContainerRunning(`${projectName}_redis`);

    // Get port mapping
    const projectDir = path.join(
      os.homedir(),
      ".kb-mcp",
      "projects",
      projectName,
    );
    let ports = { falkordb: 6380, redis: 7379 };

    try {
      const portData = await fs.readFile(
        path.join(projectDir, "ports.json"),
        "utf-8",
      );
      const savedPorts = JSON.parse(portData);
      ports = { falkordb: savedPorts.falkordb, redis: savedPorts.redis };
    } catch {
      // Ignore errors when reading saved ports
    }

    return {
      running: falkordbRunning || redisRunning,
      containers: {
        falkordb: falkordbRunning,
        redis: redisRunning,
      },
      project: projectName,
      port: ports,
    };
  } catch {
    return {
      running: false,
      containers: { falkordb: false, redis: false },
      project: projectName,
      port: { falkordb: 6380, redis: 7379 },
    };
  }
}

/**
 * Check if a container is running
 */
function isContainerRunning(containerName: string): boolean {
  try {
    const result = execSync(
      `docker ps --format "{{.Names}}" | grep "^${containerName}$"`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      },
    );
    return result.trim() === containerName;
  } catch {
    return false;
  }
}

/**
 * Wait for databases to be healthy
 */
async function waitForDatabases(projectName: string): Promise<void> {
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    const status = await getDBStatus(projectName);
    if (status.containers.falkordb && status.containers.redis) {
      // Check health
      try {
        const projectDir = path.join(
          os.homedir(),
          ".kb-mcp",
          "projects",
          projectName,
        );
        const portData = await fs.readFile(
          path.join(projectDir, "ports.json"),
          "utf-8",
        );
        const { password, falkordb, redis } = JSON.parse(portData);

        // Test connections
        execSync(`redis-cli -h localhost -p ${redis} -a ${password} ping`, {
          stdio: "ignore",
        });
        execSync(`redis-cli -h localhost -p ${falkordb} -a ${password} ping`, {
          stdio: "ignore",
        });

        return;
      } catch {
        // Ignore errors when reading saved ports
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    retries++;
  }

  throw new Error("Databases failed to start within timeout");
}

/**
 * Update configuration for graph database
 */
async function updateConfigForGraph(projectName: string): Promise<void> {
  const configManager = new ConfigManager();
  await configManager.load();

  // Get port mapping
  const projectDir = path.join(
    os.homedir(),
    ".kb-mcp",
    "projects",
    projectName,
  );
  const portData = await fs.readFile(
    path.join(projectDir, "ports.json"),
    "utf-8",
  );
  const { falkordb, redis, password } = JSON.parse(portData);

  // Update configuration
  configManager.set("storage.backend", "graph");
  configManager.set("graph.falkordb.host", "localhost");
  configManager.set(
    "graph.falkordb.port || falkordb.connection?.port || 3000",
    falkordb,
  );
  configManager.set("graph.falkordb.password", password);
  configManager.set("graph.redis.host", "localhost");
  configManager.set(
    "graph.redis.port || redis.connection?.port || 3000",
    redis,
  );
  configManager.set("graph.redis.password", password);
  configManager.set("graph.project_id", projectName);

  await configManager.save();
}

/**
 * Display connection information
 */
async function displayConnectionInfo(projectName: string): Promise<void> {
  const projectDir = path.join(
    os.homedir(),
    ".kb-mcp",
    "projects",
    projectName,
  );
  const portData = await fs.readFile(
    path.join(projectDir, "ports.json"),
    "utf-8",
  );
  const { falkordb, redis, password } = JSON.parse(portData);

  console.log("\n" + chalk.bold("Connection Information:"));
  console.log(chalk.gray("─".repeat(40)));
  console.log("FalkorDB:");
  console.log("  Host:", chalk.cyan("localhost"));
  console.log("  Port:", chalk.cyan(falkordb));
  console.log("  Password:", chalk.cyan(password));
  console.log("\nRedis:");
  console.log("  Host:", chalk.cyan("localhost"));
  console.log("  Port:", chalk.cyan(redis));
  console.log("  Password:", chalk.cyan(password));
  console.log(
    "\n" + chalk.gray("These settings have been saved to your .kbconfig.yaml"),
  );
}

/**
 * Save database state
 */
async function saveDBState(projectName: string, state: string): Promise<void> {
  const stateFile = path.join(
    os.homedir(),
    ".kb-mcp",
    "projects",
    projectName,
    "state.json",
  );
  const stateData = {
    state,
    project: process.cwd(),
    timestamp: new Date().toISOString(),
  };
  await fs.writeFile(stateFile, JSON.stringify(stateData, null, 2));
}

/**
 * Get all KB projects
 */
async function getAllKBProjects(): Promise<
  Array<{ id: string; name: string }>
> {
  const kbDir = path.join(os.homedir(), ".kb-mcp", "projects");

  try {
    const projects = await fs.readdir(kbDir);
    const result = [];

    for (const project of projects) {
      if (project.startsWith("kb_")) {
        const stateFile = path.join(kbDir, project, "state.json");
        try {
          const state = JSON.parse(await fs.readFile(stateFile, "utf-8"));
          result.push({
            id: project.substring(3),
            name: path.basename(state.project),
          });
        } catch {
          // Ignore errors when reading saved ports
        }
      }
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Get docker-compose command
 */
function getDockerComposeCommand(): string {
  try {
    execSync("docker compose version", { stdio: "ignore" });
    return "docker compose";
  } catch {
    return "docker-compose";
  }
}
