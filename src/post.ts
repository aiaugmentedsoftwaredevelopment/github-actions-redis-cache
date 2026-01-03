import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {createRedisClient, getCacheKey, CacheConfig} from './redis';
import {
  getBestCompressionHandler,
  CompressionBackend,
} from './compression';
import {resolveGlobPaths, validatePaths, formatBytes} from './utils';

async function run(): Promise<void> {
  try {
    core.info('💾 Redis Cache Action - Save Phase');
    core.debug(`Running on: ${process.platform} ${process.arch}`);
    core.debug(`Node version: ${process.version}`);

    // Get saved state from restore phase
    const key = core.getState('cache-key');
    const pathsInput = core.getState('cache-paths');
    const redisHost = core.getState('redis-host');
    const redisPort = parseInt(core.getState('redis-port'), 10);
    const redisPassword = core.getState('redis-password') || undefined;
    const ttl = parseInt(core.getState('ttl'), 10);
    const compression = parseInt(core.getState('compression'), 10);
    const compressionBackend = (core.getState('compression-backend') ||
      'auto') as CompressionBackend;
    const maxCacheSize = parseInt(core.getState('max-cache-size'), 10);

    // Check if cache should be saved
    if (!key || !pathsInput) {
      core.info('ℹ️  Cache was restored successfully - skipping save');
      return;
    }

    core.info(`🔑 Saving cache with key: ${key}`);
    core.debug('Configuration:');
    core.debug(`  Redis Host: ${redisHost}`);
    core.debug(`  Redis Port: ${redisPort}`);
    core.debug(`  Redis Auth: ${redisPassword ? 'Enabled' : 'Disabled'}`);
    core.debug(`  TTL: ${ttl}s (${Math.round(ttl / 86400)} days)`);
    core.debug(`  Compression: Level ${compression}`);
    core.debug(`  Compression Backend: ${compressionBackend}`);
    core.debug(`  Max Cache Size: ${maxCacheSize}MB`);

    // Parse paths
    const pathPatterns = pathsInput
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    core.info(`📂 Resolving cache paths (${pathPatterns.length} patterns)...`);
    core.debug('Patterns to resolve:');
    pathPatterns.forEach(p => core.debug(`   - ${p}`));

    // Resolve glob patterns to actual files
    const globStart = Date.now();
    const resolvedPaths = await resolveGlobPaths(pathPatterns);
    const globTime = Date.now() - globStart;
    core.debug(`  Glob resolution time: ${globTime}ms`);
    core.debug(`  Paths found: ${resolvedPaths.length}`);

    if (resolvedPaths.length === 0) {
      core.warning(
        '⚠️  No files found matching cache patterns - skipping cache save'
      );
      core.info('Patterns searched:');
      pathPatterns.forEach(p => core.info(`   - ${p}`));
      core.error('');
      core.error('Troubleshooting:');
      core.error('  - Verify glob patterns are correct');
      core.error('  - Check if files exist before cache save runs');
      core.error('  - Ensure paths are relative or absolute as expected');
      return;
    }

    // Validate paths exist
    const validateStart = Date.now();
    const validPaths = await validatePaths(resolvedPaths);
    const validateTime = Date.now() - validateStart;
    core.debug(`  Path validation time: ${validateTime}ms`);
    core.debug(`  Valid paths: ${validPaths.length}`);

    if (validPaths.length === 0) {
      core.warning('⚠️  All resolved paths are invalid - skipping cache save');
      core.error('');
      core.error('Troubleshooting:');
      core.error('  - Files may have been deleted during job execution');
      core.error('  - Check file permissions');
      return;
    }

    core.info(`   Found ${validPaths.length} files/directories to cache`);
    core.debug('Cache contents (first 10):');
    validPaths.slice(0, 10).forEach(p => core.debug(`   - ${p}`));
    if (validPaths.length > 10) {
      core.debug(`   ... and ${validPaths.length - 10} more`);
    }

    // Create Redis client
    core.info(`🔌 Connecting to Redis...`);
    core.debug(`  Target: ${redisHost}:${redisPort}`);

    const config: CacheConfig = {
      redisHost,
      redisPort,
      redisPassword,
      ttl,
      compression,
    };

    const redis = await createRedisClient(config);
    core.debug(`  Status: Connected and ready`);

    try {
      // Get compression handler
      const compressionHandler = await getBestCompressionHandler(
        compressionBackend
      );

      // Create archive
      const tempDir = process.env.RUNNER_TEMP || '/tmp';
      const tempFile = path.join(tempDir, `cache-${Date.now()}.tar.gz`);

      core.info(`🗜️  Creating compressed archive (level ${compression})...`);
      core.debug(`  Temp file: ${tempFile}`);
      core.debug(`  Files to archive: ${validPaths.length}`);
      core.debug(`  Using format: ${compressionHandler.format}`);

      try {
        const tarStart = Date.now();
        try {
          await compressionHandler.compress(validPaths, tempFile, compression);
          const tarTime = Date.now() - tarStart;
          core.debug(`  Archive creation time: ${tarTime}ms`);
        } catch (tarError) {
          const errorMsg =
            tarError instanceof Error ? tarError.message : String(tarError);
          core.error(`Failed to create archive: ${errorMsg}`);
          core.error('');
          core.error('Troubleshooting:');

          if (
            errorMsg.includes('command not found') ||
            errorMsg.includes('ENOENT')
          ) {
            core.error('  - Compression tool is not available on this system');
            core.error('  - Install tar: apt-get install tar (Ubuntu)');
            core.error('  - Install zip: apt-get install zip (Ubuntu)');
            core.error('  - Install gzip: apt-get install gzip (Ubuntu)');
          } else if (errorMsg.includes('Permission denied')) {
            core.error('  - Check file permissions for source paths');
            core.error('  - Verify write permissions for temp directory');
            core.error(`  - Temp directory: ${tempDir}`);
          } else if (errorMsg.includes('No space left')) {
            core.error('  - Disk space exhausted');
            core.error('  - Check available disk space: df -h');
            core.error('  - Consider reducing cache size or cleaning temp directory');
          } else {
            core.error('  - Verify all files in cache paths are accessible');
            core.error('  - Check for symbolic links or special files');
            core.error('  - Ensure sufficient disk space');
          }

          throw tarError;
        }

        // Check file size BEFORE reading into memory to prevent OOM
        const fileStats = fs.statSync(tempFile);
        const sizeBytes = fileStats.size;
        core.info(`   Archive size: ${formatBytes(sizeBytes)}`);

        // Validate cache size against configured maximum BEFORE loading into memory
        const maxCacheSizeBytes = maxCacheSize * 1024 * 1024; // Convert MB to bytes
        const REDIS_STRING_LIMIT = 512 * 1024 * 1024; // 512MB Redis hard limit

        if (sizeBytes > maxCacheSizeBytes) {
          core.warning(
            `⚠️  Cache size (${formatBytes(sizeBytes)}) exceeds configured maximum (${formatBytes(maxCacheSizeBytes)})`
          );
          core.error('');
          core.error('❌ Cache is too large to store in Redis');
          core.error('');
          core.error('Solutions:');
          core.error('  1. Reduce cached paths - only cache essential dependencies');
          core.error('  2. Use maximum compression: compression: 9');
          core.error('  3. Split into multiple cache keys for different components');
          core.error('  4. Increase max-cache-size input (max: 512MB)');
          core.error('');
          core.error('Technical Details:');
          core.error(`  - Current size: ${formatBytes(sizeBytes)}`);
          core.error(`  - Configured limit: ${formatBytes(maxCacheSizeBytes)}`);
          core.error(`  - Redis hard limit: ${formatBytes(REDIS_STRING_LIMIT)}`);
          core.error('');
          core.info('ℹ️  Skipping cache save - workflow will continue');
          return; // Graceful exit, don't upload
        }

        // Warn if approaching the limit (> 80% of max)
        const warningThreshold = maxCacheSizeBytes * 0.8;
        if (sizeBytes > warningThreshold && sizeBytes <= maxCacheSizeBytes) {
          core.warning(
            `⚠️  Cache size (${formatBytes(sizeBytes)}) is approaching limit (${formatBytes(maxCacheSizeBytes)}). Consider reducing cache size.`
          );
        }

        // Log memory usage before reading large file
        const memUsage = process.memoryUsage();
        core.debug(`Memory before reading archive:`);
        core.debug(`  Heap Used: ${formatBytes(memUsage.heapUsed)}`);
        core.debug(`  Heap Total: ${formatBytes(memUsage.heapTotal)}`);
        core.debug(`  RSS: ${formatBytes(memUsage.rss)}`);

        // Now safe to read into memory - size has been validated
        core.debug(`Reading ${formatBytes(sizeBytes)} into memory...`);
        const readStart = Date.now();
        const cacheData = fs.readFileSync(tempFile);
        const readTime = Date.now() - readStart;
        core.debug(`  Archive read time: ${readTime}ms`);

        // Log memory usage after reading
        const memUsageAfter = process.memoryUsage();
        core.debug(`Memory after reading archive:`);
        core.debug(`  Heap Used: ${formatBytes(memUsageAfter.heapUsed)}`);
        core.debug(`  Delta: +${formatBytes(memUsageAfter.heapUsed - memUsage.heapUsed)}`);


        // Save to Redis with TTL
        const fullKey = getCacheKey(key);
        core.info(`💾 Uploading to Redis...`);
        core.debug(`  Full Redis key: ${fullKey}`);
        core.debug(`  Data size: ${formatBytes(sizeBytes)}`);
        core.debug(`  TTL: ${ttl} seconds`);

        const startTime = Date.now();
        await redis.setex(fullKey, ttl, cacheData);
        const uploadTime = Date.now() - startTime;
        core.debug(`  Redis upload time: ${uploadTime}ms`);

        core.info(`✅ Cache saved successfully!`);
        core.info(`📊 Cache Statistics:`);
        core.info(`   Key: ${key}`);
        core.info(`   Size: ${formatBytes(sizeBytes)}`);
        core.info(`   Files: ${validPaths.length}`);
        core.info(`   Format: ${compressionHandler.format}`);
        core.info(`   Compression: Level ${compression}`);
        core.info(`   TTL: ${ttl} seconds (${Math.round(ttl / 86400)} days)`);
        core.info(`   Upload time: ${uploadTime}ms`);
        core.info(
          `   Upload speed: ${formatBytes(Math.round((sizeBytes / uploadTime) * 1000))}/s`
        );

        // Verify cache was saved
        core.info(`🔍 Verifying cache upload...`);
        core.debug(`  Checking existence of key: ${fullKey}`);

        const verifyStart = Date.now();
        const exists = await redis.exists(fullKey);
        const verifyTime = Date.now() - verifyStart;
        core.debug(`  Verification time: ${verifyTime}ms`);

        if (!exists) {
          throw new Error(
            'Cache verification failed - key does not exist after save'
          );
        }

        core.debug(`  ✅ Cache verification passed`);
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    core.warning(`⚠️  Failed to save cache: ${errorMsg}`);

    if (error instanceof Error && error.stack) {
      core.debug('Stack trace:');
      core.debug(error.stack);
    }

    // Provide troubleshooting guidance based on error type
    if (errorMsg.includes('ECONNREFUSED')) {
      core.error('');
      core.error('Connection refused - Redis server is not reachable:');
      core.error('  - Verify redis-host and redis-port are correct');
      core.error('  - Check if Redis server is running');
      core.error('  - Verify network connectivity');
      core.error('  - Check firewall rules if using remote Redis');
    } else if (errorMsg.includes('ENOTFOUND')) {
      core.error('');
      core.error('DNS resolution failed - cannot find Redis host:');
      core.error('  - Verify redis-host is correct');
      core.error('  - Check DNS configuration');
      core.error('  - Try using IP address instead of hostname');
    } else if (
      errorMsg.includes('authentication') ||
      errorMsg.includes('NOAUTH')
    ) {
      core.error('');
      core.error('Authentication failed:');
      core.error('  - Verify redis-password is correct');
      core.error('  - Check if Redis requires authentication');
      core.error('  - Verify password is set in repository secrets');
    } else if (errorMsg.includes('ETIMEDOUT')) {
      core.error('');
      core.error('Connection timeout:');
      core.error('  - Redis server may be overloaded');
      core.error('  - Network latency may be too high');
      core.error('  - Check Redis server health');
    } else if (errorMsg.includes('OOM') || errorMsg.includes('out of memory')) {
      core.error('');
      core.error('Redis out of memory:');
      core.error('  - Redis has reached maxmemory limit');
      core.error('  - Cache data exceeds available Redis memory');
      core.error('  - Consider increasing Redis maxmemory');
      core.error('  - Check Redis eviction policy (should be allkeys-lru)');
    } else if (errorMsg.includes('Cache verification failed')) {
      core.error('');
      core.error('Cache upload verification failed:');
      core.error('  - Data was uploaded but Redis key does not exist');
      core.error('  - Redis may have evicted the key immediately');
      core.error('  - Check Redis memory pressure and eviction policy');
      core.error('  - Verify TTL settings are reasonable');
    }

    core.info('');
    core.info('ℹ️  Job will continue despite cache save failure');
    core.info(
      'For more help, see: https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache#troubleshooting'
    );
  }
}

run();
