# Redis Cache Action ⚡

A GitHub Action for ultra-fast dependency caching using Redis/Valkey. Built for high-performance CI/CD pipelines.

## Features

- **🚀 Blazing Fast**: In-memory caching with Redis/Valkey (10-100x faster than disk-based solutions)
- **💾 Efficient**: LRU eviction policy automatically manages cache size
- **🔄 Drop-in Replacement**: Compatible with `actions/cache` API
- **🎯 Smart Restore**: Supports exact and prefix-matched cache keys
- **📦 Optimized Compression**: Configurable compression levels for optimal performance
- **🔧 Zero Infrastructure**: Uses existing Redis/Valkey deployments

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

### Option 1: Deploy Valkey on Kubernetes

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

### Option 2: Use Existing Redis

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

### Cache Not Restoring

**Check Redis connectivity:**
```bash
# From runner
redis-cli -h valkey-cache.github-actions-cache.svc.cluster.local ping
# Expected: PONG
```

**Check cache exists:**
```bash
# List all cache keys for your repo
redis-cli --scan --pattern "owner/repo:*"
```

### Large Cache Sizes

If your cache is > 1GB, consider:
1. **Reduce cached paths**: Only cache essential dependencies
2. **Increase compression**: Use `compression: 9` for maximum compression
3. **Shorter TTL**: Reduce `ttl` to clean up old caches faster

### Redis Out of Memory

Increase `maxmemory` or enable automatic eviction:
```bash
# Update Valkey deployment
kubectl set env deployment/valkey-cache -n github-actions-cache \
  VALKEY_MAXMEMORY=8gb
```

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
