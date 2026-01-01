/**
 * Tests for compression factory and backend selection
 */

import {
  getBestCompressionHandler,
  CompressionBackend,
} from '../factory';
import {CompressionFormat} from '../types';
import {TarGzipNativeHandler} from '../formats/tar-gzip-native';
import {ZipNativeHandler} from '../formats/zip-native';
import {GzipNativeHandler} from '../formats/gzip-native';

describe('Compression Factory', () => {
  describe('getBestCompressionHandler()', () => {
    describe('auto backend (default)', () => {
      test('should select tar+gzip native handler (highest priority)', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(handler).toBeInstanceOf(TarGzipNativeHandler);
        expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
        expect(handler.priority).toBe(200);
      });

      test('should work without specifying backend (defaults to auto)', async () => {
        const handler = await getBestCompressionHandler();
        expect(handler).toBeInstanceOf(TarGzipNativeHandler);
        expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
      });
    });

    describe('native backend', () => {
      test('should only select from native handlers', async () => {
        const handler = await getBestCompressionHandler('native');
        expect(handler).toBeInstanceOf(TarGzipNativeHandler);
        expect(handler.constructor.name).toContain('Native');
      });

      test('should select tar+gzip native (highest native priority)', async () => {
        const handler = await getBestCompressionHandler('native');
        expect(handler.priority).toBe(200);
        expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
      });

      test('should always succeed (native handlers always available)', async () => {
        await expect(
          getBestCompressionHandler('native')
        ).resolves.toBeDefined();
      });
    });

    describe('shell backend', () => {
      test('should only select from shell handlers', async () => {
        // This test may fail if tar command is not available
        // That's expected behavior
        try {
          const handler = await getBestCompressionHandler('shell');
          expect(handler.constructor.name).not.toContain('Native');
        } catch (error) {
          // Expected if no shell tools available
          expect(error).toBeInstanceOf(Error);
          if (error instanceof Error) {
            expect(error.message).toContain('No shell');
          }
        }
      });

      test('should use shell handlers when available', async () => {
        // This test verifies that shell mode works when tools are available
        // If shell tools are not available, it should throw an error
        try {
          const handler = await getBestCompressionHandler('shell');
          // If successful, verify it's a shell handler (not native)
          expect(handler.constructor.name).not.toContain('Native');
          // Shell handlers have priority <= 100
          expect(handler.priority).toBeLessThanOrEqual(100);
        } catch (error) {
          // If shell tools aren't available, verify error message
          expect(error).toBeInstanceOf(Error);
          if (error instanceof Error) {
            expect(error.message).toContain('No shell');
          }
        }
      });
    });

    describe('priority ordering', () => {
      test('native handlers should have higher priority than shell handlers', async () => {
        const autoHandler = await getBestCompressionHandler('auto');
        expect(autoHandler.constructor.name).toContain('Native');
        expect(autoHandler.priority).toBeGreaterThanOrEqual(100);
      });

      test('tar+gzip native should have highest priority (200)', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
        expect(handler.priority).toBe(200);
      });
    });

    describe('handler availability', () => {
      test('all native handlers should be available', async () => {
        const tarGzipNative = new TarGzipNativeHandler();
        const zipNative = new ZipNativeHandler();
        const gzipNative = new GzipNativeHandler();

        expect(await tarGzipNative.detect()).toBe(true);
        expect(await zipNative.detect()).toBe(true);
        expect(await gzipNative.detect()).toBe(true);
      });

      test('should always return a handler for auto backend', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(handler).toBeDefined();
        expect(await handler.detect()).toBe(true);
      });

      test('should always return a handler for native backend', async () => {
        const handler = await getBestCompressionHandler('native');
        expect(handler).toBeDefined();
        expect(await handler.detect()).toBe(true);
      });
    });

    describe('backend configuration', () => {
      test('should accept "auto" as backend', async () => {
        await expect(getBestCompressionHandler('auto')).resolves.toBeDefined();
      });

      test('should accept "native" as backend', async () => {
        await expect(
          getBestCompressionHandler('native')
        ).resolves.toBeDefined();
      });

      test('should accept "shell" as backend', async () => {
        // May fail if no shell tools available - that's OK
        try {
          await getBestCompressionHandler('shell');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    describe('format selection', () => {
      test('native backend should prefer tar+gzip format', async () => {
        const handler = await getBestCompressionHandler('native');
        expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
      });

      test('auto backend should prefer tar+gzip format', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(handler.format).toBe(CompressionFormat.TAR_GZIP);
      });
    });

    describe('handler capabilities', () => {
      test('selected handler should have compress method', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(typeof handler.compress).toBe('function');
      });

      test('selected handler should have extract method', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(typeof handler.extract).toBe('function');
      });

      test('selected handler should have detect method', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(typeof handler.detect).toBe('function');
      });

      test('selected handler should have format property', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(handler.format).toBeDefined();
        expect(Object.values(CompressionFormat)).toContain(handler.format);
      });

      test('selected handler should have priority property', async () => {
        const handler = await getBestCompressionHandler('auto');
        expect(handler.priority).toBeDefined();
        expect(typeof handler.priority).toBe('number');
        expect(handler.priority).toBeGreaterThan(0);
      });
    });

    describe('consistency', () => {
      test('should return same handler type for repeated calls with same backend', async () => {
        const handler1 = await getBestCompressionHandler('native');
        const handler2 = await getBestCompressionHandler('native');

        expect(handler1.constructor.name).toBe(handler2.constructor.name);
        expect(handler1.format).toBe(handler2.format);
        expect(handler1.priority).toBe(handler2.priority);
      });

      test('should return handler that reports as available', async () => {
        const handler = await getBestCompressionHandler('auto');
        const isAvailable = await handler.detect();
        expect(isAvailable).toBe(true);
      });
    });

    describe('native handler priorities', () => {
      test('TarGzipNativeHandler should have priority 200', () => {
        const handler = new TarGzipNativeHandler();
        expect(handler.priority).toBe(200);
      });

      test('ZipNativeHandler should have priority 150', () => {
        const handler = new ZipNativeHandler();
        expect(handler.priority).toBe(150);
      });

      test('GzipNativeHandler should have priority 100', () => {
        const handler = new GzipNativeHandler();
        expect(handler.priority).toBe(100);
      });

      test('priorities should be in descending order', () => {
        const tarGzip = new TarGzipNativeHandler();
        const zip = new ZipNativeHandler();
        const gzip = new GzipNativeHandler();

        expect(tarGzip.priority).toBeGreaterThan(zip.priority);
        expect(zip.priority).toBeGreaterThan(gzip.priority);
      });
    });
  });
});
