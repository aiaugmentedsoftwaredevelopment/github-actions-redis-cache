/**
 * Utility functions for file and path operations
 */

import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as fs from 'fs';

/**
 * Resolve glob patterns to actual file paths
 */
export async function resolveGlobPaths(patterns: string[]): Promise<string[]> {
  core.debug(`Resolving ${patterns.length} glob patterns`);

  const resolvedPaths: string[] = [];

  for (const pattern of patterns) {
    try {
      core.debug(`  Processing pattern: ${pattern}`);

      const globber = await glob.create(pattern.trim(), {
        followSymbolicLinks: false,
      });
      const files = await globber.glob();

      if (files.length > 0) {
        core.debug(`    Matched ${files.length} files`);
        resolvedPaths.push(...files);
      } else {
        core.debug(`    No files matched this pattern`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.warning(`Failed to resolve pattern "${pattern}": ${errorMsg}`);

      if (
        errorMsg.includes('Permission denied') ||
        errorMsg.includes('EACCES')
      ) {
        core.warning('  - Check file/directory permissions');
        core.warning('  - Pattern may reference inaccessible location');
      } else if (errorMsg.includes('ENOENT')) {
        core.warning('  - Path does not exist');
        core.warning('  - Verify the pattern is correct');
      }
    }
  }

  const uniquePaths = [...new Set(resolvedPaths)];
  core.debug(`  Total unique paths resolved: ${uniquePaths.length}`);

  return uniquePaths;
}

/**
 * Validate cache paths exist
 */
export async function validatePaths(paths: string[]): Promise<string[]> {
  const validPaths: string[] = [];

  for (const p of paths) {
    try {
      const stat = fs.statSync(p);
      if (stat) {
        validPaths.push(p);
      }
    } catch (error) {
      core.debug(`Path does not exist: ${p}`);
    }
  }

  return validPaths;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
