# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action for ultra-fast dependency caching using Redis/Valkey. It provides a drop-in replacement for `actions/cache` with significantly better performance by using in-memory storage instead of disk-based caching.

## Development Commands

### Build
```bash
npm run build
```
Compiles TypeScript to `lib/` and bundles with `@vercel/ncc` to `dist/` for GitHub Actions distribution. Builds both `dist/index.js` (main entry) and `dist/post.js` (post-action cleanup).

### Testing
```bash
npm test
```
Runs Jest test suite.

### Linting & Formatting
```bash
npm run lint          # ESLint check
npm run format        # Format with Prettier
npm run format-check  # Check formatting without changes
npm run all           # Runs format, lint, build, and test
```

## Architecture

### Two-Phase Execution Model

This action uses GitHub Actions' pre/post pattern:

1. **Restore Phase** (`src/index.ts` → `dist/index.js`):
   - Runs at start of job
   - Attempts to restore cache from Redis using exact key or restore-keys patterns
   - Uses Redis SCAN for prefix-matched key lookups
   - Extracts tarball to filesystem root if cache found
   - If cache miss, saves state for post-action to create cache

2. **Save Phase** (`src/post.ts` → `dist/post.js`):
   - Runs at end of job (defined in `action.yml` as `post` and `post-if: success()`)
   - Only executes if cache was missed in restore phase
   - Creates tarball from resolved paths and uploads to Redis with TTL

### Key Utilities (`src/utils.ts`)

- **`createRedisClient()`**: Creates ioredis client with retry logic
- **`getCacheKey()`**: Prepends repository context to keys (format: `owner/repo:key`) to prevent cross-repo collisions
- **`resolveGlobPaths()`**: Resolves glob patterns using `@actions/glob`
- **`createTarball()`/`extractTarball()`**: Uses native `tar` command for compression/decompression
- **`scanKeys()`**: Redis SCAN wrapper for pattern-based key lookups

### Cache Key Strategy

Cache keys are automatically scoped by repository to avoid collisions:
- User input: `linux-pub-abc123`
- Redis storage: `owner/repo:linux-pub-abc123`

Restore keys support prefix matching with wildcard patterns for fallback cache restoration.

## Building for Distribution

**Critical**: This action must be distributed with compiled code in `dist/` because GitHub Actions cannot install dependencies at runtime.

After making changes:
```bash
npm run build
git add dist/
git commit -m "build: update dist"
```

The `dist/` directory contains bundled, self-contained JavaScript that includes all dependencies.

## Testing in GitHub Actions

To test changes in a real workflow:
1. Push changes to a branch
2. Reference the branch in a workflow file: `uses: owner/repo@branch-name`
3. Or create a release tag: `uses: owner/repo@v1`

## Dependencies

Core dependencies:
- `@actions/core`: GitHub Actions toolkit for inputs/outputs/logging
- `@actions/glob`: Path pattern matching for cache paths
- `@actions/exec`: Execute tar commands
- `ioredis`: Redis client with cluster/sentinel support

## Input Validation

The action expects:
- `path`: Multi-line string with glob patterns (required)
- `key`: Cache key, typically includes dependency file hashes (required)
- `restore-keys`: Optional multi-line fallback keys for prefix matching
- Redis connection details with sensible defaults for k8s deployments
