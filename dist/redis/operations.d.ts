/**
 * Redis operations for cache key management
 */
import { Redis } from 'ioredis';
/**
 * Scan Redis keys matching a pattern
 */
export declare function scanKeys(redis: Redis, pattern: string): Promise<string[]>;
/**
 * Get cache key with repository context to avoid collisions
 */
export declare function getCacheKey(baseKey: string): string;
//# sourceMappingURL=operations.d.ts.map