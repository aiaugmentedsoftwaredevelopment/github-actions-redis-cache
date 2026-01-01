/**
 * Compression tool detection with caching
 */
import { CompressionFormat, DetectionResult } from './types';
/**
 * Detect if tar command is available
 */
export declare function detectTar(): Promise<DetectionResult>;
/**
 * Detect if zip command is available
 */
export declare function detectZip(): Promise<DetectionResult>;
/**
 * Detect if gzip command is available
 */
export declare function detectGzip(): Promise<DetectionResult>;
/**
 * Detect all available compression tools
 * Results are cached for the duration of the action run
 */
export declare function detectAllTools(): Promise<DetectionResult[]>;
/**
 * Get cached detection result for a specific format
 */
export declare function getCachedDetection(format: CompressionFormat): DetectionResult | undefined;
/**
 * Clear detection cache (useful for testing)
 */
export declare function clearDetectionCache(): void;
//# sourceMappingURL=detector.d.ts.map