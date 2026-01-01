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
  const redis = new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    retryStrategy: (times: number) => {
      if (times > 3) {
        core.warning('Failed to connect to Redis after 3 attempts');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    core.info(`✅ Connected to Redis at ${config.redisHost}:${config.redisPort}`);
    return redis;
  } catch (error) {
    await redis.quit();
    throw new Error(
      `Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Scan Redis keys matching a pattern
 */
export async function scanKeys(
  redis: Redis,
  pattern: string
): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, matchingKeys] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100
    );
    cursor = nextCursor;
    keys.push(...(matchingKeys as string[]));
  } while (cursor !== '0');

  return keys;
}

/**
 * Resolve glob patterns to actual file paths
 */
export async function resolveGlobPaths(patterns: string[]): Promise<string[]> {
  const resolvedPaths: string[] = [];

  for (const pattern of patterns) {
    try {
      const globber = await glob.create(pattern.trim(), {
        followSymbolicLinks: false,
      });
      const files = await globber.glob();
      resolvedPaths.push(...files);
    } catch (error) {
      core.warning(
        `Failed to resolve pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return [...new Set(resolvedPaths)]; // Remove duplicates
}

/**
 * Create tarball from paths
 */
export async function createTarball(
  paths: string[],
  outputFile: string,
  compression: number
): Promise<void> {
  const workingDir = process.cwd();

  // Create list of files to include (relative paths)
  const fileListPath = path.join(path.dirname(outputFile), 'file-list.txt');
  const relativePaths = paths.map(p => path.relative(workingDir, p));
  fs.writeFileSync(fileListPath, relativePaths.join('\n'));

  try {
    // Use tar command for better performance
    const tarArgs = [
      '-czf',
      outputFile,
      `-${compression}`, // Compression level
      '-T',
      fileListPath,
      '--ignore-failed-read', // Continue if some files don't exist
    ];

    let tarOutput = '';
    let tarError = '';

    const exitCode = await exec.exec('tar', tarArgs, {
      cwd: workingDir,
      silent: true,
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
      throw new Error(`tar command failed with exit code ${exitCode}: ${tarError}`);
    }

    core.debug(`Tarball created successfully: ${outputFile}`);
  } finally {
    // Clean up file list
    if (fs.existsSync(fileListPath)) {
      fs.unlinkSync(fileListPath);
    }
  }
}

/**
 * Extract tarball to filesystem
 */
export async function extractTarball(
  tarballPath: string,
  targetDir: string = '/'
): Promise<void> {
  const tarArgs = ['-xzf', tarballPath, '-C', targetDir];

  let tarOutput = '';
  let tarError = '';

  const exitCode = await exec.exec('tar', tarArgs, {
    silent: true,
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
    throw new Error(`tar extraction failed with exit code ${exitCode}: ${tarError}`);
  }

  core.debug(`Tarball extracted successfully to ${targetDir}`);
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
