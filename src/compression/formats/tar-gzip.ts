/**
 * Tar+Gzip compression format handler
 * Default and preferred compression format for best compatibility and compression ratio
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import {CompressionFormat, CompressionHandler} from '../types';
import {detectTar} from '../detector';
import {formatBytes} from '../../utils';

export class TarGzipHandler implements CompressionHandler {
  readonly format = CompressionFormat.TAR_GZIP;
  readonly priority = 100; // Highest priority - best compression

  async detect(): Promise<boolean> {
    const result = await detectTar();
    return result.available;
  }

  async compress(
    paths: string[],
    outputFile: string,
    compressionLevel: number
  ): Promise<void> {
    core.debug(
      `[tar+gzip] Creating archive with ${paths.length} paths at level ${compressionLevel}`
    );
    core.debug(`[tar+gzip] Output: ${outputFile}`);

    const workingDir = process.cwd();

    // Create list of files to include (relative paths)
    const fileListPath = path.join(path.dirname(outputFile), 'file-list.txt');
    const relativePaths = paths.map(p => path.relative(workingDir, p));
    fs.writeFileSync(fileListPath, relativePaths.join('\n'));

    core.debug(`[tar+gzip] File list created: ${fileListPath}`);
    core.debug(`[tar+gzip] Working directory: ${workingDir}`);

    try {
      // Use tar command for better performance
      const tarArgs = [
        '-czf',
        outputFile,
        '-T',
        fileListPath,
        '--ignore-failed-read', // Continue if some files don't exist
      ];

      core.debug(
        `[tar+gzip] Executing: GZIP=-${compressionLevel} tar ${tarArgs.join(' ')}`
      );

      let tarOutput = '';
      let tarError = '';

      const exitCode = await exec.exec('tar', tarArgs, {
        cwd: workingDir,
        silent: true,
        env: {
          ...process.env,
          GZIP: `-${compressionLevel}`, // Set gzip compression level
        },
        listeners: {
          stdout: (data: Buffer) => {
            tarOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            tarError += data.toString();
          },
        },
      });

      if (exitCode !== 0) {
        core.error(`[tar+gzip] tar command failed with exit code ${exitCode}`);
        core.error(`[tar+gzip] Command: tar ${tarArgs.join(' ')}`);
        core.error(`[tar+gzip] Working directory: ${workingDir}`);
        core.error(`[tar+gzip] File list path: ${fileListPath}`);

        if (tarError) {
          core.error(`[tar+gzip] stderr: ${tarError}`);
        }

        if (tarOutput) {
          core.error(`[tar+gzip] stdout: ${tarOutput}`);
        }

        throw new Error(
          `tar command failed with exit code ${exitCode}: ${tarError || 'Unknown error'}`
        );
      }

      core.debug(`[tar+gzip] Archive created successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if tar command is not found
      if (
        errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')
      ) {
        throw new Error(
          'tar command not found - please install tar utility or use a different compression format'
        );
      }

      throw error;
    } finally {
      // Clean up file list
      if (fs.existsSync(fileListPath)) {
        fs.unlinkSync(fileListPath);
        core.debug(`[tar+gzip] Cleaned up file list: ${fileListPath}`);
      }
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    core.debug(`[tar+gzip] Extracting archive: ${archivePath}`);
    core.debug(`[tar+gzip] Target directory: ${targetDir}`);

    // Verify archive exists and get size
    try {
      const stats = fs.statSync(archivePath);
      core.debug(`[tar+gzip] Archive size: ${formatBytes(stats.size)}`);
    } catch (error) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    // Add verbose flag for better diagnostics
    const tarArgs = ['-xzvf', archivePath, '-C', targetDir];

    core.debug(`[tar+gzip] Executing: tar ${tarArgs.join(' ')}`);

    let tarOutput = '';
    let tarError = '';

    try {
      const exitCode = await exec.exec('tar', tarArgs, {
        silent: false,
        listeners: {
          stdout: (data: Buffer) => {
            tarOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            tarError += data.toString();
          },
        },
      });

      if (exitCode !== 0) {
        core.error(
          `[tar+gzip] tar extraction failed with exit code ${exitCode}`
        );
        core.error(`[tar+gzip] Command: tar ${tarArgs.join(' ')}`);
        core.error(`[tar+gzip] Archive path: ${archivePath}`);
        core.error(`[tar+gzip] Target directory: ${targetDir}`);

        if (tarError) {
          core.error(`[tar+gzip] stderr: ${tarError}`);
        }

        if (tarOutput) {
          core.debug(`[tar+gzip] stdout: ${tarOutput.substring(0, 1000)}`);
        }

        throw new Error(
          `tar extraction failed with exit code ${exitCode}: ${tarError || 'No error message'}`
        );
      }

      core.debug(`[tar+gzip] Extraction completed successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if tar command is not found
      if (
        errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')
      ) {
        throw new Error('tar command not found - please install tar utility');
      }

      // Check for permission issues
      if (
        errorMsg.includes('Permission denied') ||
        errorMsg.includes('EACCES')
      ) {
        throw new Error(
          `Permission denied during extraction. Target directory: ${targetDir}`
        );
      }

      // Check for disk space issues
      if (errorMsg.includes('No space left')) {
        throw new Error('Disk space exhausted during extraction');
      }

      throw error;
    }
  }
}
