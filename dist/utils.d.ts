import { Redis } from 'ioredis';
export interface CacheConfig {
    redisHost: string;
    redisPort: number;
    redisPassword?: string;
    ttl: number;
    compression: number;
}
/**
 * Create Redis client with configuration
 */
export declare function createRedisClient(config: CacheConfig): Promise<Redis>;
/**
 * Scan Redis keys matching a pattern
 */
export declare function scanKeys(redis: Redis, pattern: string): Promise<string[]>;
/**
 * Resolve glob patterns to actual file paths
 */
export declare function resolveGlobPaths(patterns: string[]): Promise<string[]>;
/**
 * Create tarball from paths
 *
 * TODO: Future enhancement - Support multiple compression formats (tar, zip, etc.)
 * and auto-detect available compression tools. See issue for details.
 */
export declare function createTarball(paths: string[], outputFile: string, compression: number): Promise<void>;
/**
 * Extract tarball to filesystem
 * NOTE: targetDir should match the working directory used during tarball creation
 * to properly resolve relative paths
 */
export declare function extractTarball(tarballPath: string, targetDir: string): Promise<void>;
/**
 * Get file size in human-readable format
 */
export declare function formatBytes(bytes: number): string;
/**
 * Get cache key with repository context
 */
export declare function getCacheKey(baseKey: string): string;
/**
 * Validate cache paths exist
 */
export declare function validatePaths(paths: string[]): Promise<string[]>;
