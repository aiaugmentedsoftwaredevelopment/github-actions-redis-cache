/**
 * Utility functions for file and path operations
 */
/**
 * Resolve glob patterns to actual file paths
 */
export declare function resolveGlobPaths(patterns: string[]): Promise<string[]>;
/**
 * Validate cache paths exist
 */
export declare function validatePaths(paths: string[]): Promise<string[]>;
/**
 * Format bytes to human-readable string
 */
export declare function formatBytes(bytes: number): string;
