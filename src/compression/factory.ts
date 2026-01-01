/**
 * Compression format factory with auto-selection
 * Automatically selects the best available compression format
 */

import * as core from '@actions/core';
import {CompressionHandler, CompressionFormat} from './types';
import {TarGzipHandler, ZipHandler, GzipHandler} from './formats';
import {detectAllTools} from './detector';

// Registry of all available handlers
const handlerRegistry: CompressionHandler[] = [
  new TarGzipHandler(),
  new ZipHandler(),
  new GzipHandler(),
];

/**
 * Get the best available compression handler based on system capabilities
 * Handlers are selected by priority: tar+gzip (100) > zip (50) > gzip (25)
 */
export async function getBestCompressionHandler(): Promise<CompressionHandler> {
  core.info('🔧 Selecting compression format...');

  // Detect all available tools
  const detectionResults = await detectAllTools();

  // Find available handlers sorted by priority
  const availableHandlers: Array<{
    handler: CompressionHandler;
    priority: number;
  }> = [];

  for (const handler of handlerRegistry) {
    const detection = detectionResults.find(d => d.format === handler.format);
    if (detection && detection.available) {
      availableHandlers.push({
        handler,
        priority: handler.priority,
      });
      core.debug(
        `  ${handler.format}: Available (priority ${handler.priority})`
      );
    } else {
      core.debug(`  ${handler.format}: Not available`);
    }
  }

  if (availableHandlers.length === 0) {
    core.error('❌ No compression tools available!');
    core.error('');
    core.error('Please install at least one of the following:');
    core.error('  - tar (recommended): apt-get install tar');
    core.error('  - zip: apt-get install zip');
    core.error('  - gzip: apt-get install gzip');
    throw new Error(
      'No compression tools available. Please install tar, zip, or gzip.'
    );
  }

  // Sort by priority (descending) and select the best
  availableHandlers.sort((a, b) => b.priority - a.priority);
  const selected = availableHandlers[0].handler;

  core.info(`   Selected format: ${selected.format}`);
  core.info(
    `   ${availableHandlers.length} format(s) available on this system`
  );

  if (selected.format !== CompressionFormat.TAR_GZIP) {
    core.warning(
      `⚠️  Using fallback format '${selected.format}' (tar+gzip not available)`
    );
  }

  return selected;
}

/**
 * Get a specific compression handler by format
 * Throws error if format is not available
 */
export async function getCompressionHandler(
  format: CompressionFormat
): Promise<CompressionHandler> {
  const handler = handlerRegistry.find(h => h.format === format);

  if (!handler) {
    throw new Error(`Unknown compression format: ${format}`);
  }

  const isAvailable = await handler.detect();

  if (!isAvailable) {
    throw new Error(
      `Compression format '${format}' is not available on this system`
    );
  }

  return handler;
}

/**
 * Get all registered compression handlers
 */
export function getAllHandlers(): CompressionHandler[] {
  return [...handlerRegistry];
}
