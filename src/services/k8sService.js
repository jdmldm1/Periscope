const k8s = require('@kubernetes/client-node');
const logger = require('../utils/logger');

class K8sService {
    constructor() {
        this.kc = new k8s.KubeConfig();
        this.kc.loadFromDefault();
        this.initializeClients();
    }

    initializeClients() {
        try {
            this.core = this.kc.makeApiClient(k8s.CoreV1Api);
            this.apps = this.kc.makeApiClient(k8s.AppsV1Api);
            this.batch = this.kc.makeApiClient(k8s.BatchV1Api);
            this.networking = this.kc.makeApiClient(k8s.NetworkingV1Api);
            this.custom = this.kc.makeApiClient(k8s.CustomObjectsApi);
            this.extensions = this.kc.makeApiClient(k8s.ApiextensionsV1Api);
            this.rbac = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);
            
            this.fetchers = {
                'pods': (ns) => this.core.listNamespacedPod({ namespace: ns }),
                'deployments': (ns) => this.apps.listNamespacedDeployment({ namespace: ns }),
                'daemonsets': (ns) => this.apps.listNamespacedDaemonSet({ namespace: ns }),
                'statefulsets': (ns) => this.apps.listNamespacedStatefulSet({ namespace: ns }),
                'services': (ns) => this.core.listNamespacedService({ namespace: ns }),
                'configmaps': (ns) => this.core.listNamespacedConfigMap({ namespace: ns }),
                'secrets': (ns) => this.core.listNamespacedSecret({ namespace: ns }),
                'ingresses': (ns) => this.networking.listNamespacedIngress({ namespace: ns }),
                'networkpolicies': (ns) => this.networking.listNamespacedNetworkPolicy({ namespace: ns }),
                'jobs': (ns) => this.batch.listNamespacedJob({ namespace: ns }),
                'cronjobs': (ns) => this.batch.listNamespacedCronJob({ namespace: ns }),
                'events': (ns) => this.core.listNamespacedEvent({ namespace: ns }),
                'namespaces': () => this.core.listNamespace(),
                'persistentvolumes': () => this.core.listPersistentVolume(),
                'persistentvolumeclaims': (ns) => this.core.listNamespacedPersistentVolumeClaim({ namespace: ns }),
                'nodes': () => this.core.listNode(),
                'crds': () => this.extensions.listCustomResourceDefinition(),
                'customresourcedefinitions': () => this.extensions.listCustomResourceDefinition()
            };

            this.allNamespacesFetchers = {
                'pods': () => this.core.listPodForAllNamespaces(),
                'deployments': () => this.apps.listDeploymentForAllNamespaces(),
                'daemonsets': () => this.apps.listDaemonSetForAllNamespaces(),
                'statefulsets': () => this.apps.listStatefulSetForAllNamespaces(),
                'services': () => this.core.listServiceForAllNamespaces(),
                'configmaps': () => this.core.listConfigMapForAllNamespaces(),
                'secrets': () => this.core.listSecretForAllNamespaces(),
                'ingresses': () => this.networking.listIngressForAllNamespaces(),
                'networkpolicies': () => this.networking.listNetworkPolicyForAllNamespaces(),
                'jobs': () => this.batch.listJobForAllNamespaces(),
                'cronjobs': () => this.batch.listCronJobForAllNamespaces(),
                'events': () => this.core.listEventForAllNamespaces(),
                'persistentvolumeclaims': () => this.core.listPersistentVolumeClaimForAllNamespaces()
            };
            logger.info({ context: this.kc.currentContext }, 'K8s clients initialized');
        } catch (err) {
            logger.error(err, 'Failed to initialize K8s clients');
            throw err;
        }
    }

    async getResources(kind, ns) {
        const k = kind.toLowerCase();
        try {
            let res;
            if (ns === 'all' || k === 'namespaces' || k === 'crds' || k === 'customresourcedefinitions' || k === 'nodes' || k === 'persistentvolumes') {
                if (['persistentvolumes', 'nodes', 'namespaces', 'crds', 'customresourcedefinitions'].includes(k)) {
                    res = await this.fetchers[k]();
                } else if (this.allNamespacesFetchers[k]) {
                    res = await this.allNamespacesFetchers[k]();
                } else {
                    throw new Error('All namespaces not supported for this kind');
                }
            } else {
                const nsName = ns || 'default';
                if (!this.fetchers[k]) {
                    throw new Error(`Kind ${kind} not supported`);
                }
                res = await this.fetchers[k](nsName);
            }
            if (!res) return [];
            return res.items || res.body?.items || [];
        } catch (err) {
            logger.error({ kind, ns, error: err.message }, 'Error in getResources');
            throw err;
        }
    }

    async getContexts() {
        return {
            contexts: this.kc.contexts.map(c => ({
                name: c.name,
                cluster: c.cluster,
                user: c.user
            })),
            currentContext: this.kc.currentContext
        };
    }

    async setContext(contextName) {
        const { exec } = require('child_process');
        return new Promise((resolve, reject) => {
            exec(`kubectl config use-context "${contextName}"`, (error, stdout, stderr) => {
                if (error) {
                    logger.error({ contextName, error: error.message }, 'Failed to switch context');
                    return reject(error);
                }
                try {
                    this.kc.loadFromDefault();
                    this.initializeClients();
                    resolve(this.kc.currentContext);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    async getTopologyData(ns) {
        try {
            const isAll = !ns || ns === 'all';
            const [nodesRes, servicesRes, deploymentsRes, podsRes] = await Promise.all([
                this.core.listNode(),
                isAll ? this.core.listServiceForAllNamespaces() : this.core.listNamespacedService({ namespace: ns }),
                isAll ? this.apps.listDeploymentForAllNamespaces() : this.apps.listNamespacedDeployment({ namespace: ns }),
                isAll ? this.core.listPodForAllNamespaces() : this.core.listNamespacedPod({ namespace: ns })
            ]);

            const getItems = (res) => res.items || res.body?.items || [];

            return {
                nodes: getItems(nodesRes),
                services: getItems(servicesRes),
                deployments: getItems(deploymentsRes),
                pods: getItems(podsRes)
            };
        } catch (err) {
            logger.error({ ns, error: err.message }, 'Error getting topology data');
            throw err;
        }
    }

    async getNamespaces() {
        const res = await this.core.listNamespace();
        return res.items.map(ns => ns.metadata.name);
    }
}

module.exports = new K8sService();
