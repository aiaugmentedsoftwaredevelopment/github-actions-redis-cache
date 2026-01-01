import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as glob from '@actions/glob';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as path from 'path';
import {Redis} from 'ioredis';

export interface CacheConfig {
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  ttl: number;
  compression: number;
}

/**
 * Create Redis client with configuration
 */
export async function createRedisClient(
  config: CacheConfig
): Promise<Redis> {
  core.debug(`Creating Redis client for ${config.redisHost}:${config.redisPort}`);
  core.debug(`  Authentication: ${config.redisPassword ? 'Enabled' : 'Disabled'}`);
  core.debug(`  Retry strategy: Max 3 attempts with exponential backoff`);

  const redis = new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    retryStrategy: (times: number) => {
      core.debug(`  Redis connection retry attempt ${times}/3`);
      if (times > 3) {
        core.warning('Failed to connect to Redis after 3 attempts');
        return null;
      }
      const delay = Math.min(times * 200, 2000);
      core.debug(`  Waiting ${delay}ms before retry`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  try {
    core.debug('Attempting to connect to Redis...');
    await redis.connect();

    core.debug('Testing Redis connection with PING...');
    const pong = await redis.ping();
    core.debug(`  Redis PING response: ${pong}`);

    core.info(`✅ Connected to Redis at ${config.redisHost}:${config.redisPort}`);
    return redis;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    core.error(`Failed to connect to Redis: ${errorMsg}`);

    if (error instanceof Error && error.stack) {
      core.debug('Connection error stack trace:');
      core.debug(error.stack);
    }

    await redis.quit();
    throw new Error(`Failed to connect to Redis: ${errorMsg}`);
  }
}

/**
 * Scan Redis keys matching a pattern
 */
export async function scanKeys(
  redis: Redis,
  pattern: string
): Promise<string[]> {
  core.debug(`Scanning Redis keys with pattern: ${pattern}`);

  const keys: string[] = [];
  let cursor = '0';
  let iterations = 0;

  try {
    do {
      iterations++;
      core.debug(`  SCAN iteration ${iterations}, cursor: ${cursor}`);

      const [nextCursor, matchingKeys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      const matches = matchingKeys as string[];

      if (matches.length > 0) {
        core.debug(`    Found ${matches.length} keys in this iteration`);
        keys.push(...matches);
      }
    } while (cursor !== '0');

    core.debug(`  SCAN completed: ${keys.length} total keys found in ${iterations} iterations`);
    return keys;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    core.error(`Redis SCAN failed: ${errorMsg}`);
    core.error('  - Redis connection may have been lost during scan');
    core.error('  - Check Redis server stability');
    throw new Error(`Failed to scan Redis keys: ${errorMsg}`);
  }
}

/**
 * Resolve glob patterns to actual file paths
 */
export async function resolveGlobPaths(patterns: string[]): Promise<string[]> {
  core.debug(`Resolving ${patterns.length} glob patterns`);

  const resolvedPaths: string[] = [];

  for (const pattern of patterns) {
    try {
      core.debug(`  Processing pattern: ${pattern}`);

      const globber = await glob.create(pattern.trim(), {
        followSymbolicLinks: false,
      });
      const files = await globber.glob();

      if (files.length > 0) {
        core.debug(`    Matched ${files.length} files`);
        resolvedPaths.push(...files);
      } else {
        core.debug(`    No files matched this pattern`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.warning(`Failed to resolve pattern "${pattern}": ${errorMsg}`);

      if (errorMsg.includes('Permission denied') || errorMsg.includes('EACCES')) {
        core.warning('  - Check file/directory permissions');
        core.warning('  - Pattern may reference inaccessible location');
      } else if (errorMsg.includes('ENOENT')) {
        core.warning('  - Path does not exist');
        core.warning('  - Verify the pattern is correct');
      }
    }
  }

  const uniquePaths = [...new Set(resolvedPaths)];
  core.debug(`  Total unique paths resolved: ${uniquePaths.length}`);

  return uniquePaths;
}

/**
 * Create tarball from paths
 *
 * TODO: Future enhancement - Support multiple compression formats (tar, zip, etc.)
 * and auto-detect available compression tools. See issue for details.
 */
export async function createTarball(
  paths: string[],
  outputFile: string,
  compression: number
): Promise<void> {
  core.debug(`Creating tarball with ${paths.length} paths`);
  core.debug(`  Output file: ${outputFile}`);
  core.debug(`  Compression level: ${compression}`);

  const workingDir = process.cwd();

  // Create list of files to include (relative paths)
  const fileListPath = path.join(path.dirname(outputFile), 'file-list.txt');
  const relativePaths = paths.map(p => path.relative(workingDir, p));
  fs.writeFileSync(fileListPath, relativePaths.join('\n'));

  core.debug(`  File list created: ${fileListPath}`);
  core.debug(`  Working directory: ${workingDir}`);

  try {
    // Use tar command for better performance
    // Note: tar doesn't accept compression level as a separate flag like `-6`
    // We need to use environment variable GZIP to set compression level
    const tarArgs = [
      '-czf',
      outputFile,
      '-T',
      fileListPath,
      '--ignore-failed-read', // Continue if some files don't exist
    ];

    core.debug(`  Executing: GZIP=-${compression} tar ${tarArgs.join(' ')}`);
    core.debug(`  This will compress with gzip level ${compression}`);

    let tarOutput = '';
    let tarError = '';

    const exitCode = await exec.exec('tar', tarArgs, {
      cwd: workingDir,
      silent: true,
      env: {
        ...process.env,
        GZIP: `-${compression}`, // Set gzip compression level via environment variable
      },
      listeners: {
        stdout: (data: Buffer) => {
          tarOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          tarError += data.toString();
        },
      },
    });

    if (exitCode !== 0) {
      core.error(`tar command failed with exit code ${exitCode}`);
      core.error(`  Command: tar ${tarArgs.join(' ')}`);
      core.error(`  Working directory: ${workingDir}`);
      core.error(`  File list path: ${fileListPath}`);

      if (tarError) {
        core.error(`  tar stderr: ${tarError}`);
      } else {
        core.error(`  tar stderr: (empty)`);
      }

      if (tarOutput) {
        core.error(`  tar stdout: ${tarOutput}`);
      }

      // Exit code 64 typically means usage error
      if (exitCode === 64) {
        core.error('');
        core.error('Exit code 64 indicates a command-line usage error.');
        core.error('Possible causes:');
        core.error('  - Invalid tar arguments (compression level may not be supported)');
        core.error('  - File list format issue');
        core.error('  - Incompatible tar version');
      }

      throw new Error(`tar command failed with exit code ${exitCode}: ${tarError || 'Unknown error'}`);
    }

    core.debug(`Tarball created successfully: ${outputFile}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if tar command is not found
    if (errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')) {
      core.error('tar command is not available on this system');
      core.error('  - Install tar: apt-get install tar (Ubuntu) or yum install tar (RHEL)');
      core.error('  - Verify tar is in PATH: which tar');
      throw new Error('tar command not found - please install tar utility');
    }

    throw error;
  } finally {
    // Clean up file list
    if (fs.existsSync(fileListPath)) {
      fs.unlinkSync(fileListPath);
      core.debug(`  Cleaned up file list: ${fileListPath}`);
    }
  }
}

/**
 * Extract tarball to filesystem
 * NOTE: targetDir should match the working directory used during tarball creation
 * to properly resolve relative paths
 */
export async function extractTarball(
  tarballPath: string,
  targetDir: string
): Promise<void> {
  core.debug(`Extracting tarball: ${tarballPath}`);
  core.debug(`  Target directory: ${targetDir}`);

  // Add verbose flag for better diagnostics
  const tarArgs = ['-xzvf', tarballPath, '-C', targetDir];

  core.debug(`  Executing: tar ${tarArgs.join(' ')}`);

  // Verify tarball exists and get size
  try {
    const stats = fs.statSync(tarballPath);
    core.debug(`  Tarball size: ${formatBytes(stats.size)}`);
  } catch (error) {
    core.error(`Tarball file not found or inaccessible: ${tarballPath}`);
    throw new Error(`Tarball file not found: ${tarballPath}`);
  }

  let tarOutput = '';
  let tarError = '';

  try {
    const exitCode = await exec.exec('tar', tarArgs, {
      silent: false, // Changed to false to capture more output
      listeners: {
        stdout: (data: Buffer) => {
          tarOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          tarError += data.toString();
        },
      },
    });

    if (exitCode !== 0) {
      core.error(`tar extraction failed with exit code ${exitCode}`);
      core.error(`  Command: tar ${tarArgs.join(' ')}`);
      core.error(`  Tarball path: ${tarballPath}`);
      core.error(`  Target directory: ${targetDir}`);

      if (tarError) {
        core.error(`  tar stderr (${tarError.length} chars):`);
        core.error(tarError);
      } else {
        core.error(`  tar stderr: (empty - no error message from tar)`);
      }

      if (tarOutput) {
        core.debug(`  tar stdout (${tarOutput.length} chars):`);
        core.debug(tarOutput.substring(0, 1000)); // First 1000 chars
      }

      throw new Error(`tar extraction failed with exit code ${exitCode}: ${tarError || 'No error message from tar'}`);
    }

    core.debug(`Tarball extracted successfully to ${targetDir}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if tar command is not found
    if (errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')) {
      core.error('tar command is not available on this system');
      core.error('  - Install tar: apt-get install tar (Ubuntu) or yum install tar (RHEL)');
      core.error('  - Verify tar is in PATH: which tar');
      throw new Error('tar command not found - please install tar utility');
    }

    // Check for permission issues
    if (errorMsg.includes('Permission denied') || errorMsg.includes('EACCES')) {
      core.error('Permission denied during extraction');
      core.error('  - Check write permissions for target directory');
      core.error(`  - Target directory: ${targetDir}`);
      core.error('  - Verify the runner has appropriate permissions');
    }

    // Check for disk space issues
    if (errorMsg.includes('No space left')) {
      core.error('Disk space exhausted during extraction');
      core.error('  - Check available disk space: df -h');
      core.error('  - Consider reducing cache size');
    }

    throw error;
  }
}

/**
 * Get file size in human-readable format
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get cache key with repository context
 */
export function getCacheKey(baseKey: string): string {
  const repo = process.env.GITHUB_REPOSITORY || 'unknown';
  const runId = process.env.GITHUB_RUN_ID || 'local';

  // Include repo to avoid cross-repository cache collisions
  return `${repo}:${baseKey}`;
}

/**
 * Validate cache paths exist
 */
export async function validatePaths(paths: string[]): Promise<string[]> {
  const validPaths: string[] = [];

  for (const p of paths) {
    try {
      const stat = fs.statSync(p);
      if (stat) {
        validPaths.push(p);
      }
    } catch (error) {
      core.debug(`Path does not exist: ${p}`);
    }
  }

  return validPaths;
}
