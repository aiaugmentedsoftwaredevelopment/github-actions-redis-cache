/**
 * Redis module types and interfaces
 */

export interface CacheConfig {
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  ttl: number;
  compression: number;
  timeoutSeconds: number;
}
