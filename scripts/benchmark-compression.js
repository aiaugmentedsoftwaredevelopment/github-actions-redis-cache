#!/usr/bin/env node

/**
 * Comprehensive compression benchmarking script
 * Tests all compression formats including LZ4
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

// Benchmark configuration
const FORMATS = [
  {backend: 'native', format: CompressionFormat.LZ4, handler: Lz4NativeHandler},
  {
    backend: 'native',
    format: CompressionFormat.TAR_GZIP,
    handler: TarGzipNativeHandler,
  },
  {backend: 'native', format: CompressionFormat.ZIP, handler: ZipNativeHandler},
  {
    backend: 'native',
    format: CompressionFormat.GZIP,
    handler: GzipNativeHandler,
  },
];

const COMPRESSION_LEVELS = [1, 6];
const FILE_SIZES = [
  {name: '5MB', size: 5 * 1024 * 1024},
  {name: '50MB', size: 50 * 1024 * 1024},
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

function formatThroughput(bytes, ms) {
  const mbps = bytes / 1024 / 1024 / (ms / 1000);
  return `${mbps.toFixed(2)} MB/s`;
}

// Create test file with compressible content
function createTestFile(filePath, size) {
  console.log(`Creating test file: ${formatBytes(size)}`);

  const buffer = Buffer.alloc(size);
  // Fill with semi-compressible data (repeating patterns)
  const pattern = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < size; i++) {
    buffer[i] = pattern.charCodeAt(i % pattern.length);
  }

  fs.writeFileSync(filePath, buffer);
  console.log(`✅ Test file created: ${filePath}`);
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
  const testDir = path.join(os.tmpdir(), 'compression-benchmark');
  fs.mkdirSync(testDir, {recursive: true});

  try {
    for (const fileConfig of FILE_SIZES) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Testing with ${fileConfig.name} file`);
      console.log(`${'='.repeat(80)}\n`);

      // Create test file
      const testFile = path.join(testDir, `test-${fileConfig.name}.bin`);
      createTestFile(testFile, fileConfig.size);

      for (const formatConfig of FORMATS) {
        const HandlerClass = formatConfig.handler;
        const handler = new HandlerClass();

        console.log(`\n📦 Format: ${formatConfig.format} (${formatConfig.backend})`);

        for (const level of COMPRESSION_LEVELS) {
          const archivePath = path.join(
            testDir,
            `archive-${formatConfig.format}-${level}.archive`
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
              fileSize: fileConfig.name,
              backend: formatConfig.backend,
              format: formatConfig.format,
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

            console.log(`    Compress: ${formatTime(result.compressTime)}`);
            console.log(
              `    Decompress: ${formatTime(result.decompressTime)}`
            );
            console.log(
              `    Size: ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)} (${result.ratio.toFixed(1)}%)`
            );
            console.log(
              `    Throughput: ${result.compressThroughput.toFixed(2)} MB/s compress, ${result.decompressThroughput.toFixed(2)} MB/s decompress`
            );
          } catch (error) {
            console.error(`    ❌ Error: ${error.message}`);
          }
        }
      }

      // Cleanup test file
      fs.unlinkSync(testFile);
    }

    // Generate reports
    console.log(`\n${'='.repeat(80)}`);
    console.log('Generating reports...');
    console.log(`${'='.repeat(80)}\n`);

    generateMarkdownReport(results);
    generateJSONReport(results);

    console.log('\n✅ Benchmarks complete!');
  } finally {
    // Cleanup
    fs.rmSync(testDir, {recursive: true, force: true});
  }
}

// Generate Markdown report
function generateMarkdownReport(results) {
  const reportPath = path.join(__dirname, '..', 'docs', 'benchmark-results.md');

  let markdown = '# Compression Benchmark Results\n\n';
  markdown += `**Test Date**: ${new Date().toISOString()}\n`;
  markdown += `**Platform**: ${os.platform()} ${os.arch()}\n`;
  markdown += `**CPU**: ${os.cpus()[0].model}\n`;
  markdown += `**Node.js**: ${process.version}\n\n`;

  // Group by file size
  const groupedBySize = {};
  results.forEach(r => {
    if (!groupedBySize[r.fileSize]) {
      groupedBySize[r.fileSize] = [];
    }
    groupedBySize[r.fileSize].push(r);
  });

  for (const [fileSize, sizeResults] of Object.entries(groupedBySize)) {
    markdown += `\n## ${fileSize} File\n\n`;
    markdown += '| Format | Level | Compress Time | Decompress Time | Size | Ratio | Compress Throughput | Decompress Throughput |\n';
    markdown += '|--------|-------|---------------|-----------------|------|-------|---------------------|----------------------|\n';

    sizeResults.forEach(r => {
      markdown += `| ${r.format} | ${r.level} | ${formatTime(r.compressTime)} | ${formatTime(r.decompressTime)} | ${formatBytes(r.compressedSize)} | ${r.ratio.toFixed(1)}% | ${r.compressThroughput.toFixed(2)} MB/s | ${r.decompressThroughput.toFixed(2)} MB/s |\n`;
    });
  }

  markdown += '\n## Summary\n\n';
  markdown += '### Fastest Compression (Level 1)\n\n';
  const level1Results = results.filter(r => r.level === 1);
  const fastestCompress = level1Results.reduce((prev, curr) =>
    prev.compressTime < curr.compressTime ? prev : curr
  );
  markdown += `**Winner**: ${fastestCompress.format} - ${formatTime(fastestCompress.compressTime)} (${fastestCompress.compressThroughput.toFixed(2)} MB/s)\n\n`;

  markdown += '### Best Compression Ratio (Level 9)\n\n';
  const level9Results = results.filter(r => r.level === 9);
  const bestRatio = level9Results.reduce((prev, curr) =>
    prev.ratio < curr.ratio ? prev : curr
  );
  markdown += `**Winner**: ${bestRatio.format} - ${bestRatio.ratio.toFixed(1)}% (${formatBytes(bestRatio.compressedSize)})\n\n`;

  markdown += '### Fastest Decompression\n\n';
  const fastestDecompress = results.reduce((prev, curr) =>
    prev.decompressTime < curr.decompressTime ? prev : curr
  );
  markdown += `**Winner**: ${fastestDecompress.format} (Level ${fastestDecompress.level}) - ${formatTime(fastestDecompress.decompressTime)} (${fastestDecompress.decompressThroughput.toFixed(2)} MB/s)\n\n`;

  fs.writeFileSync(reportPath, markdown);
  console.log(`📊 Markdown report: ${reportPath}`);
}

// Generate JSON report
function generateJSONReport(results) {
  const reportPath = path.join(__dirname, '..', 'docs', 'benchmark-results.json');

  const report = {
    metadata: {
      date: new Date().toISOString(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0].model,
      nodeVersion: process.version,
    },
    results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📊 JSON report: ${reportPath}`);
}

// Run benchmarks
runBenchmarks().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
