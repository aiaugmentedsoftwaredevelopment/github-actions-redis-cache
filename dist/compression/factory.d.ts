/**
 * Compression format factory with auto-selection
 * Automatically selects the best available compression format
 */
import { CompressionHandler, CompressionFormat } from './types';
/**
 * Get the best available compression handler based on system capabilities
 * Handlers are selected by priority: tar+gzip (100) > zip (50) > gzip (25)
 */
export declare function getBestCompressionHandler(): Promise<CompressionHandler>;
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