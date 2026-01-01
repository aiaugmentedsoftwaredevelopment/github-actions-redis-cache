import * as pulumi from '@pulumi/pulumi';
import { ValkeyCache } from './valkey-cache';

// Create Valkey cache infrastructure
const valkeyCache = new ValkeyCache('valkey-cache', {});

// Export outputs for use in GitHub Actions workflows
export const namespace = valkeyCache.namespace.metadata.name;
export const deploymentName = valkeyCache.deployment.metadata.name;
export const serviceName = valkeyCache.service.metadata.name;
export const serviceUrl = valkeyCache.serviceUrl;
export const servicePort = valkeyCache.servicePort;

// Export full connection string for convenience
export const connectionString = pulumi.interpolate`redis://${serviceUrl}:${servicePort}`;
