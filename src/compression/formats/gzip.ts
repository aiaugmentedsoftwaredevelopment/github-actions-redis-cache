/**
 * Gzip compression format handler
 * Basic fallback option - limited to single file compression
 * Note: This is a simplified implementation that creates a tar-less gzip archive
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import {CompressionFormat, CompressionHandler} from '../types';
import {detectGzip} from '../detector';
import {formatBytes} from '../../utils';

export class GzipHandler implements CompressionHandler {
  readonly format = CompressionFormat.GZIP;
  readonly priority = 25; // Lowest priority - basic compression

  async detect(): Promise<boolean> {
    const result = await detectGzip();
    return result.available;
  }

  async compress(
    paths: string[],
    outputFile: string,
    compressionLevel: number
  ): Promise<void> {
    core.debug(
      `[gzip] Creating archive with ${paths.length} paths at level ${compressionLevel}`
    );
    core.debug(`[gzip] Output: ${outputFile}`);
    core.warning(
      '[gzip] Note: gzip has limited support for multiple files. Consider installing tar or zip for better performance.'
    );

    const workingDir = process.cwd();

    // Create a temporary uncompressed tar archive first
    const tempTar = outputFile.replace(/\.gz$/, '');

    try {
      // Create tar archive (without compression)
      const fileListPath = path.join(
        path.dirname(outputFile),
        'file-list.txt'
      );
      const relativePaths = paths.map(p => path.relative(workingDir, p));
      fs.writeFileSync(fileListPath, relativePaths.join('\n'));

      core.debug(`[gzip] Creating uncompressed tar: ${tempTar}`);

      const tarArgs = ['-cf', tempTar, '-T', fileListPath];

      let tarOutput = '';
      let tarError = '';

      const tarExitCode = await exec.exec('tar', tarArgs, {
        cwd: workingDir,
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            tarOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            tarError += data.toString();
          },
        },
      });

      if (tarExitCode !== 0) {
        throw new Error(
          `tar failed: ${tarError || 'Unknown error'}`
        );
      }

      // Clean up file list
      if (fs.existsSync(fileListPath)) {
        fs.unlinkSync(fileListPath);
      }

      // Compress with gzip
      core.debug(`[gzip] Compressing with gzip level ${compressionLevel}`);

      const gzipArgs = [`-${compressionLevel}`, tempTar];

      let gzipOutput = '';
      let gzipError = '';

      const gzipExitCode = await exec.exec('gzip', gzipArgs, {
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            gzipOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            gzipError += data.toString();
          },
        },
      });

      if (gzipExitCode !== 0) {
        throw new Error(
          `gzip command failed: ${gzipError || 'Unknown error'}`
        );
      }

      // gzip automatically appends .gz and removes the original
      // Rename to expected output file if needed
      const gzippedFile = `${tempTar}.gz`;
      if (gzippedFile !== outputFile && fs.existsSync(gzippedFile)) {
        fs.renameSync(gzippedFile, outputFile);
      }

      core.debug(`[gzip] Archive created successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if gzip command is not found
      if (
        errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')
      ) {
        throw new Error(
          'gzip command not found - please install gzip utility or use a different compression format'
        );
      }

      throw error;
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    core.debug(`[gzip] Extracting archive: ${archivePath}`);
    core.debug(`[gzip] Target directory: ${targetDir}`);

    // Verify archive exists and get size
    try {
      const stats = fs.statSync(archivePath);
      core.debug(`[gzip] Archive size: ${formatBytes(stats.size)}`);
    } catch (error) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    // Decompress to temporary tar file
    const tempTar = path.join(targetDir, 'temp.tar');

    try {
      core.debug(`[gzip] Decompressing to: ${tempTar}`);

      const gunzipArgs = ['-c', archivePath];

      let gunzipOutput = '';
      let gunzipError = '';

      const gunzipExitCode = await exec.exec('gunzip', gunzipArgs, {
        silent: true,
        listeners: {
          stdout: (data: Buffer) => {
            gunzipOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            gunzipError += data.toString();
          },
        },
      });

      if (gunzipExitCode !== 0) {
        throw new Error(
          `gunzip failed: ${gunzipError || 'No error message'}`
        );
      }

      // Write decompressed data to temp tar file
      fs.writeFileSync(tempTar, gunzipOutput);

      // Extract tar file
      core.debug(`[gzip] Extracting tar to: ${targetDir}`);

      const tarArgs = ['-xf', tempTar, '-C', targetDir];

      const tarExitCode = await exec.exec('tar', tarArgs, {
        silent: true,
      });

      if (tarExitCode !== 0) {
        throw new Error('tar extraction failed');
      }

      core.debug(`[gzip] Extraction completed successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if gunzip command is not found
      if (
        errorMsg.includes('command not found') ||
        errorMsg.includes('ENOENT') ||
        errorMsg.includes('not recognized')
      ) {
        throw new Error('gunzip command not found - please install gzip utility');
      }

      throw error;
    } finally {
      // Clean up temp tar file
      if (fs.existsSync(tempTar)) {
        fs.unlinkSync(tempTar);
        core.debug(`[gzip] Cleaned up temp file: ${tempTar}`);
      }
    }
  }
}
