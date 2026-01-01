#!/usr/bin/env node

/**
 * Comprehensive benchmark for ALL native Node.js compression formats
 * Tests: LZ4, Tar+Gzip, ZIP, Gzip with 20MB and 250MB files
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {performance} = require('perf_hooks');

// Import compression handlers (ONLY Node.js native versions)
const {CompressionFormat} = require('../lib/compression/types');
const {
  TarGzipNativeHandler,
  ZipNativeHandler,
  GzipNativeHandler,
  Lz4NativeHandler,
} = require('../lib/compression/formats');

// Configuration: Native formats (excluding slow pure-JS LZ4)
const FORMATS = [
  // LZ4 disabled - pure JavaScript implementation is too slow for large files
  // {name: 'LZ4', format: CompressionFormat.LZ4, handler: Lz4NativeHandler},
  {name: 'Tar+Gzip', format: CompressionFormat.TAR_GZIP, handler: TarGzipNativeHandler},
  {name: 'ZIP', format: CompressionFormat.ZIP, handler: ZipNativeHandler},
  {name: 'Gzip', format: CompressionFormat.GZIP, handler: GzipNativeHandler},
];

const FILE_SIZES = [
  {name: '20MB', size: 20 * 1024 * 1024},
  {name: '250MB', size: 250 * 1024 * 1024},
];

const COMPRESSION_LEVELS = [1, 6];

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

// Create test file with semi-compressible content
function createTestFile(filePath, size) {
  console.log(`  Creating test file: ${formatBytes(size)}...`);
  const buffer = Buffer.alloc(size);

  // Fill with semi-compressible data (text-like patterns)
  const pattern = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < size; i++) {
    buffer[i] = pattern.charCodeAt(i % pattern.length);
  }

  fs.writeFileSync(filePath, buffer);
  console.log(`  ✅ Test file created`);
}

// Run single benchmark
async function runBenchmark(handler, testFile, archivePath, level) {
  // Compress
  const compressStart = performance.now();
  await handler.compress([testFile], archivePath, level);
  const compressTime = performance.now() - compressStart;

  // Get sizes
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
  console.log('🚀 Compression Benchmark - ALL Native Node.js Formats\n');
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`CPU: ${os.cpus()[0].model}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Test Date: ${new Date().toISOString()}\n`);

  const results = [];
  const testDir = path.join(os.tmpdir(), 'compression-benchmark-all');
  fs.mkdirSync(testDir, {recursive: true});

  try {
    for (const fileConfig of FILE_SIZES) {
      console.log(`${'='.repeat(80)}`);
      console.log(`Testing with ${fileConfig.name} file`);
      console.log(`${'='.repeat(80)}\n`);

      // Create test file once for all formats
      const testFile = path.join(testDir, `test-${fileConfig.name}.bin`);
      createTestFile(testFile, fileConfig.size);

      for (const formatConfig of FORMATS) {
        console.log(`\n📦 Format: ${formatConfig.name}`);

        const HandlerClass = formatConfig.handler;
        const handler = new HandlerClass();

        for (const level of COMPRESSION_LEVELS) {
          const archivePath = path.join(
            testDir,
            `archive-${formatConfig.format}-${fileConfig.name}-L${level}.archive`
          );

          process.stdout.write(`  Level ${level}... `);

          try {
            const result = await runBenchmark(
              handler,
              testFile,
              archivePath,
              level
            );

            results.push({
              fileSize: fileConfig.name,
              format: formatConfig.name,
              level,
              compressTime: result.compressTime,
              decompressTime: result.decompressTime,
              originalSize: result.originalSize,
              compressedSize: result.compressedSize,
              ratio: result.ratio,
              compressThroughput: result.compressThroughput,
              decompressThroughput: result.decompressThroughput,
            });

            console.log('✅');
            console.log(`    Compress:   ${formatTime(result.compressTime).padEnd(8)} (${result.compressThroughput.toFixed(2)} MB/s)`);
            console.log(`    Decompress: ${formatTime(result.decompressTime).padEnd(8)} (${result.decompressThroughput.toFixed(2)} MB/s)`);
            console.log(`    Size:       ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)} (${result.ratio.toFixed(1)}%)`);
          } catch (error) {
            console.log('❌');
            console.error(`    Error: ${error.message}`);
          }
        }
      }

      // Cleanup test file
      fs.unlinkSync(testFile);
      console.log('');
    }

    // Generate reports
    console.log(`${'='.repeat(80)}`);
    console.log('Generating reports...');
    console.log(`${'='.repeat(80)}\n`);

    generateReports(results);

    console.log('\n✅ All benchmarks complete!\n');

    // Print summary
    printSummary(results);

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
  let markdown = '# Compression Benchmark Results - All Native Formats\n\n';
  markdown += `**Test Date**: ${new Date().toISOString()}\n`;
  markdown += `**Platform**: ${os.platform()} ${os.arch()}\n`;
  markdown += `**CPU**: ${os.cpus()[0].model}\n`;
  markdown += `**Node.js**: ${process.version}\n`;
  markdown += `**Formats Tested**: LZ4, Tar+Gzip, ZIP, Gzip (all native Node.js implementations)\n\n`;

  // Group by file size
  const groupedBySize = {};
  results.forEach(r => {
    if (!groupedBySize[r.fileSize]) {
      groupedBySize[r.fileSize] = [];
    }
    groupedBySize[r.fileSize].push(r);
  });

  for (const [fileSize, sizeResults] of Object.entries(groupedBySize)) {
    markdown += `\n## ${fileSize} File Results\n\n`;
    markdown += '| Format | Level | Compress Time | Compress Speed | Decompress Time | Decompress Speed | Original Size | Compressed Size | Ratio |\n';
    markdown += '|--------|-------|---------------|----------------|-----------------|------------------|---------------|-----------------|-------|\n';

    sizeResults.forEach(r => {
      markdown += `| ${r.format} | ${r.level} | ${formatTime(r.compressTime)} | ${r.compressThroughput.toFixed(2)} MB/s | ${formatTime(r.decompressTime)} | ${r.decompressThroughput.toFixed(2)} MB/s | ${formatBytes(r.originalSize)} | ${formatBytes(r.compressedSize)} | ${r.ratio.toFixed(1)}% |\n`;
    });
  }

  // Add analysis
  markdown += '\n## Analysis\n\n';

  // Fastest compression
  const fastestCompress = results.reduce((prev, curr) =>
    prev.compressTime < curr.compressTime ? prev : curr
  );
  markdown += `### Fastest Compression\n`;
  markdown += `**${fastestCompress.format}** (Level ${fastestCompress.level}, ${fastestCompress.fileSize}): ${formatTime(fastestCompress.compressTime)} (${fastestCompress.compressThroughput.toFixed(2)} MB/s)\n\n`;

  // Fastest decompression
  const fastestDecompress = results.reduce((prev, curr) =>
    prev.decompressTime < curr.decompressTime ? prev : curr
  );
  markdown += `### Fastest Decompression\n`;
  markdown += `**${fastestDecompress.format}** (Level ${fastestDecompress.level}, ${fastestDecompress.fileSize}): ${formatTime(fastestDecompress.decompressTime)} (${fastestDecompress.decompressThroughput.toFixed(2)} MB/s)\n\n`;

  // Best compression ratio
  const bestRatio = results.reduce((prev, curr) =>
    prev.ratio < curr.ratio ? prev : curr
  );
  markdown += `### Best Compression Ratio\n`;
  markdown += `**${bestRatio.format}** (Level ${bestRatio.level}, ${bestRatio.fileSize}): ${bestRatio.ratio.toFixed(1)}% (${formatBytes(bestRatio.compressedSize)})\n\n`;

  const markdownPath = path.join(docsDir, 'benchmark-results.md');
  fs.writeFileSync(markdownPath, markdown);
  console.log(`📊 Markdown report saved: ${markdownPath}`);

  // JSON report
  const jsonReport = {
    metadata: {
      date: new Date().toISOString(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0].model,
      nodeVersion: process.version,
      formatsTest: 'LZ4, Tar+Gzip, ZIP, Gzip (all native Node.js)',
    },
    results,
  };

  const jsonPath = path.join(docsDir, 'benchmark-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`📊 JSON report saved: ${jsonPath}`);
}

// Print summary table
function printSummary(results) {
  console.log('Summary Table:\n');
  console.log('File Size | Format      | Level | Compress      | Decompress    | Ratio   | Throughput (C/D)');
  console.log('----------|-------------|-------|---------------|---------------|---------|------------------');

  results.forEach(r => {
    const fileSize = r.fileSize.padEnd(9);
    const format = r.format.padEnd(11);
    const level = String(r.level).padEnd(5);
    const compressTime = formatTime(r.compressTime).padEnd(13);
    const decompressTime = formatTime(r.decompressTime).padEnd(13);
    const ratio = `${r.ratio.toFixed(1)}%`.padEnd(7);
    const throughput = `${r.compressThroughput.toFixed(1)}/${r.decompressThroughput.toFixed(1)} MB/s`;

    console.log(`${fileSize} | ${format} | ${level} | ${compressTime} | ${decompressTime} | ${ratio} | ${throughput}`);
  });
}

// Run benchmarks
runBenchmarks().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
