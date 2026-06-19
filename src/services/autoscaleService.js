const k8s = require('@kubernetes/client-node');
const logger = require('../utils/logger');

class AutoscaleService {
    constructor() {
        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();
        this.autoscaling = this.kc.makeApiClient(k8s.AutoscalingV2Api);
        this.apps = this.kc.makeApiClient(k8s.AppsV1Api);
    }

    async listHPAs(namespace) {
        try {
            let res;
            if (!namespace || namespace === 'all') {
                res = await this.autoscaling.listHorizontalPodAutoscalerForAllNamespaces();
            } else {
                res = await this.autoscaling.listNamespacedHorizontalPodAutoscaler({ namespace });
            }
            return res.items || [];
        } catch (err) {
            logger.error({ err: err.message }, 'Failed to list HPAs');
            throw err;
        }
    }

    async getHPA(namespace, name) {
        const res = await this.autoscaling.readNamespacedHorizontalPodAutoscaler({ namespace, name });
        return res;
    }

    async createHPA(namespace, spec) {
        const manifest = {
            apiVersion: 'autoscaling/v2',
            kind: 'HorizontalPodAutoscaler',
            metadata: {
                name: spec.name,
                namespace,
            },
            spec: {
                scaleTargetRef: {
                    apiVersion: spec.targetApiVersion || 'apps/v1',
                    kind: spec.targetKind || 'Deployment',
                    name: spec.targetName,
                },
                minReplicas: parseInt(spec.minReplicas) || 1,
                maxReplicas: parseInt(spec.maxReplicas) || 10,
                metrics: spec.metrics || [
                    {
                        type: 'Resource',
                        resource: {
                            name: 'cpu',
                            target: {
                                type: 'Utilization',
                                averageUtilization: parseInt(spec.cpuTarget) || 70,
                            },
                        },
                    },
                ],
            },
        };

        if (spec.memoryTarget) {
            manifest.spec.metrics.push({
                type: 'Resource',
                resource: {
                    name: 'memory',
                    target: {
                        type: 'Utilization',
                        averageUtilization: parseInt(spec.memoryTarget),
                    },
                },
            });
        }

        const res = await this.autoscaling.createNamespacedHorizontalPodAutoscaler({ namespace, body: manifest });
        return res;
    }

    async updateHPA(namespace, name, patch) {
        const existing = await this.getHPA(namespace, name);
        const updated = { ...existing };

        if (patch.minReplicas !== undefined) updated.spec.minReplicas = parseInt(patch.minReplicas);
        if (patch.maxReplicas !== undefined) updated.spec.maxReplicas = parseInt(patch.maxReplicas);
        if (patch.metrics) updated.spec.metrics = patch.metrics;

        const res = await this.autoscaling.replaceNamespacedHorizontalPodAutoscaler({
            namespace,
            name,
            body: updated,
        });
        return res;
    }

    async deleteHPA(namespace, name) {
        await this.autoscaling.deleteNamespacedHorizontalPodAutoscaler({ namespace, name });
    }

    async listScalableTargets(namespace) {
        const ns = (!namespace || namespace === 'all') ? undefined : namespace;
        const results = { deployments: [], statefulsets: [] };
        try {
            if (ns) {
                const [deps, sts] = await Promise.all([
                    this.apps.listNamespacedDeployment({ namespace: ns }),
                    this.apps.listNamespacedStatefulSet({ namespace: ns }),
                ]);
                results.deployments = (deps.items || []).map(d => ({ name: d.metadata.name, namespace: d.metadata.namespace, replicas: d.spec.replicas }));
                results.statefulsets = (sts.items || []).map(s => ({ name: s.metadata.name, namespace: s.metadata.namespace, replicas: s.spec.replicas }));
            } else {
                const [deps, sts] = await Promise.all([
                    this.apps.listDeploymentForAllNamespaces(),
                    this.apps.listStatefulSetForAllNamespaces(),
                ]);
                results.deployments = (deps.items || []).map(d => ({ name: d.metadata.name, namespace: d.metadata.namespace, replicas: d.spec.replicas }));
                results.statefulsets = (sts.items || []).map(s => ({ name: s.metadata.name, namespace: s.metadata.namespace, replicas: s.spec.replicas }));
            }
        } catch (err) {
            logger.error({ err: err.message }, 'Failed to list scalable targets');
        }
        return results;
    }
}

module.exports = new AutoscaleService();
