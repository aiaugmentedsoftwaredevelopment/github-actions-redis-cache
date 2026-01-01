/**
 * Redis client creation and connection management
 */
import { Redis } from 'ioredis';
import { CacheConfig } from './types';
/**
 * Create Redis client with configuration and retry logic
 */
export declare function createRedisClient(config: CacheConfig): Promise<Redis>;
//# sourceMappingURL=client.d.ts.map