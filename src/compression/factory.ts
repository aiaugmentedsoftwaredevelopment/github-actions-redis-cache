/**
 * Compression format factory with auto-selection
 * Automatically selects the best available compression format
 */

import * as core from '@actions/core';
import {CompressionHandler, CompressionFormat} from './types';
import {
  TarGzipHandler,
  ZipHandler,
  GzipHandler,
  TarGzipNativeHandler,
  ZipNativeHandler,
  GzipNativeHandler,
} from './formats';
import {detectAllTools} from './detector';

// Registry of all available handlers
// Native handlers are listed first with higher priority (always available)
// Shell-based handlers serve as fallbacks (require external tools)
const handlerRegistry: CompressionHandler[] = [
  // Native handlers (no external dependencies)
  new TarGzipNativeHandler(), // Priority: 200
  new ZipNativeHandler(), // Priority: 150
  new GzipNativeHandler(), // Priority: 100
  // Shell-based handlers (fallbacks)
  new TarGzipHandler(), // Priority: 100
  new ZipHandler(), // Priority: 50
  new GzipHandler(), // Priority: 25
];

export type CompressionBackend = 'auto' | 'native' | 'shell';

/**
 * Filter handlers based on backend preference
 */
function filterHandlersByBackend(
  handlers: CompressionHandler[],
  backend: CompressionBackend
): CompressionHandler[] {
  if (backend === 'auto') {
    // Return all handlers (native will be selected due to higher priority)
    return handlers;
  } else if (backend === 'native') {
    // Only return native handlers (class name contains "Native")
    return handlers.filter(h => h.constructor.name.includes('Native'));
  } else if (backend === 'shell') {
    // Only return shell handlers (class name does not contain "Native")
    return handlers.filter(h => !h.constructor.name.includes('Native'));
  }
  return handlers;
}

/**
 * Get the best available compression handler based on system capabilities
 * Handlers are selected by priority
 * Native handlers (always available): tar+gzip-native (200) > zip-native (150) > gzip-native (100)
 * Shell handlers (require tools): tar+gzip (100) > zip (50) > gzip (25)
 *
 * @param backend - Compression backend preference: 'auto' (default), 'native', or 'shell'
 */
export async function getBestCompressionHandler(
  backend: CompressionBackend = 'auto'
): Promise<CompressionHandler> {
  core.info('🔧 Selecting compression format...');
  core.info(`   Backend preference: ${backend}`);

  // Detect shell-based tools for informational purposes
  await detectAllTools();

  // Filter handlers based on backend preference
  const filteredHandlers = filterHandlersByBackend(handlerRegistry, backend);

  if (filteredHandlers.length === 0) {
    throw new Error(
      `No handlers available for backend '${backend}'. Please check your configuration.`
    );
  }

  // Find available handlers sorted by priority
  // Use each handler's detect() method to check availability
  const availableHandlers: Array<{
    handler: CompressionHandler;
    priority: number;
  }> = [];

  for (const handler of filteredHandlers) {
    const isAvailable = await handler.detect();
    if (isAvailable) {
      availableHandlers.push({
        handler,
        priority: handler.priority,
      });
      core.debug(
        `  ${handler.format} (priority ${handler.priority}): Available`
      );
    } else {
      core.debug(`  ${handler.format} (priority ${handler.priority}): Not available`);
    }
  }

  if (availableHandlers.length === 0) {
    if (backend === 'shell') {
      core.error('❌ No shell-based compression tools available!');
      core.error('');
      core.error('Please install at least one of the following:');
      core.error('  - tar (recommended): apt-get install tar');
      core.error('  - zip: apt-get install zip');
      core.error('  - gzip: apt-get install gzip');
      core.error('');
      core.error('Or use compression-backend: native to use built-in Node.js libraries');
      throw new Error(
        'No shell compression tools available. Please install tar, zip, or gzip, or use native backend.'
      );
    } else {
      core.error('❌ No compression handlers available!');
      core.error('');
      core.error('This should never happen as native handlers are always available.');
      core.error('Please report this issue.');
      throw new Error(
        'No compression tools available. Please report this issue.'
      );
    }
  }

  // Sort by priority (descending) and select the best
  availableHandlers.sort((a, b) => b.priority - a.priority);
  const selected = availableHandlers[0].handler;

  core.info(`   Selected format: ${selected.format}`);
  core.info(`   Priority: ${selected.priority}`);
  core.info(
    `   ${availableHandlers.length} handler(s) available on this system`
  );

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
