/**
 * Redis operations for cache key management
 */

import * as core from '@actions/core';
import {Redis} from 'ioredis';

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

    core.debug(
      `  SCAN completed: ${keys.length} total keys found in ${iterations} iterations`
    );
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
 * Get cache key with repository context to avoid collisions
 */
export function getCacheKey(baseKey: string): string {
  const repo = process.env.GITHUB_REPOSITORY || 'unknown';
  const runId = process.env.GITHUB_RUN_ID || 'local';

  // Include repo to avoid cross-repository cache collisions
  return `${repo}:${baseKey}`;
}
