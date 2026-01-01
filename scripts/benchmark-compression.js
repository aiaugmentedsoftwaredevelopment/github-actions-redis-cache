#!/usr/bin/env node

/**
 * Compression Performance Benchmark Script
 *
 * Tests all compression backends, formats, and levels with various file sizes.
 * Measures compression time, decompression time, size, ratio, CPU, and memory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {performance} = require('perf_hooks');
const {execSync} = require('child_process');

// Import compression handlers
const {CompressionFormat} = require('../lib/compression/types');
const {
  TarGzipNativeHandler,
  ZipNativeHandler,
  GzipNativeHandler,
  TarGzipHandler,
  ZipHandler,
  GzipHandler
} = require('../lib/compression/formats');

// Benchmark configuration
// Start with smaller files for quick initial benchmarks
// Uncomment larger sizes for comprehensive testing
const FILE_SIZES = [
  {name: '5MB', bytes: 5 * 1024 * 1024},
  {name: '200MB', bytes: 200 * 1024 * 1024}
  // {name: '1GB', bytes: 1024 * 1024 * 1024},
  // {name: '5GB', bytes: 5 * 1024 * 1024 * 1024}
];

const COMPRESSION_LEVELS = [1, 3, 6, 9];

const BACKENDS = ['native', 'shell'];

const FORMATS = [
  CompressionFormat.TAR_GZIP,
  CompressionFormat.ZIP,
  CompressionFormat.GZIP
];

// Test data directory
const TEST_DIR = path.join(__dirname, '..', 'benchmark-temp');
const RESULTS_DIR = path.join(__dirname, '..', 'docs');

/**
 * Generate a test file with specified size
 */
