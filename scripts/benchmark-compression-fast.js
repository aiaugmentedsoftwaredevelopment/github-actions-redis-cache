#!/usr/bin/env node

/**
 * Fast compression benchmarking script
 * Tests realistic file sizes for each format
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {performance} = require('perf_hooks');

// Import compression handlers
const {CompressionFormat} = require('../lib/compression/types');
const {
  TarGzipNativeHandler,
  ZipNativeHandler,
  GzipNativeHandler,
  Lz4NativeHandler,
} = require('../lib/compression/formats');

// Format-specific configurations
const BENCHMARK_CONFIGS = [
  // LZ4 - test with smaller files due to pure JS implementation
  {
    format: CompressionFormat.LZ4,
    handler: Lz4NativeHandler,
    fileSizes: [{name: '1MB', size: 1 * 1024 * 1024}],
    levels: [1, 6],
  },
  // Other formats - can handle larger files
  {
    format: CompressionFormat.TAR_GZIP,
    handler: TarGzipNativeHandler,
    fileSizes: [
      {name: '5MB', size: 5 * 1024 * 1024},
      {name: '50MB', size: 50 * 1024 * 1024},
    ],
    levels: [1, 6, 9],
  },
  {
    format: CompressionFormat.ZIP,
    handler: ZipNativeHandler,
    fileSizes: [
      {name: '5MB', size: 5 * 1024 * 1024},
      {name: '50MB', size: 50 * 1024 * 1024},
    ],
    levels: [1, 6, 9],
  },
  {
    format: CompressionFormat.GZIP,
    handler: GzipNativeHandler,
    fileSizes: [
      {name: '5MB', size: 5 * 1024 * 1024},
      {name: '50MB', size: 50 * 1024 * 1024},
    ],
    levels: [1, 6, 9],
  },
];

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatTime(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Create test file with compressible content
function createTestFile(filePath, size) {
  const buffer = Buffer.alloc(size);
  // Fill with semi-compressible data (repeating patterns)
  const pattern = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < size; i++) {
    buffer[i] = pattern.charCodeAt(i % pattern.length);
  }
  fs.writeFileSync(filePath, buffer);
}

// Run single benchmark
async function runBenchmark(handler, testFile, archivePath, level) {
  const startTime = performance.now();

  // Compress
  await handler.compress([testFile], archivePath, level);
  const compressTime = performance.now() - startTime;

  // Get compressed size
  const originalSize = fs.statSync(testFile).size;
  const compressedSize = fs.statSync(archivePath).size;
  const ratio = (compressedSize / originalSize) * 100;

  // Decompress
  const extractDir = path.join(os.tmpdir(), `extract-${Date.now()}`);
  fs.mkdirSync(extractDir);

  const decompressStart = performance.now();
  await handler.extract(archivePath, extractDir);
  const decompressTime = performance.now() - decompressStart;

  // Cleanup
  fs.rmSync(extractDir, {recursive: true, force: true});
  fs.unlinkSync(archivePath);

  return {
    compressTime,
    decompressTime,
    originalSize,
    compressedSize,
    ratio,
    compressThroughput: originalSize / 1024 / 1024 / (compressTime / 1000),
    decompressThroughput: originalSize / 1024 / 1024 / (decompressTime / 1000),
  };
}

// Main benchmark runner
async function runBenchmarks() {
  console.log('🚀 Starting compression benchmarks...\n');
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`CPU: ${os.cpus()[0].model}`);
  console.log(`Node.js: ${process.version}\n`);

  const results = [];
  const testDir = path.join(os.tmpdir(), 'compression-benchmark-fast');
  fs.mkdirSync(testDir, {recursive: true});

  try {
    for (const config of BENCHMARK_CONFIGS) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Testing format: ${config.format}`);
      console.log(`${'='.repeat(80)}\n`);

      const HandlerClass = config.handler;
      const handler = new HandlerClass();

      for (const fileConfig of config.fileSizes) {
        console.log(`📁 File size: ${fileConfig.name}`);

        const testFile = path.join(
          testDir,
          `test-${config.format}-${fileConfig.name}.bin`
        );
        createTestFile(testFile, fileConfig.size);

        for (const level of config.levels) {
          const archivePath = path.join(
            testDir,
            `archive-${config.format}-${fileConfig.name}-${level}.archive`
          );

          console.log(`  Level ${level}...`);

          try {
            const result = await runBenchmark(
              handler,
              testFile,
              archivePath,
              level
            );

            const benchmarkResult = {
              format: config.format,
              fileSize: fileConfig.name,
              level,
              compressTime: result.compressTime,
              decompressTime: result.decompressTime,
              originalSize: result.originalSize,
              compressedSize: result.compressedSize,
              ratio: result.ratio,
              compressThroughput: result.compressThroughput,
              decompressThroughput: result.decompressThroughput,
            };

            results.push(benchmarkResult);

            console.log(`    ✅ Compress: ${formatTime(result.compressTime)} (${result.compressThroughput.toFixed(2)} MB/s)`);
            console.log(`    ✅ Decompress: ${formatTime(result.decompressTime)} (${result.decompressThroughput.toFixed(2)} MB/s)`);
            console.log(`    ✅ Size: ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)} (${result.ratio.toFixed(1)}%)`);
          } catch (error) {
            console.error(`    ❌ Error: ${error.message}`);
          }
        }

        // Cleanup test file
        fs.unlinkSync(testFile);
      }
    }

    // Generate reports
    console.log(`\n${'='.repeat(80)}`);
    console.log('Generating reports...');
    console.log(`${'='.repeat(80)}\n`);

    generateReports(results);

    console.log('\n✅ Benchmarks complete!');
  } finally {
    // Cleanup
    fs.rmSync(testDir, {recursive: true, force: true});
  }
}

// Generate reports
function generateReports(results) {
  const docsDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(docsDir, {recursive: true});

  // Markdown report
  let markdown = '# Compression Benchmark Results\n\n';
  markdown += `**Test Date**: ${new Date().toISOString()}\n`;
  markdown += `**Platform**: ${os.platform()} ${os.arch()}\n`;
  markdown += `**CPU**: ${os.cpus()[0].model}\n`;
  markdown += `**Node.js**: ${process.version}\n\n`;

  markdown += '## Results by Format\n\n';

  const groupedByFormat = {};
  results.forEach(r => {
    if (!groupedByFormat[r.format]) {
      groupedByFormat[r.format] = [];
    }
    groupedByFormat[r.format].push(r);
  });

  for (const [format, formatResults] of Object.entries(groupedByFormat)) {
    markdown += `\n### ${format.toUpperCase()}\n\n`;
    markdown += '| File Size | Level | Compress | Decompress | Original Size | Compressed Size | Ratio | Compress Throughput | Decompress Throughput |\n';
    markdown += '|-----------|-------|----------|------------|---------------|-----------------|-------|---------------------|-----------------------|\n';

    formatResults.forEach(r => {
      markdown += `| ${r.fileSize} | ${r.level} | ${formatTime(r.compressTime)} | ${formatTime(r.decompressTime)} | ${formatBytes(r.originalSize)} | ${formatBytes(r.compressedSize)} | ${r.ratio.toFixed(1)}% | ${r.compressThroughput.toFixed(2)} MB/s | ${r.decompressThroughput.toFixed(2)} MB/s |\n`;
    });
  }

  markdown += '\n## Key Findings\n\n';
  markdown += '### LZ4 (Pure JavaScript)\n';
  markdown += '- Tested with 1MB files (pure JS implementation is slower for large files)\n';
  markdown += '- Best for small-medium files (<10MB) where speed matters\n';
  markdown += '- Zero dependencies - always available\n\n';

  markdown += '### Other Formats\n';
  markdown += '- Tested with 5MB and 50MB files\n';
  markdown += '- Better for larger files where compression ratio matters\n';
  markdown += '- Native/optimized implementations provide better performance\n\n';

  const markdownPath = path.join(docsDir, 'benchmark-results.md');
  fs.writeFileSync(markdownPath, markdown);
  console.log(`📊 Markdown report: ${markdownPath}`);

  // JSON report
  const jsonReport = {
    metadata: {
      date: new Date().toISOString(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0].model,
      nodeVersion: process.version,
    },
    results,
  };

  const jsonPath = path.join(docsDir, 'benchmark-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`📊 JSON report: ${jsonPath}`);
}

// Run benchmarks
runBenchmarks().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
