import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRedisClient,
  scanKeys,
  extractTarball,
  formatBytes,
  getCacheKey,
  CacheConfig,
} from './utils';

async function run(): Promise<void> {
  try {
    core.info('🚀 Redis Cache Action - Restore Phase');

    // Get inputs
    const pathsInput = core.getInput('path', {required: true});
    const key = core.getInput('key', {required: true});
    const restoreKeysInput = core.getInput('restore-keys');
    const redisHost = core.getInput('redis-host');
    const redisPort = parseInt(core.getInput('redis-port'), 10);
    const redisPassword = core.getInput('redis-password') || undefined;
    const ttl = parseInt(core.getInput('ttl'), 10);
    const compression = parseInt(core.getInput('compression'), 10);

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
    const config: CacheConfig = {
      redisHost,
      redisPort,
      redisPassword,
      ttl,
      compression,
    };

    const redis = await createRedisClient(config);

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
        // Extract cache
        const tempDir = process.env.RUNNER_TEMP || '/tmp';
        const tempFile = path.join(tempDir, `cache-${Date.now()}.tar.gz`);

        core.info(`💾 Extracting cache (${formatBytes(cacheData.length)})...`);

        try {
          // Write cache data to temp file
          fs.writeFileSync(tempFile, cacheData);

          // Extract to filesystem root
          await extractTarball(tempFile, '/');

          core.info(`✅ Cache restored successfully!`);
          core.info(`   Matched key: ${matchedKey}`);
          core.info(`   Cache size: ${formatBytes(cacheData.length)}`);
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
        core.info(`   Cache Hit: ${cacheHit ? 'Yes (exact match)' : 'No (restored from fallback)'}`);
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
      }
    } finally {
      await redis.quit();
      core.debug('Redis connection closed');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`❌ Cache restore failed: ${error.message}`);
      core.debug(error.stack || 'No stack trace available');
    } else {
      core.setFailed(`❌ Cache restore failed: ${String(error)}`);
    }
  }
}

run();
