const k8sService = require('./k8sService');
const logger = require('../utils/logger');

class PruneService {
    async scanOrphaned() {
        try {
            const [podsRes, pvcRes, rsRes, cmsRes, secretsRes] = await Promise.all([
                k8sService.core.listPodForAllNamespaces(),
                k8sService.core.listPersistentVolumeClaimForAllNamespaces(),
                k8sService.apps.listReplicaSetForAllNamespaces(),
                k8sService.core.listConfigMapForAllNamespaces(),
                k8sService.core.listSecretForAllNamespaces()
            ]);

            const pods = podsRes.items || podsRes.body?.items || [];
            const pvcs = pvcRes.items || pvcRes.body?.items || [];
            const rss = rsRes.items || rsRes.body?.items || [];
            const cms = cmsRes.items || cmsRes.body?.items || [];
            const secrets = secretsRes.items || secretsRes.body?.items || [];

            // 1. Failed / Completed Pods
            const cleanablePods = pods.filter(pod => {
                const phase = pod.status?.phase;
                return phase === 'Failed' || phase === 'Succeeded';
            }).map(pod => ({
                kind: 'Pod',
                name: pod.metadata.name,
                namespace: pod.metadata.namespace,
                status: pod.status?.phase,
                info: `Phase: ${pod.status?.phase}`
            }));

            // 2. Unused ReplicaSets
            const cleanableReplicaSets = rss.filter(rs => {
                const desired = rs.spec?.replicas || 0;
                const current = rs.status?.replicas || 0;
                return desired === 0 && current === 0;
            }).map(rs => ({
                kind: 'ReplicaSet',
                name: rs.metadata.name,
                namespace: rs.metadata.namespace,
                status: 'Unused',
                info: 'Replicas set to 0'
            }));

            // 3. Dangling PVCs (not used by any Pod)
            const activePvcNames = new Set();
            pods.forEach(pod => {
                (pod.spec?.volumes || []).forEach(vol => {
                    if (vol.persistentVolumeClaim?.claimName) {
                        activePvcNames.add(`${pod.metadata.namespace}/${vol.persistentVolumeClaim.claimName}`);
                    }
                });
            });

            const cleanablePvcs = pvcs.filter(pvc => {
                const key = `${pvc.metadata.namespace}/${pvc.metadata.name}`;
                return !activePvcNames.has(key);
            }).map(pvc => ({
                kind: 'PersistentVolumeClaim',
                name: pvc.metadata.name,
                namespace: pvc.metadata.namespace,
                status: pvc.status?.phase || 'Dangling',
                info: `Unused PVC (${pvc.status?.phase || 'Unknown'})`
            }));

            // 4. Unused ConfigMaps & Secrets (excluding defaults/system ones)
            const activeConfigMaps = new Set();
            const activeSecrets = new Set();

            pods.forEach(pod => {
                const ns = pod.metadata.namespace;
                (pod.spec?.volumes || []).forEach(vol => {
                    if (vol.configMap?.name) activeConfigMaps.add(`${ns}/${vol.configMap.name}`);
                    if (vol.secret?.secretName) activeSecrets.add(`${ns}/${vol.secret.secretName}`);
                });

                const checkEnv = (c) => {
                    (c.env || []).forEach(e => {
                        if (e.valueFrom?.configMapKeyRef?.name) activeConfigMaps.add(`${ns}/${e.valueFrom.configMapKeyRef.name}`);
                        if (e.valueFrom?.secretKeyRef?.name) activeSecrets.add(`${ns}/${e.valueFrom.secretKeyRef.name}`);
                    });
                    (c.envFrom || []).forEach(ef => {
                        if (ef.configMapRef?.name) activeConfigMaps.add(`${ns}/${ef.configMapRef.name}`);
                        if (ef.secretRef?.name) activeSecrets.add(`${ns}/${ef.secretRef.name}`);
                    });
                };

                (pod.spec?.containers || []).forEach(checkEnv);
                (pod.spec?.initContainers || []).forEach(checkEnv);
            });

            const cleanableCms = cms.filter(cm => {
                const ns = cm.metadata.namespace;
                if (['kube-system', 'kube-public', 'kube-node-lease', 'zarf'].includes(ns)) return false;
                if (cm.metadata.name === 'kube-root-ca.crt') return false;
                
                const key = `${ns}/${cm.metadata.name}`;
                return !activeConfigMaps.has(key);
            }).map(cm => ({
                kind: 'ConfigMap',
                name: cm.metadata.name,
                namespace: cm.metadata.namespace,
                status: 'Unused',
                info: 'Unreferenced in workloads'
            }));

            const cleanableSecrets = secrets.filter(secret => {
                const ns = secret.metadata.namespace;
                if (['kube-system', 'kube-public', 'kube-node-lease', 'zarf'].includes(ns)) return false;
                
                // Exclude Helm release secrets, service account token secrets, and docker config registry secrets
                const name = secret.metadata.name;
                if (name.startsWith('sh.helm.release.v1.')) return false;
                if (name.includes('token-')) return false;
                if (secret.type === 'kubernetes.io/service-account-token') return false;
                if (secret.type === 'kubernetes.io/dockercfg' || secret.type === 'kubernetes.io/dockerconfigjson') return false;

                const key = `${ns}/${name}`;
                return !activeSecrets.has(key);
            }).map(secret => ({
                kind: 'Secret',
                name: secret.metadata.name,
                namespace: secret.metadata.namespace,
                status: 'Unused',
                info: `Unreferenced Secret (${secret.type})`
            }));

            return [
                ...cleanablePods,
                ...cleanableReplicaSets,
                ...cleanablePvcs,
                ...cleanableCms,
                ...cleanableSecrets
            ];
        } catch (err) {
            logger.error(err, 'Failed to scan for cleanable resources');
            throw err;
        }
    }

    async pruneResources(resources) {
        const results = [];
        logger.info({ count: resources.length }, 'Pruning cluster resources');

        for (const res of resources) {
            const { kind, name, namespace } = res;
            try {
                if (kind === 'Pod') {
                    await k8sService.core.deleteNamespacedPod({ name, namespace });
                } else if (kind === 'ReplicaSet') {
                    await k8sService.apps.deleteNamespacedReplicaSet({ name, namespace });
                } else if (kind === 'PersistentVolumeClaim') {
                    await k8sService.core.deleteNamespacedPersistentVolumeClaim({ name, namespace });
                } else if (kind === 'ConfigMap') {
                    await k8sService.core.deleteNamespacedConfigMap({ name, namespace });
                } else if (kind === 'Secret') {
                    await k8sService.core.deleteNamespacedSecret({ name, namespace });
                }
                results.push({ kind, name, namespace, success: true });
            } catch (err) {
                logger.error({ kind, name, namespace, error: err.message }, 'Failed to delete resource during prune');
                results.push({ kind, name, namespace, success: false, error: err.message });
            }
        }
        return results;
    }
}

module.exports = new PruneService();
