# Redis Cache Action ⚡

A GitHub Action for ultra-fast dependency caching using Redis/Valkey. Built for high-performance CI/CD pipelines.

**Quick Links:** [Quick Start](#quick-start) • [Debugging & Logging](#debugging--logging) • [Troubleshooting](#troubleshooting) • [Deployment Guide](#deployment-guide)

## Features

- **🚀 Blazing Fast**: In-memory caching with Redis/Valkey (10-100x faster than disk-based solutions)
- **💾 Efficient**: LRU eviction policy automatically manages cache size
- **🔄 Drop-in Replacement**: Compatible with `actions/cache` API
- **🎯 Smart Restore**: Supports exact and prefix-matched cache keys
- **📦 Optimized Compression**: Configurable compression levels for optimal performance
- **🔧 Zero Infrastructure**: Uses existing Redis/Valkey deployments
- **🔍 Comprehensive Logging**: Verbose debug logging with timing metrics for easy troubleshooting
- **🛡️ Smart Error Handling**: Detailed error messages with actionable troubleshooting guidance

## Use Cases

Perfect for:
- **Flutter/Dart** builds with pub dependency caching
- **Node.js** projects with npm/yarn/pnpm caching
- **Python** projects with pip caching
- **Any workflow** with large dependency trees

## Quick Start

### Prerequisites

You need a Redis or Valkey instance accessible from your GitHub Actions runners. See [Deployment Guide](#deployment-guide) below.

### Basic Usage

```yaml
- name: Cache Dependencies
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    path: |
      ~/.pub-cache/hosted
      ~/.pub-cache/git
      packages/*/.dart_tool
    key: ${{ runner.os }}-pub-${{ hashFiles('**/pubspec.lock') }}
    restore-keys: |
      ${{ runner.os }}-pub-
```

> [!TIP]
> **🔍 Need to troubleshoot?** Enable verbose debug logging to see detailed timing metrics, Redis connection status, and helpful error messages:
> ```yaml
> - name: Cache Dependencies
>   uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
>   env:
>     ACTIONS_STEP_DEBUG: true  # Enable debug logging
>   with:
>     # ... your cache configuration
> ```
> See [Debugging & Logging](#debugging--logging) for full details on what gets logged and troubleshooting guidance.

### Complete Example (Flutter)

```yaml
name: Build Flutter App

on: [push, pull_request]

jobs:
  build:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Cache Flutter Dependencies
        id: cache
        uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
        with:
          path: |
            ~/.pub-cache/hosted/
            ~/.pub-cache/git/
            packages/*/.dart_tool/
            packages/*/*/.dart_tool/
          key: ${{ runner.os }}-flutter-${{ hashFiles('**/pubspec.lock') }}
          restore-keys: |
            ${{ runner.os }}-flutter-
          redis-host: valkey-cache.github-actions-cache.svc.cluster.local
          redis-port: 6379
          ttl: 604800  # 7 days

      - name: Install dependencies
        if: steps.cache.outputs.cache-hit != 'true'
        run: flutter pub get

      - name: Build app
        run: flutter build apk
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `path` | Paths to cache (supports glob patterns, one per line) | Yes | - |
| `key` | Explicit cache key | Yes | - |
| `restore-keys` | Ordered list of prefix-matched fallback keys | No | - |
| `redis-host` | Redis/Valkey hostname | No | `valkey-cache.github-actions-cache.svc.cluster.local` |
| `redis-port` | Redis/Valkey port | No | `6379` |
| `redis-password` | Redis/Valkey password (if auth enabled) | No | - |
| `ttl` | Cache TTL in seconds | No | `604800` (7 days) |
| `compression` | Compression level (0-9) | No | `6` |

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit` | Boolean indicating exact cache match |
| `cache-matched-key` | The actual key used to restore cache |

## Debugging & Logging

The action provides comprehensive verbose logging to help diagnose issues and understand cache operations.

### Enabling Debug Logging

Enable debug logging by setting the `ACTIONS_STEP_DEBUG` secret in your repository:

```yaml
# In your workflow file
- name: Cache Dependencies
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  env:
    ACTIONS_STEP_DEBUG: true
  with:
    path: ~/.pub-cache
    key: ${{ runner.os }}-pub-${{ hashFiles('**/pubspec.lock') }}
```

Or enable it globally via repository settings: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `ACTIONS_STEP_DEBUG`
- Value: `true`

### What Gets Logged

**Startup Information:**
- Platform and Node.js version
- Redis configuration (host, port, authentication status)
- Compression level and TTL settings

**Cache Restore Phase:**
- Redis connection status and retry attempts
- Cache key lookup (exact match and pattern matching)
- SCAN iterations for restore key patterns
- Tarball extraction timing (write, extract, total)
- Cache hit/miss status with statistics

**Cache Save Phase:**
- Glob pattern resolution timing and results
- Path validation statistics
- Tarball creation timing (compression, file read)
- Redis upload timing and speed
- Cache verification status

**Example Debug Output:**
```
🚀 Redis Cache Action - Restore Phase
  Running on: linux x64
  Node version: v20.12.2
  Configuration:
    Redis Host: valkey-cache.github-actions-cache.svc.cluster.local
    Redis Port: 6379
    Redis Auth: Disabled
    TTL: 604800s (7 days)
    Compression: Level 6
🔌 Connecting to Redis...
  Target: valkey-cache.github-actions-cache.svc.cluster.local:6379
  Status: Connected and ready
🔍 Looking for cache with key: linux-pub-abc123
  Full Redis key: owner/repo:linux-pub-abc123
  ✅ Exact cache hit!
💾 Extracting cache (125.4 MB)...
  Write time: 45ms
  Extract time: 1250ms
  Total restore time: 1295ms
✅ Cache restored successfully!
```

### Error Messages with Troubleshooting

The action provides specific troubleshooting guidance for common errors:

**Redis Connection Errors:**
- `ECONNREFUSED`: Connection refused with networking troubleshooting steps
- `ENOTFOUND`: DNS resolution failure with hostname verification steps
- `NOAUTH`: Authentication failure with credential checking steps
- `ETIMEDOUT`: Connection timeout with server health checks

**Tar Command Errors:**
- `command not found`: Missing tar utility with installation instructions
- `Permission denied`: File permission issues with diagnostic commands
- `No space left`: Disk space issues with cleanup suggestions

**Redis Operation Errors:**
- `Out of memory`: Redis memory exhausted with eviction policy guidance
- `Cache verification failed`: Upload issues with debugging steps

**Example Error Output:**
```
⚠️ Failed to save cache: tar command not found - please install tar utility

Troubleshooting:
  - tar command is not available on this system
  - Install tar: apt-get install tar (Ubuntu) or yum install tar (RHEL)
  - Verify tar is in PATH: which tar

ℹ️ Job will continue despite cache save failure
For more help, see: https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache#troubleshooting
```

### Performance Metrics

All major operations include timing metrics in debug logs:
- **Glob pattern resolution**: Time to resolve file patterns
- **Path validation**: Time to verify file existence
- **Tarball creation**: Compression and file read timing
- **Tarball extraction**: Decompression timing
- **Redis operations**: Upload/download speed and latency
- **Cache verification**: Key existence checking time

These metrics help identify performance bottlenecks in your cache operations.

## Cache Key Design

### Best Practices

**Good cache keys:**
```yaml
# Include OS and hash of lock file
key: ${{ runner.os }}-pub-${{ hashFiles('**/pubspec.lock') }}

# Include version in key
key: node-v18-${{ hashFiles('**/package-lock.json') }}

# Multiple hash inputs
key: ${{ runner.os }}-${{ hashFiles('**/Podfile.lock') }}-${{ hashFiles('**/*.swift') }}
```

**Restore keys:**
```yaml
restore-keys: |
  ${{ runner.os }}-pub-
  ${{ runner.os }}-
```

### Cache Key Scoping

Caches are automatically scoped by repository to prevent collisions:
- Input key: `linux-pub-abc123`
- Actual Redis key: `owner/repo:linux-pub-abc123`

## Deployment Guide

### Option 1: Deploy with Pulumi (Recommended)

Use our Pulumi infrastructure-as-code for automated deployment:

```bash
cd pulumi
npm install
pulumi stack init dev
pulumi up
```

See the [Pulumi README](pulumi/README.md) for detailed instructions, including:
- Automatic GitHub Actions deployment
- Configuration options
- Stack outputs for easy integration
- Infrastructure updates and rollbacks

### Option 2: Deploy Valkey Manually with kubectl

```bash
# Create namespace
kubectl create namespace github-actions-cache

# Deploy Valkey
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: valkey-cache
  namespace: github-actions-cache
spec:
  replicas: 1
  selector:
    matchLabels:
      app: valkey
  template:
    metadata:
      labels:
        app: valkey
    spec:
      containers:
      - name: valkey
        image: valkey/valkey:latest
        args:
        - --maxmemory
        - "4gb"
        - --maxmemory-policy
        - "allkeys-lru"
        - --save
        - ""
        - --appendonly
        - "no"
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        ports:
        - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: valkey-cache
  namespace: github-actions-cache
spec:
  selector:
    app: valkey
  ports:
  - port: 6379
    targetPort: 6379
EOF
```

### Option 3: Use Existing Redis

Point to your existing Redis instance:

```yaml
- uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    redis-host: my-redis.example.com
    redis-port: 6379
    redis-password: ${{ secrets.REDIS_PASSWORD }}
    # ... other inputs
```

## Performance

### Comparison with Disk-Based Caching

| Solution | Restore Time (5GB) | Save Time (5GB) | Memory Overhead |
|----------|-------------------|-----------------|-----------------|
| **Redis Cache** | **~5s** | **~8s** | 200MB-4GB |
| Ceph S3 | ~60s | ~90s | 11-12GB |
| Local Disk | ~15s | ~20s | 0GB |
| Remote S3 | ~120s | ~150s | 0GB |

*Benchmarks on typical Flutter monorepo with 100+ packages*

### Compression Format Performance

The action automatically detects and selects the best available compression format. Here's how they compare based on **real-world benchmarks** on a 164MB node_modules directory:

| Format | Compression Time | Decompression Time | Compressed Size | Compression Ratio | Availability |
|--------|-----------------|-------------------|-----------------|-------------------|--------------|
| **tar+gzip** (default) | **9.6s** | **6.7s** | **28MB** | **82.9%** | Linux/macOS |
| **zip** (fallback) | **3.4s** (2.9x faster) | **3.4s** (2x faster) | **34MB** (+21%) | **79.3%** | Cross-platform |
| **gzip** (minimal) | ~10-12s | ~7-8s | ~28-30MB | ~80-82% | Minimal systems |

*Benchmarks on macOS (Apple Silicon) with 164MB node_modules directory. See [Issue #18](https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache/issues/18) for detailed performance analysis.*

**Key Findings:**
- ✅ **zip is 2.9x faster** for compression and 2x faster for decompression
- ✅ **tar+gzip achieves best compression** ratio (82.9% vs 79.3%)
- ✅ **Compression levels have minimal impact** on node_modules (already compressed files)
- ⚠️ **Trade-off:** zip is 21% larger but 2.4x faster overall (round-trip: 6.8s vs 16.3s)

#### Format Selection

The action uses automatic format detection with the following priority:

1. **tar+gzip (Priority 100)** - Default choice for Linux/macOS
   - ✅ Best compression ratio
   - ✅ Fastest decompression
   - ✅ Preserves file metadata and permissions
   - ✅ Native support on all GitHub-hosted runners

2. **zip (Priority 50)** - Fallback for compatibility
   - ✅ Cross-platform (Windows, Linux, macOS)
   - ✅ Good compression with reasonable speed
   - ✅ Single-command operation
   - ⚠️ Slightly larger file sizes than tar+gzip

3. **gzip (Priority 25)** - Last resort fallback
   - ✅ Widely available on minimal systems
   - ⚠️ Two-step process (slower overall)
   - ⚠️ Only used when tar and zip unavailable

**Detection is cached** for the duration of the workflow to avoid redundant checks.

#### Compression Level Tuning

The `compression` input (0-9) controls the compression level. **Note:** Benchmarks show minimal impact on node_modules (already compressed):

| Level | Compression Time | Compressed Size | Use Case |
|-------|-----------------|-----------------|----------|
| **1** (fast) | 9.87s | 28MB | Quick iteration |
| **6** (default) | 9.61s | 28MB | ✅ **Recommended - best balance** |
| **9** (best) | 10.53s | 28MB | Maximum compression |

**Key Insight:** For node_modules and similar pre-compressed files, compression level has **minimal impact** on both time and size. **Stick with level 6 (default)** for optimal results.

**Example - Fast compression for quick iteration:**
```yaml
- uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    compression: 1  # Fast compression
    ttl: 3600       # Short TTL for development
```

**Example - Maximum compression for production:**
```yaml
- uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    compression: 9  # Best compression
    ttl: 2592000    # 30 days
```

#### Real-World Performance Impact

For a typical Node.js project with 164MB `node_modules` (real benchmark data):

**Cache Save (tar+gzip level 6):**
```
📂 Resolving paths: ~500ms
🗜️  Creating archive: 9.6s
💾 Uploading to Redis: ~2s
────────────────────────────────────
Total: ~12.1s
```

**Cache Restore (tar+gzip):**
```
🔍 Redis key lookup: ~100ms
💾 Downloading from Redis: ~1s
📦 Extracting archive: 6.7s
────────────────────────────────────
Total: ~7.8s
Round-trip: ~19.9s
```

**With zip format (faster alternative):**
```
Save:    3.4s (compression) + 2s (upload) = 5.4s
Restore: 1s (download) + 3.4s (extraction) = 4.4s
Round-trip: ~9.8s (2x faster than tar+gzip)
Trade-off: +6MB file size (34MB vs 28MB)
```

**Recommendation:**
- Use **tar+gzip** (default) for best compression and compatibility
- Use **zip** for speed-critical workflows (2x faster round-trip time)
- Compression level has minimal impact on node_modules (use default level 6)

### Memory Management

Valkey/Redis automatically manages memory using LRU (Least Recently Used) eviction:
- Configure `maxmemory` to limit cache size
- Old/unused caches are automatically removed
- No manual cleanup required

## Migration from actions/cache

### Before (actions/cache)

```yaml
- name: Cache dependencies
  uses: actions/cache@v4
  with:
    path: ~/.pub-cache
    key: ${{ runner.os }}-pub-${{ hashFiles('**/pubspec.lock') }}
```

### After (redis-cache)

```yaml
- name: Cache dependencies
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    path: ~/.pub-cache
    key: ${{ runner.os }}-pub-${{ hashFiles('**/pubspec.lock') }}
    # Optional: customize Redis connection
    redis-host: valkey-cache.github-actions-cache.svc.cluster.local
```

**Changes:**
1. Replace action: `actions/cache@v4` → `aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1`
2. Add `redis-host` input (or use default)
3. Keep all other inputs identical

## Troubleshooting

### Quick Diagnostics

**Enable debug logging first!** See the [Debugging & Logging](#debugging--logging) section for detailed instructions.

The action automatically provides troubleshooting guidance in error messages. Check your workflow logs for:
- Specific error type (e.g., `ECONNREFUSED`, `command not found`)
- Actionable troubleshooting steps
- Links to this documentation

### Cache Not Restoring

**The action will log specific reasons for cache misses:**
- No exact key match found
- Restore key patterns didn't match any cached keys
- Cache was evicted due to TTL expiration or memory pressure

**Manual verification:**
```bash
# From runner - check Redis connectivity
redis-cli -h valkey-cache.github-actions-cache.svc.cluster.local ping
# Expected: PONG

# List all cache keys for your repo
redis-cli --scan --pattern "owner/repo:*"
```

**Common causes:**
1. **Different cache key**: Verify `hashFiles()` produces consistent values
2. **Cache evicted**: Check Redis memory usage and TTL settings
3. **Network issues**: Enable debug logs to see connection details
4. **Wrong Redis host**: Verify `redis-host` matches your deployment

### Connection Errors

The action provides specific guidance for connection issues:

**ECONNREFUSED (Connection refused):**
- Redis server not running
- Wrong host or port
- Firewall blocking connection
- Check debug logs for connection target

**ENOTFOUND (DNS resolution failed):**
- Hostname doesn't exist
- DNS configuration issue
- Try using IP address instead

**ETIMEDOUT (Connection timeout):**
- Redis server overloaded
- Network latency too high
- Check Redis server health

### Tar Command Issues

If you see "tar command not found" errors:

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install tar

# RHEL/CentOS
sudo yum install tar

# Alpine Linux
apk add tar

# macOS (usually pre-installed)
brew install gnu-tar
```

**Note:** Most GitHub-hosted runners include tar by default. This typically only affects custom Docker containers.

### Large Cache Sizes

If your cache is > 1GB, consider:
1. **Reduce cached paths**: Only cache essential dependencies
2. **Increase compression**: Use `compression: 9` for maximum compression (slower but smaller)
3. **Shorter TTL**: Reduce `ttl` to clean up old caches faster
4. **Check debug logs**: Review what files are being cached

The action warns when cache size exceeds 1GB with suggestions for optimization.

### Redis Out of Memory

The action will report "Out of memory" errors with guidance when Redis maxmemory is reached.

**Quick fix - increase memory limit:**
```bash
# Update Valkey deployment
kubectl set env deployment/valkey-cache -n github-actions-cache \
  VALKEY_MAXMEMORY=8gb

# Or edit the deployment directly
kubectl edit deployment valkey-cache -n github-actions-cache
```

**Verify eviction policy:**
```bash
kubectl exec -n github-actions-cache deployment/valkey-cache -- \
  valkey-cli CONFIG GET maxmemory-policy
# Should return: allkeys-lru
```

### Permission Errors

If you see "Permission denied" errors:

**During cache save:**
- Check write permissions for `RUNNER_TEMP` directory
- Verify source files are readable

**During cache restore:**
- Check write permissions for target directories
- Verify runner has appropriate permissions

Debug logs will show the specific directory causing issues.

## Advanced Usage

### Conditional Caching

```yaml
- name: Cache dependencies
  if: github.event_name != 'schedule'  # Skip on scheduled builds
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    path: ~/.pub-cache
    key: ${{ runner.os }}-pub-${{ hashFiles('**/pubspec.lock') }}
```

### Multiple Caches

```yaml
- name: Cache Dart packages
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    path: ~/.pub-cache
    key: dart-${{ hashFiles('**/pubspec.lock') }}

- name: Cache build artifacts
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    path: |
      packages/*/.dart_tool
      build/
    key: build-${{ hashFiles('**/*.dart') }}
```

### Matrix Builds

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]
    flutter: ['3.16.0', '3.19.0']

steps:
  - name: Cache dependencies
    uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
    with:
      path: ~/.pub-cache
      key: ${{ matrix.os }}-${{ matrix.flutter }}-pub-${{ hashFiles('**/pubspec.lock') }}
```

## Architecture

```
GitHub Actions Runner
    ↓
Redis Cache Action
    ↓ (TCP 6379)
Valkey/Redis Server
    ↓ (In-Memory)
LRU Cache (max 4GB)
```

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache/issues)
- **Discussions**: [GitHub Discussions](https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache/discussions)

## Acknowledgments

Built with ❤️ by [AI Augmented Software Development](https://github.com/aiaugmentedsoftwaredevelopment)

Powered by:
- [ioredis](https://github.com/luin/ioredis) - Redis client
- [Valkey](https://valkey.io/) - Open source Redis fork
- [GitHub Actions](https://github.com/features/actions)
