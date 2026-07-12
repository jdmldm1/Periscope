function parseCpu(cpuStr) {
    if (!cpuStr) return 0;
    if (cpuStr.endsWith('n')) return parseFloat(cpuStr) / 1000000;
    if (cpuStr.endsWith('u')) return parseFloat(cpuStr) / 1000;
    if (cpuStr.endsWith('m')) return parseFloat(cpuStr);
    return parseFloat(cpuStr) * 1000;
}

function parseMem(memStr) {
    if (!memStr) return 0;
    if (memStr.endsWith('Ki')) return parseFloat(memStr);
    if (memStr.endsWith('Mi')) return parseFloat(memStr) * 1024;
    if (memStr.endsWith('Gi')) return parseFloat(memStr) * 1024 * 1024;
    return parseFloat(memStr) / 1024;
}

function getItems(raw) {
    return raw?.items || raw?.body?.items || [];
}





const KIND_GVK = {
    pods: { apiVersion: 'v1', kind: 'Pod' },
    services: { apiVersion: 'v1', kind: 'Service' },
    configmaps: { apiVersion: 'v1', kind: 'ConfigMap' },
    secrets: { apiVersion: 'v1', kind: 'Secret' },
    persistentvolumeclaims: { apiVersion: 'v1', kind: 'PersistentVolumeClaim' },
    persistentvolumes: { apiVersion: 'v1', kind: 'PersistentVolume' },
    nodes: { apiVersion: 'v1', kind: 'Node' },
    namespaces: { apiVersion: 'v1', kind: 'Namespace' },
    events: { apiVersion: 'v1', kind: 'Event' },
    deployments: { apiVersion: 'apps/v1', kind: 'Deployment' },
    daemonsets: { apiVersion: 'apps/v1', kind: 'DaemonSet' },
    statefulsets: { apiVersion: 'apps/v1', kind: 'StatefulSet' },
    replicasets: { apiVersion: 'apps/v1', kind: 'ReplicaSet' },
    ingresses: { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress' },
    networkpolicies: { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy' },
    jobs: { apiVersion: 'batch/v1', kind: 'Job' },
    cronjobs: { apiVersion: 'batch/v1', kind: 'CronJob' },
    crds: { apiVersion: 'apiextensions.k8s.io/v1', kind: 'CustomResourceDefinition' },
    customresourcedefinitions: { apiVersion: 'apiextensions.k8s.io/v1', kind: 'CustomResourceDefinition' },
};



function ensureTypeMeta(item, kind) {
    if (!item || typeof item !== 'object') return item;
    const gvk = KIND_GVK[String(kind || '').toLowerCase()];
    if (!item.apiVersion) item.apiVersion = gvk?.apiVersion || item.apiVersion;
    if (!item.kind) item.kind = gvk?.kind || item.kind;
    return item;
}

module.exports = { parseCpu, parseMem, getItems, KIND_GVK, ensureTypeMeta };
