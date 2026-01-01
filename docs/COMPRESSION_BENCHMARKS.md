# Compression Performance Benchmarks

Benchmark results comparing native Node.js compression vs shell command compression across different formats, levels, and file sizes.

## Test Environment

- **Platform**: darwin arm64
- **Node.js**: v20.12.2
- **CPU**: Apple M1 Pro
- **CPU Cores**: 10
- **Total Memory**: 16.00 GB
- **Date**: 2026-01-01T21:04:57.713Z

## Summary

### Compression Performance by Backend

| Backend | Format | Avg Compression Time | Avg Decompression Time | Avg Ratio | Avg Throughput |
|---------|--------|---------------------|------------------------|-----------|----------------|
| native | tar+gzip | 733.46 ms | 198.14 ms | 89.90% | 254.11 MB/s |
| native | zip | 819.79 ms | 204.27 ms | 89.90% | 174.60 MB/s |
| native | gzip | 725.61 ms | 203.74 ms | 89.90% | 262.12 MB/s |
| shell | zip | 599.24 ms | 353.78 ms | 92.24% | 166.40 MB/s |

## 5MB File

### Compression Results

| Backend | Format | Level | Time | Size | Ratio | Throughput | CPU | Memory |
|---------|--------|-------|------|------|-------|------------|-----|--------|
| native | tar+gzip | 1 | 36.71 ms | 1.48 MB | 70.48% | 136.21 MB/s | 0 ms | NaN undefined |
| native | tar+gzip | 3 | 8.09 ms | 313.80 KB | 93.87% | 618.13 MB/s | 0 ms | 103.66 KB |
| native | tar+gzip | 6 | 41.68 ms | 190.16 KB | 96.29% | 119.96 MB/s | 0 ms | 58.57 KB |
| native | tar+gzip | 9 | 66.23 ms | 179.41 KB | 96.50% | 75.49 MB/s | 0 ms | NaN undefined |
| native | zip | 1 | 47.16 ms | 1.48 MB | 70.48% | 106.02 MB/s | 0 ms | 1.19 MB |
| native | zip | 3 | 14.27 ms | 313.70 KB | 93.87% | 350.45 MB/s | 0 ms | 432.80 KB |
| native | zip | 6 | 54.66 ms | 190.16 KB | 96.29% | 91.47 MB/s | 0 ms | NaN undefined |
| native | zip | 9 | 73.67 ms | 179.30 KB | 96.50% | 67.87 MB/s | 0 ms | 373.53 KB |
| native | gzip | 1 | 41.42 ms | 1.48 MB | 70.48% | 120.71 MB/s | 0 ms | 220.76 KB |
| native | gzip | 3 | 7.23 ms | 313.80 KB | 93.87% | 691.78 MB/s | 0 ms | 70.65 KB |
| native | gzip | 6 | 43.40 ms | 190.16 KB | 96.29% | 115.21 MB/s | 0 ms | 61.77 KB |
| native | gzip | 9 | 67.87 ms | 179.41 KB | 96.50% | 73.67 MB/s | 0 ms | NaN undefined |
| shell | zip | 1 | 30.80 ms | 923.73 KB | 81.96% | 162.36 MB/s | 0 ms | 178.19 KB |
| shell | zip | 3 | 27.49 ms | 314.70 KB | 93.85% | 181.91 MB/s | 0 ms | 187.41 KB |
| shell | zip | 6 | 33.99 ms | 180.32 KB | 96.48% | 147.10 MB/s | 0 ms | 197.94 KB |
| shell | zip | 9 | 42.80 ms | 180.32 KB | 96.48% | 116.83 MB/s | 0 ms | 195.64 KB |

### Decompression Results

| Backend | Format | Level | Time | CPU | Memory |
|---------|--------|-------|------|-----|--------|
| native | tar+gzip | 1 | 19.80 ms | 0 ms | 1.60 MB |
| native | tar+gzip | 3 | 8.63 ms | 0 ms | 838.45 KB |
| native | tar+gzip | 6 | 10.65 ms | 0 ms | 751.13 KB |
| native | tar+gzip | 9 | 12.39 ms | 0 ms | 795.58 KB |
| native | zip | 1 | 19.67 ms | 0 ms | 900.84 KB |
| native | zip | 3 | 9.02 ms | 0 ms | 968.56 KB |
| native | zip | 6 | 10.29 ms | 0 ms | 1.20 MB |
| native | zip | 9 | 8.98 ms | 0 ms | 973.55 KB |
| native | gzip | 1 | 13.51 ms | 0 ms | NaN undefined |
| native | gzip | 3 | 6.98 ms | 0 ms | 663.67 KB |
| native | gzip | 6 | 9.09 ms | 0 ms | 750.87 KB |
| native | gzip | 9 | 9.80 ms | 0 ms | 715.19 KB |
| shell | zip | 1 | 23.15 ms | 0 ms | 182.21 KB |
| shell | zip | 3 | 22.65 ms | 0 ms | 396.75 KB |
| shell | zip | 6 | 18.66 ms | 0 ms | 190.49 KB |
| shell | zip | 9 | 18.88 ms | 0 ms | 189.35 KB |

