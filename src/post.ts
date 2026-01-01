import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRedisClient,
  resolveGlobPaths,
  createTarball,
  formatBytes,
  getCacheKey,
  validatePaths,
  CacheConfig,
} from './utils';

async function run(): Promise<void> {
  try {
    core.info('💾 Redis Cache Action - Save Phase');

    // Get saved state from restore phase
    const key = core.getState('cache-key');
    const pathsInput = core.getState('cache-paths');
    const redisHost = core.getState('redis-host');
    const redisPort = parseInt(core.getState('redis-port'), 10);
    const redisPassword = core.getState('redis-password') || undefined;
    const ttl = parseInt(core.getState('ttl'), 10);
    const compression = parseInt(core.getState('compression'), 10);

    // Check if cache should be saved
    if (!key || !pathsInput) {
      core.info('ℹ️  Cache was restored successfully - skipping save');
      return;
    }

    core.info(`🔑 Saving cache with key: ${key}`);

    // Parse paths
    const pathPatterns = pathsInput
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    core.info(`📂 Resolving cache paths (${pathPatterns.length} patterns)...`);

    // Resolve glob patterns to actual files
    const resolvedPaths = await resolveGlobPaths(pathPatterns);

    if (resolvedPaths.length === 0) {
      core.warning('⚠️  No files found matching cache patterns - skipping cache save');
      core.info('Patterns searched:');
      pathPatterns.forEach(p => core.info(`   - ${p}`));
      return;
    }

    // Validate paths exist
    const validPaths = await validatePaths(resolvedPaths);

    if (validPaths.length === 0) {
      core.warning('⚠️  All resolved paths are invalid - skipping cache save');
      return;
    }

    core.info(`   Found ${validPaths.length} files/directories to cache`);
    core.debug('Cache contents:');
    validPaths.slice(0, 10).forEach(p => core.debug(`   - ${p}`));
    if (validPaths.length > 10) {
      core.debug(`   ... and ${validPaths.length - 10} more`);
    }

    // Create Redis client
    const config: CacheConfig = {
      redisHost,
      redisPort,
      redisPassword,
      ttl,
      compression,
    };

    const redis = await createRedisClient(config);

    try {
      // Create tarball
      const tempDir = process.env.RUNNER_TEMP || '/tmp';
      const tempFile = path.join(tempDir, `cache-${Date.now()}.tar.gz`);

      core.info(`🗜️  Creating compressed archive (level ${compression})...`);

      try {
        await createTarball(validPaths, tempFile, compression);

        // Read tarball
        const cacheData = fs.readFileSync(tempFile);
        const sizeBytes = cacheData.length;

        core.info(`   Archive size: ${formatBytes(sizeBytes)}`);

        // Check if cache size is reasonable (warn if > 1GB)
        if (sizeBytes > 1024 * 1024 * 1024) {
          core.warning(
            `⚠️  Cache size is large (${formatBytes(sizeBytes)}). Consider reducing cached paths.`
          );
        }

        // Save to Redis with TTL
        const fullKey = getCacheKey(key);
        core.info(`💾 Uploading to Redis...`);

        const startTime = Date.now();
        await redis.setex(fullKey, ttl, cacheData);
        const uploadTime = Date.now() - startTime;

        core.info(`✅ Cache saved successfully!`);
        core.info(`📊 Cache Statistics:`);
        core.info(`   Key: ${key}`);
        core.info(`   Size: ${formatBytes(sizeBytes)}`);
        core.info(`   Files: ${validPaths.length}`);
        core.info(`   Compression: Level ${compression}`);
        core.info(`   TTL: ${ttl} seconds (${Math.round(ttl / 86400)} days)`);
        core.info(`   Upload time: ${uploadTime}ms`);
        core.info(
          `   Upload speed: ${formatBytes(Math.round((sizeBytes / uploadTime) * 1000))}/s`
        );

        // Verify cache was saved
        const exists = await redis.exists(fullKey);
        if (!exists) {
          throw new Error('Cache verification failed - key does not exist after save');
        }

        core.debug('Cache verification passed');
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
          core.debug(`Cleaned up temp file: ${tempFile}`);
        }
      }
    } finally {
      await redis.quit();
      core.debug('Redis connection closed');
    }
  } catch (error) {
    // Don't fail the job if cache save fails
    if (error instanceof Error) {
      core.warning(`⚠️  Failed to save cache: ${error.message}`);
      core.debug(error.stack || 'No stack trace available');
    } else {
      core.warning(`⚠️  Failed to save cache: ${String(error)}`);
    }

    core.info('ℹ️  Job will continue despite cache save failure');
  }
}

run();
