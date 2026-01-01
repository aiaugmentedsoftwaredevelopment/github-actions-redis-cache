/**
 * Native Node.js Tar+Gzip compression format handler
 * Uses tar-stream and zlib for cross-platform compression without external tools
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {createGzip, createGunzip, constants as zlibConstants} from 'zlib';
import * as tar from 'tar-stream';
import {CompressionFormat, CompressionHandler} from '../types';
import {formatBytes} from '../../utils';

export class TarGzipNativeHandler implements CompressionHandler {
  readonly format = CompressionFormat.TAR_GZIP;
  readonly priority = 200; // Highest priority - always available, no external tools needed

  async detect(): Promise<boolean> {
    // Native Node.js implementation is always available
    return true;
  }

  async compress(
    paths: string[],
    outputFile: string,
    compressionLevel: number
  ): Promise<void> {
    core.debug(
      `[tar+gzip-native] Creating archive with ${paths.length} paths at level ${compressionLevel}`
    );
    core.debug(`[tar+gzip-native] Output: ${outputFile}`);

    const workingDir = process.cwd();
    const pack = tar.pack();
    const gzip = createGzip({
      level: compressionLevel,
      memLevel: zlibConstants.Z_DEFAULT_MEMLEVEL,
    });

    // Create output stream
    const output = fs.createWriteStream(outputFile);

    // Pipe: pack -> gzip -> file
    pack.pipe(gzip).pipe(output);

    let totalFiles = 0;
    let totalBytes = 0;

    try {
      // Process each path
      for (const sourcePath of paths) {
        const absolutePath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.resolve(workingDir, sourcePath);

        // Use basename for archiving to avoid path traversal issues
        const archiveName = path.basename(absolutePath);

        await this.addToTar(pack, absolutePath, archiveName);
        totalFiles++;
      }

      // Finalize the tar archive
      pack.finalize();

      // Wait for all streams to finish
      await new Promise<void>((resolve, reject) => {
        output.on('finish', () => {
          const stats = fs.statSync(outputFile);
          totalBytes = stats.size;
          core.debug(
            `[tar+gzip-native] Archive created: ${formatBytes(totalBytes)} (${totalFiles} files)`
          );
          resolve();
        });
        output.on('error', reject);
        gzip.on('error', reject);
        pack.on('error', reject);
      });
    } catch (error) {
      // Clean up partial archive on error
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
      throw error;
    }
  }

  private async addToTar(
    pack: tar.Pack,
    absolutePath: string,
    relativePath: string
  ): Promise<void> {
    try {
      const stats = await fs.promises.lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        // Add symbolic link
        const linkTarget = await fs.promises.readlink(absolutePath);
        pack.entry(
          {
            name: relativePath,
            type: 'symlink',
            linkname: linkTarget,
            mode: stats.mode,
            mtime: stats.mtime,
          },
          (err) => {
            if (err)
              core.warning(
                `[tar+gzip-native] Failed to add symlink ${relativePath}: ${err.message}`
              );
          }
        );
      } else if (stats.isDirectory()) {
        // Add directory
        pack.entry(
          {
            name: relativePath + '/',
            type: 'directory',
            mode: stats.mode,
            mtime: stats.mtime,
          },
          (err) => {
            if (err)
              core.warning(
                `[tar+gzip-native] Failed to add directory ${relativePath}: ${err.message}`
              );
          }
        );

        // Recursively add directory contents
        const entries = await fs.promises.readdir(absolutePath);
        for (const entry of entries) {
          const entryAbsolute = path.join(absolutePath, entry);
          const entryRelative = path.join(relativePath, entry);
          await this.addToTar(pack, entryAbsolute, entryRelative);
        }
      } else if (stats.isFile()) {
        // Add file
        const fileContent = await fs.promises.readFile(absolutePath);
        await new Promise<void>((resolve, reject) => {
          const entry = pack.entry(
            {
              name: relativePath,
              type: 'file',
              size: stats.size,
              mode: stats.mode,
              mtime: stats.mtime,
            },
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
          entry.write(fileContent);
          entry.end();
        });
      }
    } catch (error) {
      // Log warning but continue with other files
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.warning(
        `[tar+gzip-native] Failed to add ${relativePath}: ${errorMsg}`
      );
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    core.debug(`[tar+gzip-native] Extracting archive: ${archivePath}`);
    core.debug(`[tar+gzip-native] Target directory: ${targetDir}`);

    // Verify archive exists and get size
    try {
      const stats = fs.statSync(archivePath);
      core.debug(`[tar+gzip-native] Archive size: ${formatBytes(stats.size)}`);
    } catch (error) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    // Ensure target directory exists
    await fs.promises.mkdir(targetDir, {recursive: true});

    const extract = tar.extract();
    const gunzip = createGunzip();
    const input = fs.createReadStream(archivePath);

    let extractedFiles = 0;

    // Handle each entry in the tar archive
    extract.on('entry', async (header, stream, next) => {
      const entryPath = path.join(targetDir, header.name);

      core.debug(`[tar+gzip-native] Extracting: ${header.name}`);

      try {
        if (header.type === 'directory') {
          // Create directory
          await fs.promises.mkdir(entryPath, {recursive: true});
          if (header.mode) {
            await fs.promises.chmod(entryPath, header.mode);
          }
          stream.resume();
          next();
        } else if (header.type === 'file') {
          // Ensure parent directory exists
          await fs.promises.mkdir(path.dirname(entryPath), {recursive: true});

          // Write file
          const output = fs.createWriteStream(entryPath);
          stream.pipe(output);

          output.on('finish', async () => {
            if (header.mode) {
              await fs.promises.chmod(entryPath, header.mode);
            }
            extractedFiles++;
            next();
          });

          output.on('error', (err) => {
            core.error(
              `[tar+gzip-native] Failed to write file ${header.name}: ${err.message}`
            );
            next(err);
          });
        } else if (header.type === 'symlink') {
          // Create symbolic link
          const linkTarget = header.linkname || '';
          await fs.promises.mkdir(path.dirname(entryPath), {recursive: true});

          // Remove existing file/link if present
          if (fs.existsSync(entryPath)) {
            await fs.promises.unlink(entryPath);
          }

          await fs.promises.symlink(linkTarget, entryPath);
          stream.resume();
          next();
        } else {
          // Skip unknown types
          core.debug(
            `[tar+gzip-native] Skipping unsupported entry type: ${header.type}`
          );
          stream.resume();
          next();
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        core.error(
          `[tar+gzip-native] Failed to extract ${header.name}: ${errorMsg}`
        );
        stream.resume();
        next();
      }
    });

    // Pipe: file -> gunzip -> extract
    input.pipe(gunzip).pipe(extract);

    // Wait for extraction to complete
    await new Promise<void>((resolve, reject) => {
      extract.on('finish', () => {
        core.debug(
          `[tar+gzip-native] Extraction completed: ${extractedFiles} files`
        );
        resolve();
      });
      extract.on('error', reject);
      gunzip.on('error', reject);
      input.on('error', reject);
    });
  }
}
