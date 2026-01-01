/**
 * Native Node.js LZ4 compression format handler
 * Uses lz4js for ultra-fast compression without external tools
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as lz4 from 'lz4js';
import * as tar from 'tar-stream';
import {CompressionFormat, CompressionHandler} from '../types';
import {formatBytes} from '../../utils';

export class Lz4NativeHandler implements CompressionHandler {
  readonly format = CompressionFormat.LZ4;
  readonly priority = 50; // Low priority - pure JS implementation is very slow for large files

  async detect(): Promise<boolean> {
    // Pure JavaScript implementation is always available
    return true;
  }

  async compress(
    paths: string[],
    outputFile: string,
    compressionLevel: number
  ): Promise<void> {
    core.debug(
      `[lz4-native] Creating archive with ${paths.length} paths at level ${compressionLevel}`
    );
    core.debug(`[lz4-native] Output: ${outputFile}`);
    core.debug(
      '[lz4-native] Note: Creating tar+lz4 archive (tar + lz4 compression)'
    );

    const workingDir = process.cwd();
    const pack = tar.pack();

    let totalFiles = 0;

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

      // Collect tar data into buffer
      const tarChunks: Buffer[] = [];
      pack.on('data', (chunk: Buffer) => {
        tarChunks.push(chunk);
      });

      await new Promise<void>((resolve, reject) => {
        pack.on('end', () => resolve());
        pack.on('error', reject);
      });

      // Combine tar chunks
      const tarBuffer = Buffer.concat(tarChunks);

      // Compress with LZ4
      core.debug(
        `[lz4-native] Compressing ${formatBytes(tarBuffer.length)} tar data with LZ4`
      );

      // lz4js compress returns Uint8Array
      const compressed = lz4.compress(new Uint8Array(tarBuffer));
      const compressedBuffer = Buffer.from(compressed);

      // Write compressed data to file
      await fs.promises.writeFile(outputFile, compressedBuffer);

      const totalBytes = compressedBuffer.length;
      core.debug(
        `[lz4-native] Archive created: ${formatBytes(totalBytes)} (${totalFiles} files)`
      );
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
                `[lz4-native] Failed to add symlink ${relativePath}: ${err.message}`
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
                `[lz4-native] Failed to add directory ${relativePath}: ${err.message}`
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
      core.warning(`[lz4-native] Failed to add ${relativePath}: ${errorMsg}`);
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    core.debug(`[lz4-native] Extracting archive: ${archivePath}`);
    core.debug(`[lz4-native] Target directory: ${targetDir}`);

    // Verify archive exists and get size
    try {
      const stats = fs.statSync(archivePath);
      core.debug(`[lz4-native] Archive size: ${formatBytes(stats.size)}`);
    } catch (error) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    // Ensure target directory exists
    await fs.promises.mkdir(targetDir, {recursive: true});

    try {
      // Read compressed file
      const compressedBuffer = await fs.promises.readFile(archivePath);

      // Decompress with LZ4
      core.debug(
        `[lz4-native] Decompressing ${formatBytes(compressedBuffer.length)} LZ4 data`
      );

      const decompressed = lz4.decompress(new Uint8Array(compressedBuffer));
      const tarBuffer = Buffer.from(decompressed);

      core.debug(
        `[lz4-native] Decompressed to ${formatBytes(tarBuffer.length)} tar data`
      );

      // Extract tar
      const extract = tar.extract();
      let extractedFiles = 0;

      // Handle each entry in the tar archive
      extract.on('entry', async (header, stream, next) => {
        const entryPath = path.join(targetDir, header.name);

        core.debug(`[lz4-native] Extracting: ${header.name}`);

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
                `[lz4-native] Failed to write file ${header.name}: ${err.message}`
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
              `[lz4-native] Skipping unsupported entry type: ${header.type}`
            );
            stream.resume();
            next();
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          core.error(
            `[lz4-native] Failed to extract ${header.name}: ${errorMsg}`
          );
          stream.resume();
          next();
        }
      });

      // Feed tar data to extractor
      extract.write(tarBuffer);
      extract.end();

      // Wait for extraction to complete
      await new Promise<void>((resolve, reject) => {
        extract.on('finish', () => {
          core.debug(
            `[lz4-native] Extraction completed: ${extractedFiles} files`
          );
          resolve();
        });
        extract.on('error', reject);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract LZ4 archive: ${errorMsg}`);
    }
  }
}
