/**
 * Compression tool detection with caching
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import {CompressionFormat, DetectionResult} from './types';

// Cache detection results in memory and GitHub Actions state
const detectionCache = new Map<CompressionFormat, DetectionResult>();
const DETECTION_CACHE_KEY = 'compression-detection-cache';

/**
 * Check if a command is available on the system
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const exitCode = await exec.exec('which', [command], {
      silent: true,
      ignoreReturnCode: true,
    });
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get version of a command (for debugging)
 */
async function getCommandVersion(
  command: string,
  versionFlag = '--version'
): Promise<string | undefined> {
  try {
    let output = '';
    await exec.exec(command, [versionFlag], {
      silent: true,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });
    // Return first line only
    return output.split('\n')[0].trim();
  } catch {
    return undefined;
  }
}

/**
 * Detect if tar command is available
 */
export async function detectTar(): Promise<DetectionResult> {
  core.debug('Detecting tar availability...');

  const available = await isCommandAvailable('tar');
  const version = available ? await getCommandVersion('tar') : undefined;

  const result: DetectionResult = {
    format: CompressionFormat.TAR_GZIP,
    available,
    command: 'tar',
    version,
  };

  core.debug(
    `  tar: ${available ? 'Available' : 'Not found'}${version ? ` (${version})` : ''}`
  );

  return result;
}

/**
 * Detect if zip command is available
 */
export async function detectZip(): Promise<DetectionResult> {
  core.debug('Detecting zip availability...');

  const available = await isCommandAvailable('zip');
  const version = available ? await getCommandVersion('zip') : undefined;

  const result: DetectionResult = {
    format: CompressionFormat.ZIP,
    available,
    command: 'zip',
    version,
  };

  core.debug(
    `  zip: ${available ? 'Available' : 'Not found'}${version ? ` (${version})` : ''}`
  );

  return result;
}

/**
 * Detect if gzip command is available
 */
export async function detectGzip(): Promise<DetectionResult> {
  core.debug('Detecting gzip availability...');

  const available = await isCommandAvailable('gzip');
  const version = available ? await getCommandVersion('gzip') : undefined;

  const result: DetectionResult = {
    format: CompressionFormat.GZIP,
    available,
    command: 'gzip',
    version,
  };

  core.debug(
    `  gzip: ${available ? 'Available' : 'Not found'}${version ? ` (${version})` : ''}`
  );

  return result;
}

/**
 * Detect all available compression tools
 * Results are cached for the duration of the action run
 */
export async function detectAllTools(): Promise<DetectionResult[]> {
  core.info('🔍 Detecting available compression tools...');

  // Try to load from GitHub Actions state first
  const cachedState = core.getState(DETECTION_CACHE_KEY);
  if (cachedState) {
    try {
      const cached = JSON.parse(cachedState) as DetectionResult[];
      core.debug('Loaded detection results from cache');
      cached.forEach(result => {
        detectionCache.set(result.format, result);
        core.info(
          `   ${result.command}: ${result.available ? '✅ Available' : '❌ Not found'}`
        );
      });
      return cached;
    } catch {
      core.debug('Failed to parse cached detection results, re-detecting');
    }
  }

  // Perform detection
  const results = await Promise.all([
    detectTar(),
    detectZip(),
    detectGzip(),
  ]);

  // Cache results
  results.forEach(result => {
    detectionCache.set(result.format, result);
    core.info(
      `   ${result.command}: ${result.available ? '✅ Available' : '❌ Not found'}${result.version ? ` (${result.version})` : ''}`
    );
  });

  // Save to GitHub Actions state
  core.saveState(DETECTION_CACHE_KEY, JSON.stringify(results));
  core.debug('Saved detection results to cache');

  return results;
}

/**
 * Get cached detection result for a specific format
 */
export function getCachedDetection(
  format: CompressionFormat
): DetectionResult | undefined {
  return detectionCache.get(format);
}

/**
 * Clear detection cache (useful for testing)
 */
export function clearDetectionCache(): void {
  detectionCache.clear();
}