## 200MB File

### Compression Results

| Backend | Format | Level | Time | Size | Ratio | Throughput | CPU | Memory |
|---------|--------|-------|------|------|-------|------------|-----|--------|
| native | tar+gzip | 1 | 993.30 ms | 49.59 MB | 75.21% | 201.35 MB/s | 1 ms | NaN undefined |
| native | tar+gzip | 3 | 288.92 ms | 12.12 MB | 93.94% | 692.24 MB/s | 0 ms | NaN undefined |
| native | tar+gzip | 6 | 1.73 s | 7.29 MB | 96.35% | 115.49 MB/s | 2 ms | NaN undefined |
| native | tar+gzip | 9 | 2.70 s | 6.84 MB | 96.58% | 74.04 MB/s | 3 ms | 311.58 KB |
| native | zip | 1 | 1.13 s | 49.59 MB | 75.21% | 176.43 MB/s | 1 ms | NaN undefined |
| native | zip | 3 | 465.04 ms | 12.12 MB | 93.94% | 430.07 MB/s | 1 ms | 787.55 KB |
| native | zip | 6 | 1.91 s | 7.29 MB | 96.35% | 104.44 MB/s | 2 ms | NaN undefined |
| native | zip | 9 | 2.85 s | 6.84 MB | 96.58% | 70.05 MB/s | 3 ms | NaN undefined |
| native | gzip | 1 | 949.42 ms | 49.59 MB | 75.21% | 210.65 MB/s | 1 ms | NaN undefined |
| native | gzip | 3 | 288.03 ms | 12.12 MB | 93.94% | 694.37 MB/s | 0 ms | NaN undefined |
| native | gzip | 6 | 1.72 s | 7.29 MB | 96.35% | 116.11 MB/s | 2 ms | NaN undefined |
| native | gzip | 9 | 2.68 s | 6.84 MB | 96.58% | 74.49 MB/s | 3 ms | 753.13 KB |
| shell | zip | 1 | 1.11 s | 35.95 MB | 82.02% | 180.19 MB/s | 0 ms | 179.22 KB |
| shell | zip | 3 | 802.53 ms | 12.12 MB | 93.94% | 249.21 MB/s | 0 ms | 177.68 KB |
| shell | zip | 6 | 1.25 s | 6.84 MB | 96.58% | 159.85 MB/s | 0 ms | 177.66 KB |
| shell | zip | 9 | 1.50 s | 6.84 MB | 96.58% | 133.77 MB/s | 0 ms | 176.37 KB |

### Decompression Results

| Backend | Format | Level | Time | CPU | Memory |
|---------|--------|-------|------|-----|--------|
| native | tar+gzip | 1 | 520.76 ms | 1 ms | 452.15 KB |
| native | tar+gzip | 3 | 339.35 ms | 1 ms | 674.71 KB |
| native | tar+gzip | 6 | 325.67 ms | 1 ms | NaN undefined |
| native | tar+gzip | 9 | 347.91 ms | 1 ms | 1.38 MB |
| native | zip | 1 | 549.37 ms | 1 ms | NaN undefined |
| native | zip | 3 | 347.82 ms | 1 ms | 2.07 MB |
| native | zip | 6 | 341.54 ms | 1 ms | 3.21 MB |
| native | zip | 9 | 347.48 ms | 1 ms | 2.97 MB |
| native | gzip | 1 | 523.53 ms | 1 ms | 928.77 KB |
| native | gzip | 3 | 355.90 ms | 1 ms | 1.03 MB |
| native | gzip | 6 | 342.87 ms | 1 ms | NaN undefined |
| native | gzip | 9 | 368.25 ms | 1 ms | NaN undefined |
| shell | zip | 1 | 824.94 ms | 0 ms | 175.83 KB |
| shell | zip | 3 | 664.20 ms | 0 ms | 175.85 KB |
| shell | zip | 6 | 627.47 ms | 0 ms | 299.15 KB |
| shell | zip | 9 | 630.29 ms | 0 ms | 176.52 KB |

## Recommendations

Based on the benchmark results:

1. **Native vs Shell**: Compare average compression times to determine which backend is faster for your use case
2. **Format Selection**: Choose format based on your priority:
   - Best compression ratio: Check highest ratio percentages
   - Fastest compression: Check lowest compression times
   - Fastest decompression: Check lowest decompression times
3. **Compression Level**: Higher levels (6-9) offer better compression but take longer
4. **Throughput**: MB/s metric shows raw compression speed

## Notes

- All tests use semi-random test data (alternating patterns)
- CPU time is process CPU usage, not wall-clock time
- Memory usage is heap memory delta during operation
- Results may vary based on hardware, OS, and data characteristics
