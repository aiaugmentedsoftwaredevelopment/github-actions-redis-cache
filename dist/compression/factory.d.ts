/**
 * Compression format factory with auto-selection
 * Automatically selects the best available compression format
 */
import { CompressionHandler, CompressionFormat } from './types';
export type CompressionBackend = 'auto' | 'native' | 'shell';
/**
 * Get the best available compression handler based on system capabilities
 * Handlers are selected by priority
 * Native handlers (always available): tar+gzip-native (250) > zip-native (150) > gzip-native (100)
 * Shell handlers (require tools): tar+gzip (100) > lz4/zip (50) > gzip (25)
 *
 * Default: Tar+Gzip Native (best balance of speed and compression ratio)
 * - Compression: 436 MB/s at level 6
 * - Decompression: 614 MB/s
 * - Ratio: 99.7% reduction (250MB → 745KB)
 *
 * @param backend - Compression backend preference: 'auto' (default), 'native', or 'shell'
 */
export declare function getBestCompressionHandler(backend?: CompressionBackend): Promise<CompressionHandler>;
/**
 * Get a specific compression handler by format
 * Throws error if format is not available
 */
export declare function getCompressionHandler(format: CompressionFormat): Promise<CompressionHandler>;
/**
 * Get all registered compression handlers
 */
export declare function getAllHandlers(): CompressionHandler[];
//# sourceMappingURL=factory.d.ts.map