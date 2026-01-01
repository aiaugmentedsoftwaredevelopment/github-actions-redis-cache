/**
 * ZIP compression format handler
 * Fallback option with good Windows compatibility
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import {CompressionFormat, CompressionHandler} from '../types';
import {detectZip} from '../detector';
import {formatBytes} from '../../utils';

export class ZipHandler implements CompressionHandler {
  readonly format = CompressionFormat.ZIP;
  readonly priority = 50; // Medium priority - good compatibility

  async detect(): Promise<boolean> {
    const result = await detectZip();
    return result.available;
  }

  async compress(
    paths: string[],
    outputFile: string,
    compressionLevel: number
  ): Promise<void> {
    core.debug(
      `[zip] Creating archive with ${paths.length} paths at level ${compressionLevel}`
    );
    core.debug(`[zip] Output: ${outputFile}`);

    const workingDir = process.cwd();

    try {
      // zip compression level: -0 (none) to -9 (best)
      const zipArgs = [
        `-${compressionLevel}`, // Compression level
        '-r', // Recursive
        '-q', // Quiet mode
        outputFile,
        ...paths.map(p => p.replace(workingDir + '/', '')), // Relative paths
      ];

      core.debug(`[zip] Executing: zip ${zipArgs.join(' ')}`);

      let zipOutput = '';
      let zipError = '';

      const exitCode = await exec.exec('zip', zipArgs, {
        cwd: workingDir,
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            zipOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            zipError += data.toString();
          },
        },
      });

      if (exitCode !== 0) {
        core.error(`[zip] zip command failed with exit code ${exitCode}`);
        core.error(`[zip] Command: zip ${zipArgs.join(' ')}`);

        if (zipError) {
          core.error(`[zip] stderr: ${zipError}`);
        }

        if (zipOutput) {
          core.error(`[zip] stdout: ${zipOutput}`);
        }

        throw new Error(
          `zip command failed with exit code ${exitCode}: ${zipError || 'Unknown error'}`
        );
      }

      core.debug(`[zip] Archive created successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if zip command is not found
      if (
        errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')
      ) {
        throw new Error(
          'zip command not found - please install zip utility or use a different compression format'
        );
      }

      throw error;
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    core.debug(`[zip] Extracting archive: ${archivePath}`);
    core.debug(`[zip] Target directory: ${targetDir}`);

    // Verify archive exists and get size
    try {
      const stats = fs.statSync(archivePath);
      core.debug(`[zip] Archive size: ${formatBytes(stats.size)}`);
    } catch (error) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    const unzipArgs = [
      '-q', // Quiet mode
      '-o', // Overwrite files without prompting
      archivePath,
      '-d',
      targetDir,
    ];

    core.debug(`[zip] Executing: unzip ${unzipArgs.join(' ')}`);

    let unzipOutput = '';
    let unzipError = '';

    try {
      const exitCode = await exec.exec('unzip', unzipArgs, {
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            unzipOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            unzipError += data.toString();
          },
        },
      });

      if (exitCode !== 0) {
        core.error(`[zip] unzip failed with exit code ${exitCode}`);
        core.error(`[zip] Command: unzip ${unzipArgs.join(' ')}`);

        if (unzipError) {
          core.error(`[zip] stderr: ${unzipError}`);
        }

        if (unzipOutput) {
          core.debug(`[zip] stdout: ${unzipOutput.substring(0, 1000)}`);
        }

        throw new Error(
          `unzip failed with exit code ${exitCode}: ${unzipError || 'No error message'}`
        );
      }

      core.debug(`[zip] Extraction completed successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if unzip command is not found
      if (
        errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')
      ) {
        throw new Error('unzip command not found - please install unzip utility');
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
