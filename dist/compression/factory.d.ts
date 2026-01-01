/**
 * Compression format factory with auto-selection
 * Automatically selects the best available compression format
 */
import { CompressionHandler, CompressionFormat } from './types';
export type CompressionBackend = 'auto' | 'native' | 'shell';
/**
 * Get the best available compression handler based on system capabilities
 * Handlers are selected by priority
 * Native handlers (always available): lz4 (250) > tar+gzip-native (200) > zip-native (150) > gzip-native (100)
 * Shell handlers (require tools): tar+gzip (100) > zip (50) > gzip (25)
 *
 * Default: LZ4 (fastest compression/decompression)
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