# Valkey Cache Infrastructure

Pulumi infrastructure-as-code for deploying Valkey (Redis fork) to Kubernetes for ultra-fast GitHub Actions caching.

## Overview

This Pulumi project deploys a production-ready Valkey instance to your Kubernetes cluster that:
- Provides in-memory caching for GitHub Actions (10-100x faster than disk-based solutions)
- Uses ~200MB-4GB memory vs traditional object storage (11-12GB+)
- Automatically manages cache with LRU eviction policy
- Requires no persistence (cache data is ephemeral by design)

## Prerequisites

- Kubernetes cluster with kubectl access
- Pulumi CLI installed (`brew install pulumi` or see [pulumi.com](https://www.pulumi.com/docs/get-started/install/))
- Node.js 20+ and npm
- Pulumi stack with kubeconfig output (e.g., `egulatee/kubeconfig/prod`)
- GitHub repository secrets configured:
  - `PULUMI_ACCESS_TOKEN` - Pulumi Cloud access token (used to fetch kubeconfig from stack)

## Quick Start

### 1. Install Dependencies

```bash
cd pulumi
npm install
```

### 2. Initialize Pulumi Stack

```bash
pulumi stack init dev
```

### 3. Configure Stack (Optional)

Use default values or customize:

```bash
# Namespace (default: github-actions-cache)
pulumi config set valkey-cache:namespace github-actions-cache

# Resource limits (defaults shown)
pulumi config set valkey-cache:maxMemory 4gb
pulumi config set valkey-cache:memoryRequest 2Gi
pulumi config set valkey-cache:memoryLimit 4Gi
pulumi config set valkey-cache:cpuRequest 500m
pulumi config set valkey-cache:cpuLimit 2000m

# Image (default: valkey/valkey:latest)
pulumi config set valkey-cache:image valkey/valkey:latest

# Replicas (default: 1)
pulumi config set valkey-cache:replicas 1
```

### 4. Deploy Infrastructure

```bash
pulumi up
```

Review the preview and select "yes" to deploy.

### 5. Get Stack Outputs

```bash
pulumi stack output serviceUrl
# Output: valkey-cache.github-actions-cache.svc.cluster.local

pulumi stack output servicePort
# Output: 6379
```

## Architecture

### Kubernetes Resources

The stack creates:

1. **Namespace** (`github-actions-cache`)
   - Isolated environment for cache infrastructure
   - Labeled for easy identification

2. **Deployment** (`valkey-cache`)
   - Single replica (configurable)
   - Valkey container with optimized settings:
     - `maxmemory`: 4GB (configurable)
     - `maxmemory-policy`: allkeys-lru (auto-evict old caches)
     - `save`: disabled (no persistence)
     - `appendonly`: disabled (no AOF)
   - Resource requests/limits for stability
   - Liveness and readiness probes

3. **Service** (`valkey-cache`)
   - ClusterIP type (internal only)
   - Exposes port 6379
   - DNS: `valkey-cache.github-actions-cache.svc.cluster.local`

### Configuration

All configuration is managed through Pulumi config:

| Config Key | Description | Default |
|------------|-------------|---------|
| `namespace` | Kubernetes namespace | `github-actions-cache` |
| `maxMemory` | Maximum memory for Valkey | `4gb` |
| `replicas` | Number of replicas | `1` |
| `memoryRequest` | Pod memory request | `2Gi` |
| `memoryLimit` | Pod memory limit | `4Gi` |
| `cpuRequest` | Pod CPU request | `500m` |
| `cpuLimit` | Pod CPU limit | `2000m` |
| `image` | Valkey container image | `valkey/valkey:latest` |

## GitHub Actions Integration

### Automatic Deployment

The infrastructure automatically deploys when you push changes to the `pulumi/` directory on the `main` branch.

Workflow file: `.github/workflows/deploy.yml`

### Preview Changes on PRs

Pull requests that modify `pulumi/` will automatically generate a preview of infrastructure changes.

Workflow file: `.github/workflows/pull_request.yml`

### Manual Destruction

To destroy the infrastructure:

1. Go to Actions → "Destroy Valkey Cache"
2. Click "Run workflow"
3. Type `destroy` in the confirmation field
4. Click "Run workflow"

Workflow file: `.github/workflows/destroy.yml`

## Using with Redis Cache Action

After deployment, update your GitHub Actions workflows:

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
    # Use Pulumi stack outputs
    redis-host: valkey-cache.github-actions-cache.svc.cluster.local
    redis-port: 6379
    ttl: 604800  # 7 days
```

### Dynamic Configuration from Stack Outputs

You can retrieve Pulumi outputs in workflows:

```yaml
- name: Get Valkey connection info
  id: valkey
  run: |
    cd pulumi
    echo "host=$(pulumi stack output serviceUrl)" >> $GITHUB_OUTPUT
    echo "port=$(pulumi stack output servicePort)" >> $GITHUB_OUTPUT
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}

- name: Cache Dependencies
  uses: aiaugmentedsoftwaredevelopment/github-actions-redis-cache@v1
  with:
    redis-host: ${{ steps.valkey.outputs.host }}
    redis-port: ${{ steps.valkey.outputs.port }}
    # ... other inputs
```

## Stack Outputs

The stack exports the following outputs:

| Output | Description | Example |
|--------|-------------|---------|
| `namespace` | Kubernetes namespace name | `github-actions-cache` |
| `deploymentName` | Deployment resource name | `valkey-cache` |
| `serviceName` | Service resource name | `valkey-cache` |
| `serviceUrl` | Full DNS name for service | `valkey-cache.github-actions-cache.svc.cluster.local` |
| `servicePort` | Service port number | `6379` |
| `connectionString` | Full Redis connection string | `redis://valkey-cache.github-actions-cache.svc.cluster.local:6379` |

## Verification

### Check Deployment Status

```bash
kubectl get pods -n github-actions-cache
```

Expected output:
```
NAME                            READY   STATUS    RESTARTS   AGE
valkey-cache-xxxxxxxxxx-xxxxx   1/1     Running   0          2m
```

### Test Connectivity

From within the cluster:

```bash
kubectl run -it --rm redis-test --image=redis:alpine --restart=Never -- \
  redis-cli -h valkey-cache.github-actions-cache.svc.cluster.local ping
```

Expected output: `PONG`

### Check Resource Usage

```bash
kubectl top pod -n github-actions-cache
```

## Troubleshooting

### Pod Not Starting

Check pod events:
```bash
kubectl describe pod -n github-actions-cache -l app=valkey
```

Common issues:
- Insufficient cluster resources (check memory/CPU limits)
- Image pull errors (check image name and registry access)

### Service Not Accessible

Verify service endpoints:
```bash
kubectl get endpoints -n github-actions-cache
```

Check if pods are ready:
```bash
kubectl get pods -n github-actions-cache -o wide
```

### Memory Errors

If Valkey runs out of memory, check eviction policy:
```bash
kubectl exec -n github-actions-cache deployment/valkey-cache -- \
  valkey-cli CONFIG GET maxmemory-policy
```

Should return: `allkeys-lru`

Increase memory limit:
```bash
pulumi config set valkey-cache:memoryLimit 8Gi
pulumi up
```

## Performance

### Expected Metrics

| Operation | Size | Time |
|-----------|------|------|
| Cache Save | 5GB | ~8-12s |
| Cache Restore | 5GB | ~5-8s |
| Network | Cluster-local | <10ms latency |
| Memory Usage | Typical | 200MB-4GB |

### Memory Management

Valkey automatically evicts old caches using LRU (Least Recently Used) when memory limit is reached:
- No manual cleanup required
- Cache TTL defaults to 7 days
- Most recent caches always available

## Updating Infrastructure

### Update Valkey Version

```bash
pulumi config set valkey-cache:image valkey/valkey:7.2
pulumi up
```

### Scale Replicas

```bash
pulumi config set valkey-cache:replicas 2
pulumi up
```

**Note**: Valkey replication requires additional configuration for proper synchronization. Single replica is recommended for cache use cases.

### Increase Memory

```bash
pulumi config set valkey-cache:maxMemory 8gb
pulumi config set valkey-cache:memoryLimit 8Gi
pulumi up
```

## Development

### Project Structure

```
pulumi/
├── .github/workflows/     # GitHub Actions workflows
├── index.ts              # Main entry point, exports
├── valkey-cache.ts       # ValkeyCache component
├── package.json          # Dependencies
├── Pulumi.yaml           # Project configuration
└── tsconfig.json         # TypeScript configuration
```

### Local Development

1. Make changes to TypeScript files
2. Preview changes: `pulumi preview`
3. Apply changes: `pulumi up`

### Testing Changes

Create a new stack for testing:

```bash
pulumi stack init test
pulumi config copy-config --stack dev
pulumi up
```

## Security

### Network Isolation

- Service is `ClusterIP` type (internal only, no external access)
- Only accessible from within Kubernetes cluster
- No authentication required (cluster network security)

### Adding Authentication (Optional)

To add password authentication:

1. Create Kubernetes secret:
```bash
kubectl create secret generic valkey-password \
  --from-literal=password=$(openssl rand -base64 32) \
  -n github-actions-cache
```

2. Modify `valkey-cache.ts` to add password argument and mount secret
3. Update workflows to use `redis-password` input

## Cost Optimization

- **Memory**: Start with 4GB, adjust based on actual usage
- **CPU**: 500m-2000m is sufficient for most workloads
- **Replicas**: Single replica adequate for cache use case
- **TTL**: 7 days default, reduce if storage costs are concern

## Related Resources

- [Redis Cache Action](https://github.com/aiaugmentedsoftwaredevelopment/github-actions-redis-cache)
- [Valkey Documentation](https://valkey.io/)
- [Pulumi Kubernetes Guide](https://www.pulumi.com/docs/guides/crosswalk/kubernetes/)

## License

MIT License - see root [LICENSE](../LICENSE) file for details.
