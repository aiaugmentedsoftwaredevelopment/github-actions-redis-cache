import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';

export interface ValkeyCacheArgs {
  namespace?: pulumi.Input<string>;
  maxMemory?: pulumi.Input<string>;
  replicas?: pulumi.Input<number>;
  memoryRequest?: pulumi.Input<string>;
  memoryLimit?: pulumi.Input<string>;
  cpuRequest?: pulumi.Input<string>;
  cpuLimit?: pulumi.Input<string>;
  image?: pulumi.Input<string>;
}

export class ValkeyCache extends pulumi.ComponentResource {
  public readonly namespace: k8s.core.v1.Namespace;
  public readonly deployment: k8s.apps.v1.Deployment;
  public readonly service: k8s.core.v1.Service;
  public readonly serviceUrl: pulumi.Output<string>;
  public readonly servicePort: pulumi.Output<number>;

  constructor(
    name: string,
    args: ValkeyCacheArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('custom:kubernetes:ValkeyCache', name, {}, opts);

    const config = new pulumi.Config('valkey-cache');

    // Get configuration with defaults
    const namespaceName = args.namespace || config.get('namespace') || 'github-actions-cache';
    const maxMemory = args.maxMemory || config.get('maxMemory') || '4gb';
    const replicas = args.replicas || config.getNumber('replicas') || 1;
    const memoryRequest = args.memoryRequest || config.get('memoryRequest') || '2Gi';
    const memoryLimit = args.memoryLimit || config.get('memoryLimit') || '4Gi';
    const cpuRequest = args.cpuRequest || config.get('cpuRequest') || '500m';
    const cpuLimit = args.cpuLimit || config.get('cpuLimit') || '2000m';
    const image = args.image || config.get('image') || 'valkey/valkey:latest';

    // Create namespace
    this.namespace = new k8s.core.v1.Namespace(
      `${name}-namespace`,
      {
        metadata: {
          name: namespaceName,
          labels: {
            app: 'valkey-cache',
            'managed-by': 'pulumi',
          },
        },
      },
      { parent: this }
    );

    // Create deployment
    this.deployment = new k8s.apps.v1.Deployment(
      `${name}-deployment`,
      {
        metadata: {
          name: 'valkey-cache',
          namespace: this.namespace.metadata.name,
          labels: {
            app: 'valkey',
            component: 'cache',
          },
        },
        spec: {
          replicas: replicas,
          selector: {
            matchLabels: {
              app: 'valkey',
            },
          },
          template: {
            metadata: {
              labels: {
                app: 'valkey',
                component: 'cache',
              },
            },
            spec: {
              containers: [
                {
                  name: 'valkey',
                  image: image,
                  args: [
                    '--maxmemory',
                    maxMemory,
                    '--maxmemory-policy',
                    'allkeys-lru',
                    '--save',
                    '',
                    '--appendonly',
                    'no',
                  ],
                  ports: [
                    {
                      containerPort: 6379,
                      name: 'redis',
                      protocol: 'TCP',
                    },
                  ],
                  resources: {
                    requests: {
                      memory: memoryRequest,
                      cpu: cpuRequest,
                    },
                    limits: {
                      memory: memoryLimit,
                      cpu: cpuLimit,
                    },
                  },
                  livenessProbe: {
                    tcpSocket: {
                      port: 6379,
                    },
                    initialDelaySeconds: 30,
                    periodSeconds: 10,
                    timeoutSeconds: 5,
                    failureThreshold: 3,
                  },
                  readinessProbe: {
                    exec: {
                      command: ['valkey-cli', 'ping'],
                    },
                    initialDelaySeconds: 5,
                    periodSeconds: 5,
                    timeoutSeconds: 3,
                    successThreshold: 1,
                    failureThreshold: 3,
                  },
                },
              ],
            },
          },
        },
      },
      { parent: this, dependsOn: [this.namespace] }
    );

    // Create service
    this.service = new k8s.core.v1.Service(
      `${name}-service`,
      {
        metadata: {
          name: 'valkey-cache',
          namespace: this.namespace.metadata.name,
          labels: {
            app: 'valkey',
            component: 'cache',
          },
        },
        spec: {
          type: 'ClusterIP',
          selector: {
            app: 'valkey',
          },
          ports: [
            {
              port: 6379,
              targetPort: 6379,
              protocol: 'TCP',
              name: 'redis',
            },
          ],
        },
      },
      { parent: this, dependsOn: [this.deployment] }
    );

    // Export service URL and port
    this.serviceUrl = pulumi.interpolate`${this.service.metadata.name}.${this.namespace.metadata.name}.svc.cluster.local`;
    this.servicePort = pulumi.output(6379);

    this.registerOutputs({
      namespace: this.namespace.metadata.name,
      deployment: this.deployment.metadata.name,
      service: this.service.metadata.name,
      serviceUrl: this.serviceUrl,
      servicePort: this.servicePort,
    });
  }
}
