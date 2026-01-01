/**
 * Native Node.js ZIP compression format handler
 * Uses archiver and unzipper for cross-platform compression without external tools
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import {CompressionFormat, CompressionHandler} from '../types';
import {formatBytes} from '../../utils';

export class ZipNativeHandler implements CompressionHandler {
  readonly format = CompressionFormat.ZIP;
  readonly priority = 150; // High priority - always available, no external tools needed

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
      `[zip-native] Creating archive with ${paths.length} paths at level ${compressionLevel}`
    );
    core.debug(`[zip-native] Output: ${outputFile}`);

    const workingDir = process.cwd();
    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', {
      zlib: {level: compressionLevel},
    });

    let totalFiles = 0;
    let totalBytes = 0;

    // Track archive progress
    archive.on('entry', (entry) => {
      totalFiles++;
      core.debug(`[zip-native] Adding: ${entry.name}`);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        core.warning(`[zip-native] File not found: ${err.message}`);
      } else {
        throw err;
      }
    });

    archive.on('error', (err) => {
      throw err;
    });

    // Pipe archive to output file
    archive.pipe(output);

    try {
      // Add each path to the archive
      for (const sourcePath of paths) {
        const absolutePath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.resolve(workingDir, sourcePath);

        // Use basename for archiving to avoid path traversal issues
        const archiveName = path.basename(absolutePath);

        try {
          const stats = await fs.promises.lstat(absolutePath);

          if (stats.isDirectory()) {
            // Add directory recursively
            archive.directory(absolutePath, archiveName);
          } else if (stats.isFile()) {
            // Add file
            archive.file(absolutePath, {name: archiveName});
          } else if (stats.isSymbolicLink()) {
            // Add symbolic link as file (archiver doesn't preserve symlinks in zip)
            const linkTarget = await fs.promises.readlink(absolutePath);
            core.debug(
              `[zip-native] Adding symlink as regular file: ${archiveName} -> ${linkTarget}`
            );
            archive.file(absolutePath, {name: archiveName});
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          core.warning(
            `[zip-native] Failed to add ${archiveName}: ${errorMsg}`
          );
        }
      }

      // Finalize the archive
      await archive.finalize();

      // Wait for output stream to finish
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => {
          totalBytes = archive.pointer();
          core.debug(
            `[zip-native] Archive created: ${formatBytes(totalBytes)} (${totalFiles} entries)`
          );
          resolve();
        });
        output.on('error', reject);
      });
    } catch (error) {
      // Clean up partial archive on error
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
      throw error;
    }
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    core.debug(`[zip-native] Extracting archive: ${archivePath}`);
    core.debug(`[zip-native] Target directory: ${targetDir}`);

    // Verify archive exists and get size
    try {
      const stats = fs.statSync(archivePath);
      core.debug(`[zip-native] Archive size: ${formatBytes(stats.size)}`);
    } catch (error) {
      throw new Error(`Archive file not found: ${archivePath}`);
    }

    // Ensure target directory exists
    await fs.promises.mkdir(targetDir, {recursive: true});

    let extractedFiles = 0;
    const pendingWrites: Promise<void>[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(archivePath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            const fileName = entry.path;
            const entryPath = path.join(targetDir, fileName);
            const type = entry.type;

            core.debug(`[zip-native] Extracting: ${fileName} (${type})`);

            if (type === 'Directory') {
              // Create directory and drain entry
              const dirPromise = fs.promises
                .mkdir(entryPath, {recursive: true})
                .then(() => {
                  extractedFiles++;
                  entry.autodrain();
                })
                .catch((err) => {
                  core.error(
                    `[zip-native] Failed to create directory ${fileName}: ${err.message}`
                  );
                  entry.autodrain();
                });
              pendingWrites.push(dirPromise);
            } else {
              // Extract file
              const filePromise = new Promise<void>((fileResolve, fileReject) => {
                // Ensure parent directory exists
                fs.promises
                  .mkdir(path.dirname(entryPath), {recursive: true})
                  .then(() => {
                    // Write file
                    const writeStream = fs.createWriteStream(entryPath);
                    entry.pipe(writeStream);

                    writeStream.on('finish', () => {
                      extractedFiles++;
                      fileResolve();
                    });

                    writeStream.on('error', (err: Error) => {
                      core.error(
                        `[zip-native] Failed to write file ${fileName}: ${err.message}`
                      );
                      entry.autodrain();
                      fileReject(err);
                    });

                    entry.on('error', (err: Error) => {
                      core.error(
                        `[zip-native] Entry error ${fileName}: ${err.message}`
                      );
                      fileReject(err);
                    });
                  })
                  .catch((err) => {
                    core.error(
                      `[zip-native] Failed to create parent directory for ${fileName}: ${err.message}`
                    );
                    entry.autodrain();
                    fileReject(err);
                  });
              });

              pendingWrites.push(filePromise);
            }
          })
          .on('close', async () => {
            // Wait for all pending writes to complete
            try {
              await Promise.all(pendingWrites);
              core.debug(
                `[zip-native] Extraction completed: ${extractedFiles} entries`
              );
              resolve();
            } catch (err) {
              reject(err);
            }
          })
          .on('error', (err: Error) => {
            reject(err);
          });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract ZIP archive: ${errorMsg}`);
    }
  }
}
