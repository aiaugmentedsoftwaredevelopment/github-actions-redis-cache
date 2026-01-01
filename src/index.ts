import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {createRedisClient, scanKeys, getCacheKey, CacheConfig} from './redis';
import {
  getBestCompressionHandler,
  CompressionBackend,
} from './compression';
import {formatBytes} from './utils';

async function run(): Promise<void> {
  try {
    core.info('🚀 Redis Cache Action - Restore Phase');
    core.debug(`Running on: ${process.platform} ${process.arch}`);
    core.debug(`Node version: ${process.version}`);

    // Get inputs
    const pathsInput = core.getInput('path', {required: true});
    const key = core.getInput('key', {required: true});
    const restoreKeysInput = core.getInput('restore-keys');
    const redisHost = core.getInput('redis-host');
    const redisPort = parseInt(core.getInput('redis-port'), 10);
    const redisPassword = core.getInput('redis-password') || undefined;
    const ttl = parseInt(core.getInput('ttl'), 10);
    const compression = parseInt(core.getInput('compression'), 10);
    const compressionBackend = (core.getInput('compression-backend') ||
      'auto') as CompressionBackend;

    core.debug('Configuration:');
    core.debug(`  Redis Host: ${redisHost}`);
    core.debug(`  Redis Port: ${redisPort}`);
    core.debug(`  Redis Auth: ${redisPassword ? 'Enabled' : 'Disabled'}`);
    core.debug(`  TTL: ${ttl}s (${Math.round(ttl / 86400)} days)`);
    core.debug(`  Compression: Level ${compression}`);
    core.debug(`  Compression Backend: ${compressionBackend}`);

    // Parse paths
    const paths = pathsInput
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    core.info(`📂 Cache paths (${paths.length} patterns):`);
    paths.forEach(p => core.info(`   - ${p}`));

    // Parse restore keys
    const restoreKeys = restoreKeysInput
      ? restoreKeysInput
          .split('\n')
          .map(k => k.trim())
          .filter(k => k.length > 0)
      : [];

    if (restoreKeys.length > 0) {
      core.info(`🔑 Restore keys (${restoreKeys.length} fallbacks):`);
      restoreKeys.forEach(k => core.info(`   - ${k}`));
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
      // Add repository context to key
      const fullKey = getCacheKey(key);
      core.info(`🔍 Looking for cache with key: ${key}`);
      core.debug(`Full Redis key: ${fullKey}`);

      let cacheData: Buffer | null = null;
      let matchedKey = '';
      let cacheHit = false;

      // Try exact key first
      core.info('   Trying exact key match...');
      cacheData = await redis.getBuffer(fullKey);

      if (cacheData) {
        matchedKey = key;
        cacheHit = true;
        core.info(`   ✅ Exact cache hit!`);
      } else {
        core.info('   ❌ No exact match found');

        // Try restore keys
        if (restoreKeys.length > 0) {
          core.info('   Trying restore keys...');

          for (const restoreKey of restoreKeys) {
            const fullRestoreKey = getCacheKey(restoreKey);
            const pattern = restoreKey.endsWith('*')
              ? fullRestoreKey
              : `${fullRestoreKey}*`;

            core.info(`   Scanning for pattern: ${restoreKey}`);
            const matchingKeys = await scanKeys(redis, pattern);

            if (matchingKeys.length > 0) {
              // Sort keys to get most recent (assumes timestamp in key)
              const sortedKeys = matchingKeys.sort().reverse();
              const latestKey = sortedKeys[0];

              core.info(`   Found ${matchingKeys.length} matching key(s)`);
              core.debug(`   Using latest: ${latestKey}`);

              cacheData = await redis.getBuffer(latestKey);

              if (cacheData) {
                // Extract original key without repository prefix
                const originalKey = latestKey.split(':').slice(1).join(':');
                matchedKey = originalKey;
                cacheHit = false; // Partial match, not exact hit
                core.info(`   ✅ Cache restored from: ${originalKey}`);
                break;
              }
            }
          }

          if (!cacheData) {
            core.info('   ❌ No matching restore keys found');
          }
        }
      }

      if (cacheData) {
        // Get compression handler
        const compressionHandler = await getBestCompressionHandler(
          compressionBackend
        );

        // Extract cache
        const tempDir = process.env.RUNNER_TEMP || '/tmp';
        const tempFile = path.join(tempDir, `cache-${Date.now()}.tar.gz`);

        // Extract to current working directory (same as where archive was created)
        const workingDir = process.cwd();

        core.info(`💾 Extracting cache (${formatBytes(cacheData.length)})...`);
        core.debug(`  Temp file: ${tempFile}`);
        core.debug(`  Target directory: ${workingDir}`);

        try {
          // Write cache data to temp file
          const writeStart = Date.now();
          fs.writeFileSync(tempFile, cacheData);
          const writeTime = Date.now() - writeStart;
          core.debug(`  Write time: ${writeTime}ms`);

          // Extract to working directory
          const extractStart = Date.now();
          await compressionHandler.extract(tempFile, workingDir);
          const extractTime = Date.now() - extractStart;
          core.debug(`  Extract time: ${extractTime}ms`);

          core.info(`✅ Cache restored successfully!`);
          core.info(`   Matched key: ${matchedKey}`);
          core.info(`   Cache size: ${formatBytes(cacheData.length)}`);
          core.debug(`  Total restore time: ${Date.now() - writeStart}ms`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          core.error(`Failed to extract cache: ${errorMsg}`);
          core.error('Troubleshooting:');
          core.error('  - Check if compression tools are installed and accessible');
          core.error('  - Verify disk space is available');
          core.error('  - Check file permissions in target directory');
          throw error;
        } finally {
          // Clean up temp file
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            core.debug(`Cleaned up temp file: ${tempFile}`);
          }
        }

        // Set outputs
        core.setOutput('cache-hit', cacheHit.toString());
        core.setOutput('cache-matched-key', matchedKey);

        core.info(`📊 Cache Statistics:`);
        core.info(
          `   Cache Hit: ${cacheHit ? 'Yes (exact match)' : 'No (restored from fallback)'}`
        );
        core.info(`   Matched Key: ${matchedKey}`);
      } else {
        // No cache found
        core.info(`❌ Cache miss - no cache found for key or restore keys`);
        core.info(`📝 Cache will be saved after job completes`);

        // Set outputs
        core.setOutput('cache-hit', 'false');
        core.setOutput('cache-matched-key', '');

        // Save state for post-action
        core.saveState('cache-key', key);
        core.saveState('cache-paths', pathsInput);
        core.saveState('redis-host', redisHost);
        core.saveState('redis-port', redisPort.toString());
        core.saveState('redis-password', redisPassword || '');
        core.saveState('ttl', ttl.toString());
        core.saveState('compression', compression.toString());
        core.saveState('compression-backend', compressionBackend);
      }
    } finally {
      await redis.quit();
      core.debug('Redis connection closed');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    core.setFailed(`❌ Cache restore failed: ${errorMsg}`);

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
    }

    core.error('');
    core.error(
      'For more help, see: https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache#troubleshooting'
    );
  }
}

run();
