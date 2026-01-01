/**
 * Tests for native ZIP compression handler
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {ZipNativeHandler} from '../zip-native';
import {CompressionFormat} from '../../types';

describe('ZipNativeHandler', () => {
  let handler: ZipNativeHandler;
  let testDir: string;
  let archivePath: string;

  beforeEach(() => {
    handler = new ZipNativeHandler();
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-native-test-'));
    archivePath = path.join(testDir, 'test-archive.zip');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, {recursive: true, force: true});
    }
  });

  describe('metadata', () => {
    test('should have correct format', () => {
      expect(handler.format).toBe(CompressionFormat.ZIP);
    });

    test('should have high priority', () => {
      expect(handler.priority).toBe(150);
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
      const testContent = 'Hello, ZIP!';
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
        {name: 'file1.txt', content: 'ZIP Content 1'},
        {name: 'file2.txt', content: 'ZIP Content 2'},
        {name: 'file3.txt', content: 'ZIP Content 3'},
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
      const deepDir = path.join(subDir, 'deep');
      fs.mkdirSync(subDir);
      fs.mkdirSync(deepDir);
      fs.writeFileSync(path.join(testDir, 'root.txt'), 'Root file');
      fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested file');
      fs.writeFileSync(path.join(deepDir, 'deep.txt'), 'Deep file');

      // Compress entire directory
      await handler.compress([testDir], archivePath, 6);

      // Extract to new directory
      const extractDir = path.join(os.tmpdir(), 'zip-extract-' + Date.now());
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify directory structure
      const baseName = path.basename(testDir);
      const extractedRoot = path.join(extractDir, baseName, 'root.txt');
      const extractedNested = path.join(
        extractDir,
        baseName,
        'subdir',
        'nested.txt'
      );
      const extractedDeep = path.join(
        extractDir,
        baseName,
        'subdir',
        'deep',
        'deep.txt'
      );

      expect(fs.existsSync(extractedRoot)).toBe(true);
      expect(fs.existsSync(extractedNested)).toBe(true);
      expect(fs.existsSync(extractedDeep)).toBe(true);
      expect(fs.readFileSync(extractedRoot, 'utf8')).toBe('Root file');
      expect(fs.readFileSync(extractedNested, 'utf8')).toBe('Nested file');
      expect(fs.readFileSync(extractedDeep, 'utf8')).toBe('Deep file');

      // Cleanup
      fs.rmSync(extractDir, {recursive: true, force: true});
    });

    test('should respect different compression levels', async () => {
      // Create a test file with compressible content
      const testFile = path.join(testDir, 'compressible.txt');
      const content = 'B'.repeat(10000); // Highly compressible
      fs.writeFileSync(testFile, content);

      // Compress with level 1 (fastest, least compression)
      const archive1 = path.join(testDir, 'level1.zip');
      await handler.compress([testFile], archive1, 1);
      const size1 = fs.statSync(archive1).size;

      // Compress with level 9 (slowest, best compression)
      const archive9 = path.join(testDir, 'level9.zip');
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

      // Verify archive was created (even if empty directories aren't preserved in ZIP)
      expect(fs.existsSync(archivePath)).toBe(true);

      // Extract
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Note: Standard ZIP format doesn't always preserve truly empty directories
      // This is expected behavior and not a bug
      // Just verify extraction completes without error
      expect(fs.existsSync(extractDir)).toBe(true);
    });

    test('should handle large files', async () => {
      // Create a larger file (1MB)
      const testFile = path.join(testDir, 'large.bin');
      const buffer = Buffer.alloc(1024 * 1024, 'y');
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
      // Create files with special characters (Windows-compatible)
      const specialNames = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
      ];

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
      const nonExistentArchive = path.join(testDir, 'nonexistent.zip');
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);

      await expect(
        handler.extract(nonExistentArchive, extractDir)
      ).rejects.toThrow('Archive file not found');
    });

    test('should create target directory if it does not exist', async () => {
      // Create test file
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Test content for ZIP');

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

    test('should handle binary files', async () => {
      // Create binary file
      const binaryFile = path.join(testDir, 'binary.bin');
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      fs.writeFileSync(binaryFile, binaryData);

      // Compress
      await handler.compress([binaryFile], archivePath, 6);

      // Extract
      const extractDir = path.join(testDir, 'extract');
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify binary data
      const extractedFile = path.join(extractDir, 'binary.bin');
      const extractedData = fs.readFileSync(extractedFile);
      expect(extractedData).toEqual(binaryData);
    });

    test('should handle compression of relative paths', async () => {
      // Save current directory
      const originalCwd = process.cwd();

      try {
        // Change to test directory
        process.chdir(testDir);

        // Create file
        fs.writeFileSync('relative-zip.txt', 'Relative path for ZIP');

        // Compress with relative path
        const archive = path.join(testDir, 'relative.zip');
        await handler.compress(['relative-zip.txt'], archive, 6);

        // Extract
        const extractDir = path.join(testDir, 'extract');
        fs.mkdirSync(extractDir);
        await handler.extract(archive, extractDir);

        // Verify
        const extractedFile = path.join(extractDir, 'relative-zip.txt');
        expect(fs.existsSync(extractedFile)).toBe(true);
        expect(fs.readFileSync(extractedFile, 'utf8')).toBe(
          'Relative path for ZIP'
        );
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });

    test('should handle multiple directory levels', async () => {
      // Create deep directory structure
      const level1 = path.join(testDir, 'level1');
      const level2 = path.join(level1, 'level2');
      const level3 = path.join(level2, 'level3');
      fs.mkdirSync(level1);
      fs.mkdirSync(level2);
      fs.mkdirSync(level3);
      fs.writeFileSync(path.join(level3, 'deep.txt'), 'Deep content');

      // Compress
      await handler.compress([testDir], archivePath, 6);

      // Extract
      const extractDir = path.join(os.tmpdir(), 'zip-deep-' + Date.now());
      fs.mkdirSync(extractDir);
      await handler.extract(archivePath, extractDir);

      // Verify deep file
      const deepFile = path.join(
        extractDir,
        path.basename(testDir),
        'level1',
        'level2',
        'level3',
        'deep.txt'
      );
      expect(fs.existsSync(deepFile)).toBe(true);
      expect(fs.readFileSync(deepFile, 'utf8')).toBe('Deep content');

      // Cleanup
      fs.rmSync(extractDir, {recursive: true, force: true});
    });
  });
});
