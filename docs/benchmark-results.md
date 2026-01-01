# Compression Benchmark Results - All Native Formats

**Test Date**: 2026-01-01T21:36:07.953Z
**Platform**: darwin arm64
**CPU**: Apple M1 Pro
**Node.js**: v20.12.2
**Formats Tested**: LZ4, Tar+Gzip, ZIP, Gzip (all native Node.js implementations)


## 20MB File Results

| Format | Level | Compress Time | Compress Speed | Decompress Time | Decompress Speed | Original Size | Compressed Size | Ratio |
|--------|-------|---------------|----------------|-----------------|------------------|---------------|-----------------|-------|
| Tar+Gzip | 1 | 21ms | 954.06 MB/s | 45ms | 447.54 MB/s | 20 MB | 129.18 KB | 0.6% |
| Tar+Gzip | 6 | 46ms | 431.29 MB/s | 40ms | 502.11 MB/s | 20 MB | 59.77 KB | 0.3% |
| ZIP | 1 | 43ms | 462.59 MB/s | 42ms | 475.78 MB/s | 20 MB | 129.2 KB | 0.6% |
| ZIP | 6 | 69ms | 290.94 MB/s | 42ms | 480.02 MB/s | 20 MB | 59.8 KB | 0.3% |
| Gzip | 1 | 15ms | 1378.32 MB/s | 36ms | 562.57 MB/s | 20 MB | 129.18 KB | 0.6% |
| Gzip | 6 | 45ms | 445.50 MB/s | 32ms | 634.17 MB/s | 20 MB | 59.77 KB | 0.3% |

## 250MB File Results

| Format | Level | Compress Time | Compress Speed | Decompress Time | Decompress Speed | Original Size | Compressed Size | Ratio |
|--------|-------|---------------|----------------|-----------------|------------------|---------------|-----------------|-------|
| Tar+Gzip | 1 | 197ms | 1265.89 MB/s | 375ms | 666.59 MB/s | 250 MB | 1.57 MB | 0.6% |
| Tar+Gzip | 6 | 573ms | 436.13 MB/s | 407ms | 613.99 MB/s | 250 MB | 745.19 KB | 0.3% |
| ZIP | 1 | 399ms | 627.28 MB/s | 404ms | 618.63 MB/s | 250 MB | 1.57 MB | 0.6% |
| ZIP | 6 | 774ms | 323.15 MB/s | 406ms | 615.46 MB/s | 250 MB | 745.22 KB | 0.3% |
| Gzip | 1 | 186ms | 1344.52 MB/s | 417ms | 598.86 MB/s | 250 MB | 1.57 MB | 0.6% |
| Gzip | 6 | 564ms | 443.36 MB/s | 432ms | 579.01 MB/s | 250 MB | 745.19 KB | 0.3% |

## Analysis

### Fastest Compression
**Gzip** (Level 1, 20MB): 15ms (1378.32 MB/s)

### Fastest Decompression
**Gzip** (Level 6, 20MB): 32ms (634.17 MB/s)

### Best Compression Ratio
**Gzip** (Level 6, 250MB): 0.3% (745.19 KB)

