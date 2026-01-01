/**
 * Redis client creation and connection management
 */

import * as core from '@actions/core';
import {Redis} from 'ioredis';
import {CacheConfig} from './types';

/**
 * Create Redis client with configuration and retry logic
 */
export async function createRedisClient(
  config: CacheConfig
): Promise<Redis> {
  core.debug(
    `Creating Redis client for ${config.redisHost}:${config.redisPort}`
  );
  core.debug(
    `  Authentication: ${config.redisPassword ? 'Enabled' : 'Disabled'}`
  );
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
