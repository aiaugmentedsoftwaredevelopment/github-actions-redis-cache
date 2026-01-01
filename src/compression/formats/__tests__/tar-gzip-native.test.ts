/**
 * Tests for native tar+gzip compression handler
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {TarGzipNativeHandler} from '../tar-gzip-native';
import {CompressionFormat} from '../../types';

describe('TarGzipNativeHandler', () => {
  let handler: TarGzipNativeHandler;
  let testDir: string;
  let archivePath: string;

  beforeEach(() => {
    handler = new TarGzipNativeHandler();
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-gzip-native-test-'));
    archivePath = path.join(testDir, 'test-archive.tar.gz');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, {recursive: true, force: true});
    }
  });

  describe('metadata', () => {
    test('should have correct format', () => {
      expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
    });

    test('should have highest priority', () => {
      expect(handler.priority).toBe(200);
    });
  });

  describe('detect()', () => {
    test('should always return true (native implementation)', async () => {
      const isAvailable = await handler.detect();
      expect(isAvailable).toBe(true);
    });
  });

  describe('compress() and extract()', () => {
    test('should compress and extract a single file', async () => {
      // Create test file
      const testFile = path.join(testDir, 'test.txt');
      const testContent = 'Hello, World!';
      fs.writeFileSync(testFile, testContent);

      // Compress
      await handler.compress([testFile], archivePath, 6);

      // Verify archive was created
      expect(fs.existsSync(archivePath)).toBe(true);
      const archiveStats = fs.statSync(archivePath);
      expect(archiveStats.size).toBeGreaterThan(0);

      // Extract to new directory
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify extracted file
      const extractedFile = path.join(extractDir, 'test.txt');
      expect(fs.existsSync(extractedFile)).toBe(true);
      const extractedContent = fs.readFileSync(extractedFile, 'utf8');
      expect(extractedContent).toBe(testContent);
    });

    test('should compress and extract multiple files', async () => {
      // Create test files
      const files = [
        {name: 'file1.txt', content: 'Content 1'},
        {name: 'file2.txt', content: 'Content 2'},
        {name: 'file3.txt', content: 'Content 3'},
      ];

      const testPaths: string[] = [];
      for (const file of files) {
        const filePath = path.join(testDir, file.name);
        fs.writeFileSync(filePath, file.content);
        testPaths.push(filePath);
      }

      // Compress
      await handler.compress(testPaths, archivePath, 6);

      // Extract to new directory
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify all extracted files
      for (const file of files) {
        const extractedFile = path.join(extractDir, file.name);
        expect(fs.existsSync(extractedFile)).toBe(true);
        const extractedContent = fs.readFileSync(extractedFile, 'utf8');
        expect(extractedContent).toBe(file.content);
      }
    });

    test('should compress and extract a directory structure', async () => {
      // Create directory structure
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(testDir, 'root.txt'), 'Root file');
      fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file');

      // Compress entire directory
      await handler.compress([testDir], archivePath, 6);

      // Extract to new directory
      const extractDir = path.join(os.tmpdir(), 'extract-' + Date.now());
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify directory structure
      const extractedRoot = path.join(
        extractDir,
        path.basename(testDir),
        'root.txt'
      );
      const extractedNested = path.join(
        extractDir,
        path.basename(testDir),
        'subdir',
        'nested.txt'
      );

      expect(fs.existsSync(extractedRoot)).toBe(true);
      expect(fs.existsSync(extractedNested)).toBe(true);
      expect(fs.readFileSync(extractedRoot, 'utf8')).toBe('Root file');
      expect(fs.readFileSync(extractedNested, 'utf8')).toBe('Nested file');

      // Cleanup
      fs.rmSync(extractDir, {recursive: true, force: true});
    });

    test('should respect different compression levels', async () => {
      // Create a test file with compressible content
      const testFile = path.join(testDir, 'compressible.txt');
      const content = 'A'.repeat(10000); // Highly compressible
      fs.writeFileSync(testFile, content);

      // Compress with level 1 (fastest, least compression)
      const archive1 = path.join(testDir, 'level1.tar.gz');
      await handler.compress([testFile], archive1, 1);
      const size1 = fs.statSync(archive1).size;

      // Compress with level 9 (slowest, best compression)
      const archive9 = path.join(testDir, 'level9.tar.gz');
      await handler.compress([testFile], archive9, 9);
      const size9 = fs.statSync(archive9).size;

      // Level 9 should produce smaller file
      expect(size9).toBeLessThan(size1);
    });

    test('should handle empty directory', async () => {
      // Create empty directory
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir);

      // Compress
      await handler.compress([emptyDir], archivePath, 6);

      // Extract
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify directory exists
      const extractedEmptyDir = path.join(extractDir, 'empty');
      expect(fs.existsSync(extractedEmptyDir)).toBe(true);
      expect(fs.statSync(extractedEmptyDir).isDirectory()).toBe(true);
    });

    test('should preserve file permissions', async () => {
      // Skip on Windows (doesn't support Unix permissions)
      if (process.platform === 'win32') {
        return;
      }

      // Create file with specific permissions
      const testFile = path.join(testDir, 'executable.sh');
      fs.writeFileSync(testFile, '#!/bin/bash\necho "test"');
      fs.chmodSync(testFile, 0o755); // rwxr-xr-x

      // Compress
      await handler.compress([testFile], archivePath, 6);

      // Extract
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify permissions
      const extractedFile = path.join(extractDir, 'executable.sh');
      const stats = fs.statSync(extractedFile);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o755);
    });

    test('should handle large files', async () => {
      // Create a larger file (1MB)
      const testFile = path.join(testDir, 'large.bin');
      const buffer = Buffer.alloc(1024 * 1024, 'x');
      fs.writeFileSync(testFile, buffer);

      // Compress
      await handler.compress([testFile], archivePath, 6);

      // Extract
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify file size
      const extractedFile = path.join(extractDir, 'large.bin');
      const extractedStats = fs.statSync(extractedFile);
      expect(extractedStats.size).toBe(1024 * 1024);
    });

    test('should handle files with special characters in names', async () => {
      // Create files with special characters
      const specialNames = ['file with spaces.txt', 'file-with-dashes.txt'];

      const testPaths: string[] = [];
      for (const name of specialNames) {
        const filePath = path.join(testDir, name);
        fs.writeFileSync(filePath, `Content of ${name}`);
        testPaths.push(filePath);
      }

      // Compress
      await handler.compress(testPaths, archivePath, 6);

      // Extract
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify all files extracted
      for (const name of specialNames) {
        const extractedFile = path.join(extractDir, name);
        expect(fs.existsSync(extractedFile)).toBe(true);
      }
    });

    test('should throw error when extracting non-existent archive', async () => {
      const nonExistentArchive = path.join(testDir, 'nonexistent.tar.gz');
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);

      await expect(
        handler.extract(nonExistentArchive, extractDir)
      ).rejects.toThrow('Archive file not found');
    });

    test('should create target directory if it does not exist', async () => {
      // Create test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test content');

      // Compress
      await handler.compress([testFile], archivePath, 6);

      // Extract to non-existent directory
      const extractDir = path.join(testDir, 'nested', 'extract', 'dir');
      await handler.extract(archivePath, extractDir);

      // Verify directory was created and file extracted
      expect(fs.existsSync(extractDir)).toBe(true);
      const extractedFile = path.join(extractDir, 'test.txt');
      expect(fs.existsSync(extractedFile)).toBe(true);
    });

    test('should handle compression of relative paths', async () => {
      // Save current directory
      const originalCwd = process.cwd();

      try {
        // Change to test directory
        process.chdir(testDir);

        // Create file
        fs.writeFileSync('relative.txt', 'Relative path content');

        // Compress with relative path
        const archive = path.join(testDir, 'relative.tar.gz');
        await handler.compress(['relative.txt'], archive, 6);

        // Extract
        const extractDir = path.join(testDir, 'extract');
        fs.mkdirSync(extractDir);
        await handler.extract(archive, extractDir);

        // Verify
        const extractedFile = path.join(extractDir, 'relative.txt');
        expect(fs.existsSync(extractedFile)).toBe(true);
        expect(fs.readFileSync(extractedFile, 'utf8')).toBe(
          'Relative path content'
        );
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });
  });
});