function generateTestFile(sizeName, sizeBytes) {
  const filePath = path.join(TEST_DIR, `test-${sizeName}.bin`);

  if (fs.existsSync(filePath)) {
    console.log(`  ✓ Test file already exists: ${sizeName}`);
    return filePath;
  }

  console.log(`  Generating test file: ${sizeName} (${formatBytes(sizeBytes)})...`);

  // Generate semi-random data (more realistic than zeros)
  const chunkSize = 1024 * 1024; // 1MB chunks
  const fd = fs.openSync(filePath, 'w');
  let remaining = sizeBytes;

  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    const buffer = Buffer.alloc(size);

    // Fill with semi-random data (alternating patterns for realistic compression)
    for (let i = 0; i < size; i++) {
      buffer[i] = (i % 256) ^ ((i >> 8) % 256);
    }

    fs.writeSync(fd, buffer);
    remaining -= size;
  }

  fs.closeSync(fd);
  console.log(`  ✓ Generated: ${sizeName}`);
  return filePath;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format duration to human-readable string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 60000).toFixed(2)} min`;
}

/**
 * Get current process CPU and memory usage
 */
function getResourceUsage() {
  const usage = process.cpuUsage();
  const memory = process.memoryUsage();

  return {
    cpu: (usage.user + usage.system) / 1000000, // Convert to ms
    memory: memory.heapUsed
  };
}

/**
 * Get compression handler by backend and format
 */
function getHandler(backend, format) {
  const handlerMap = {
    native: {
      [CompressionFormat.TAR_GZIP]: TarGzipNativeHandler,
      [CompressionFormat.ZIP]: ZipNativeHandler,
      [CompressionFormat.GZIP]: GzipNativeHandler
    },
    shell: {
      [CompressionFormat.TAR_GZIP]: TarGzipHandler,
      [CompressionFormat.ZIP]: ZipHandler,
      [CompressionFormat.GZIP]: GzipHandler
    }
  };

  const HandlerClass = handlerMap[backend]?.[format];
  if (!HandlerClass) {
    throw new Error(`No handler found for backend=${backend}, format=${format}`);
  }

  return new HandlerClass();
}

/**
 * Run compression benchmark
 */
async function benchmarkCompression(testFile, backend, format, level) {
  const outputFile = path.join(
    TEST_DIR,
    `compressed-${path.basename(testFile)}-${backend}-${format}-L${level}`
  );

  try {
    // Get handler for specific backend and format
    const handler = getHandler(backend, format);

    // Measure compression
    const startUsage = getResourceUsage();
    const startTime = performance.now();

    await handler.compress([testFile], outputFile, level);

    const endTime = performance.now();
    const endUsage = getResourceUsage();

    const compressionTime = endTime - startTime;
    const cpuTime = endUsage.cpu - startUsage.cpu;
    const memoryUsed = endUsage.memory - startUsage.memory;

    // Get file sizes
    const originalSize = fs.statSync(testFile).size;
    const compressedSize = fs.statSync(outputFile).size;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
    const throughput = (originalSize / 1024 / 1024) / (compressionTime / 1000); // MB/s

    return {
      compressionTime,
      compressedSize,
      ratio,
      cpuTime,
      memoryUsed,
      throughput,
      outputFile
    };
  } catch (error) {
    console.error(`    ✗ Compression failed: ${error.message}`);
    return null;
  }
}

/**
 * Run decompression benchmark
 */
async function benchmarkDecompression(compressedFile, backend, format) {
  const extractDir = path.join(
    TEST_DIR,
    `extracted-${path.basename(compressedFile)}`
  );

  try {
    // Ensure clean extract directory
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, {recursive: true, force: true});
    }
    fs.mkdirSync(extractDir, {recursive: true});

    // Get handler for specific backend and format
    const handler = getHandler(backend, format);

    // Measure decompression
    const startUsage = getResourceUsage();
    const startTime = performance.now();

    await handler.extract(compressedFile, extractDir);

    const endTime = performance.now();
    const endUsage = getResourceUsage();

    const decompressionTime = endTime - startTime;
    const cpuTime = endUsage.cpu - startUsage.cpu;
    const memoryUsed = endUsage.memory - startUsage.memory;

    // Cleanup
    fs.rmSync(extractDir, {recursive: true, force: true});

    return {
      decompressionTime,
      cpuTime,
      memoryUsed
    };
  } catch (error) {
    console.error(`    ✗ Decompression failed: ${error.message}`);
    return null;
  }
}

/**
 * Run full benchmark suite
 */
async function runBenchmarks() {
  console.log('='.repeat(80));
  console.log('Compression Performance Benchmark');
  console.log('='.repeat(80));
  console.log();

  // Setup
  console.log('Setup:');
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, {recursive: true});
  }

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, {recursive: true});
  }

  // Generate test files
  console.log('Generating test files...');
  const testFiles = {};
  for (const size of FILE_SIZES) {
    testFiles[size.name] = generateTestFile(size.name, size.bytes);
  }
  console.log();

  // Run benchmarks
  const results = [];
  let totalTests = 0;
  let completedTests = 0;

  // Count total tests
  totalTests = FILE_SIZES.length * BACKENDS.length * FORMATS.length * COMPRESSION_LEVELS.length;

  console.log(`Running ${totalTests} benchmark tests...`);
  console.log();

  for (const size of FILE_SIZES) {
    console.log(`Testing ${size.name}:`);
    const testFile = testFiles[size.name];

    for (const backend of BACKENDS) {
      for (const format of FORMATS) {
        for (const level of COMPRESSION_LEVELS) {
          completedTests++;
          const progress = ((completedTests / totalTests) * 100).toFixed(1);

          console.log(`  [${progress}%] ${backend} / ${format} / Level ${level}...`);

          // Compression benchmark
          const compressionResult = await benchmarkCompression(
            testFile,
            backend,
            format,
            level
          );

          if (!compressionResult) {
            console.log(`    ✗ Skipped (handler not available)`);
            continue;
          }

          console.log(`    ✓ Compressed: ${formatBytes(compressionResult.compressedSize)} (${compressionResult.ratio}% reduction) in ${formatDuration(compressionResult.compressionTime)}`);

          // Decompression benchmark
          const decompressionResult = await benchmarkDecompression(
            compressionResult.outputFile,
            backend,
            format
          );

          if (!decompressionResult) {
            console.log(`    ✗ Decompression skipped`);
            continue;
          }

          console.log(`    ✓ Decompressed in ${formatDuration(decompressionResult.decompressionTime)}`);

          // Store results
          results.push({
            fileSize: size.name,
            fileSizeBytes: size.bytes,
            backend,
            format,
            compressionLevel: level,
            compression: {
              time: compressionResult.compressionTime,
              compressedSize: compressionResult.compressedSize,
              ratio: compressionResult.ratio,
              cpuTime: compressionResult.cpuTime,
              memoryUsed: compressionResult.memoryUsed,
              throughput: compressionResult.throughput
            },
            decompression: {
              time: decompressionResult.decompressionTime,
              cpuTime: decompressionResult.cpuTime,
              memoryUsed: decompressionResult.memoryUsed
            }
          });

          // Cleanup compressed file
          fs.unlinkSync(compressionResult.outputFile);
        }
      }
    }
    console.log();
  }

  // Save results
  console.log('Saving results...');

  // JSON format
  const jsonPath = path.join(RESULTS_DIR, 'benchmark-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`  ✓ JSON: ${jsonPath}`);

  // Markdown format
  const mdPath = path.join(RESULTS_DIR, 'COMPRESSION_BENCHMARKS.md');
  const markdown = generateMarkdownReport(results);
  fs.writeFileSync(mdPath, markdown);
  console.log(`  ✓ Markdown: ${mdPath}`);

  // Cleanup
  console.log();
  console.log('Cleaning up test files...');
  fs.rmSync(TEST_DIR, {recursive: true, force: true});
  console.log('  ✓ Done');

  console.log();
  console.log('='.repeat(80));
  console.log('Benchmark Complete!');
  console.log('='.repeat(80));
}

/**
 * Generate markdown report from results
 */
function generateMarkdownReport(results) {
  const sections = [];

  // Header
  sections.push('# Compression Performance Benchmarks');
  sections.push('');
  sections.push('Benchmark results comparing native Node.js compression vs shell command compression across different formats, levels, and file sizes.');
  sections.push('');
  sections.push('## Test Environment');
  sections.push('');
  sections.push(`- **Platform**: ${os.platform()} ${os.arch()}`);
  sections.push(`- **Node.js**: ${process.version}`);
  sections.push(`- **CPU**: ${os.cpus()[0].model}`);
  sections.push(`- **CPU Cores**: ${os.cpus().length}`);
  sections.push(`- **Total Memory**: ${formatBytes(os.totalmem())}`);
  sections.push(`- **Date**: ${new Date().toISOString()}`);
  sections.push('');

  // Summary table
  sections.push('## Summary');
  sections.push('');
  sections.push('### Compression Performance by Backend');
  sections.push('');
  sections.push('| Backend | Format | Avg Compression Time | Avg Decompression Time | Avg Ratio | Avg Throughput |');
  sections.push('|---------|--------|---------------------|------------------------|-----------|----------------|');

  const summary = {};
  results.forEach(r => {
    const key = `${r.backend}-${r.format}`;
    if (!summary[key]) {
      summary[key] = {
        backend: r.backend,
        format: r.format,
        compressionTimes: [],
        decompressionTimes: [],
        ratios: [],
        throughputs: []
      };
    }
    summary[key].compressionTimes.push(r.compression.time);
    summary[key].decompressionTimes.push(r.decompression.time);
    summary[key].ratios.push(parseFloat(r.compression.ratio));
    summary[key].throughputs.push(r.compression.throughput);
  });

  Object.values(summary).forEach(s => {
    const avgCompTime = s.compressionTimes.reduce((a, b) => a + b, 0) / s.compressionTimes.length;
    const avgDecompTime = s.decompressionTimes.reduce((a, b) => a + b, 0) / s.decompressionTimes.length;
    const avgRatio = s.ratios.reduce((a, b) => a + b, 0) / s.ratios.length;
    const avgThroughput = s.throughputs.reduce((a, b) => a + b, 0) / s.throughputs.length;

    sections.push(`| ${s.backend} | ${s.format} | ${formatDuration(avgCompTime)} | ${formatDuration(avgDecompTime)} | ${avgRatio.toFixed(2)}% | ${avgThroughput.toFixed(2)} MB/s |`);
  });

  sections.push('');

  // Detailed results by file size
  for (const size of FILE_SIZES) {
    const sizeResults = results.filter(r => r.fileSize === size.name);

    if (sizeResults.length === 0) continue;

    sections.push(`## ${size.name} File`);
    sections.push('');
    sections.push('### Compression Results');
    sections.push('');
    sections.push('| Backend | Format | Level | Time | Size | Ratio | Throughput | CPU | Memory |');
    sections.push('|---------|--------|-------|------|------|-------|------------|-----|--------|');

    sizeResults.forEach(r => {
      sections.push(
        `| ${r.backend} | ${r.format} | ${r.compressionLevel} | ` +
        `${formatDuration(r.compression.time)} | ${formatBytes(r.compression.compressedSize)} | ` +
        `${r.compression.ratio}% | ${r.compression.throughput.toFixed(2)} MB/s | ` +
        `${r.compression.cpuTime.toFixed(0)} ms | ${formatBytes(r.compression.memoryUsed)} |`
      );
    });

    sections.push('');
    sections.push('### Decompression Results');
    sections.push('');
    sections.push('| Backend | Format | Level | Time | CPU | Memory |');
    sections.push('|---------|--------|-------|------|-----|--------|');

    sizeResults.forEach(r => {
      sections.push(
        `| ${r.backend} | ${r.format} | ${r.compressionLevel} | ` +
        `${formatDuration(r.decompression.time)} | ${r.decompression.cpuTime.toFixed(0)} ms | ` +
        `${formatBytes(r.decompression.memoryUsed)} |`
      );
    });

    sections.push('');
  }

  // Recommendations
  sections.push('## Recommendations');
  sections.push('');
  sections.push('Based on the benchmark results:');
  sections.push('');
  sections.push('1. **Native vs Shell**: Compare average compression times to determine which backend is faster for your use case');
  sections.push('2. **Format Selection**: Choose format based on your priority:');
  sections.push('   - Best compression ratio: Check highest ratio percentages');
  sections.push('   - Fastest compression: Check lowest compression times');
  sections.push('   - Fastest decompression: Check lowest decompression times');
  sections.push('3. **Compression Level**: Higher levels (6-9) offer better compression but take longer');
  sections.push('4. **Throughput**: MB/s metric shows raw compression speed');
  sections.push('');
  sections.push('## Notes');
  sections.push('');
  sections.push('- All tests use semi-random test data (alternating patterns)');
  sections.push('- CPU time is process CPU usage, not wall-clock time');
  sections.push('- Memory usage is heap memory delta during operation');
  sections.push('- Results may vary based on hardware, OS, and data characteristics');
  sections.push('');

  return sections.join('\n');
}

// Run benchmarks
if (require.main === module) {
  runBenchmarks().catch(error => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}

module.exports = {runBenchmarks};
