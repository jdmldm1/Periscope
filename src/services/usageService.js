const k8sService = require('./k8sService');
const { cpuMillis, memBytes } = require('../utils/quantity');

const LOW_USAGE_RATIO = 0.2;
const HIGH_LIMIT_RATIO = 0.9;

function containerTotals(containers, key) {
    const parse = key === 'cpu' ? cpuMillis : memBytes;
    let request = 0;
    let limit = 0;
    let limitMissing = false;
    for (const c of containers || []) {
        request += parse(c.resources?.requests?.[key]);
        const l = parse(c.resources?.limits?.[key]);
        if (l > 0) limit += l;
        else limitMissing = true;
    }
    return { request, limit: limitMissing ? 0 : limit };
}

function usageTotals(containers, key) {
    const parse = key === 'cpu' ? cpuMillis : memBytes;
    return (containers || []).reduce((sum, c) => sum + parse(c.usage?.[key]), 0);
}

function hintsFor(metric, { request, limit, usage }) {
    const hints = [];
    if (request === 0) hints.push(`no ${metric} request`);
    else if (usage / request < LOW_USAGE_RATIO) hints.push(`${metric} over-provisioned`);
    if (limit > 0 && usage / limit > HIGH_LIMIT_RATIO) hints.push(`${metric} near limit`);
    return hints;
}

function buildPodUsage(pods, podMetrics) {
    const metricsByKey = new Map(podMetrics.map((m) => [`${m.metadata?.namespace}/${m.metadata?.name}`, m]));
    return pods
        .filter((p) => p.status?.phase === 'Running')
        .map((pod) => {
            const key = `${pod.metadata.namespace}/${pod.metadata.name}`;
            const metric = metricsByKey.get(key);
            const containers = pod.spec?.containers || [];
            const cpu = {
                ...containerTotals(containers, 'cpu'),
                usage: metric ? usageTotals(metric.containers, 'cpu') : null,
            };
            const mem = {
                ...containerTotals(containers, 'memory'),
                usage: metric ? usageTotals(metric.containers, 'memory') : null,
            };
            const hints = metric ? [...hintsFor('cpu', cpu), ...hintsFor('memory', mem)] : [];
            return {
                name: pod.metadata.name,
                namespace: pod.metadata.namespace,
                node: pod.spec?.nodeName || null,
                cpu,
                memory: mem,
                hints,
            };
        });
}

function buildNodeUsage(nodes, nodeMetrics, pods) {
    const metricsByName = new Map(nodeMetrics.map((m) => [m.metadata?.name, m]));
    const requestsByNode = new Map();
    for (const pod of pods) {
        if (!pod.spec?.nodeName || ['Succeeded', 'Failed'].includes(pod.status?.phase)) continue;
        const acc = requestsByNode.get(pod.spec.nodeName) || { cpu: 0, memory: 0, pods: 0 };
        acc.cpu += containerTotals(pod.spec.containers, 'cpu').request;
        acc.memory += containerTotals(pod.spec.containers, 'memory').request;
        acc.pods += 1;
        requestsByNode.set(pod.spec.nodeName, acc);
    }
    return nodes.map((node) => {
        const name = node.metadata.name;
        const alloc = node.status?.allocatable || {};
        const requested = requestsByNode.get(name) || { cpu: 0, memory: 0, pods: 0 };
        const metric = metricsByName.get(name);
        return {
            name,
            cpu: {
                allocatable: cpuMillis(alloc.cpu),
                request: requested.cpu,
                usage: metric ? cpuMillis(metric.usage?.cpu) : null,
            },
            memory: {
                allocatable: memBytes(alloc.memory),
                request: requested.memory,
                usage: metric ? memBytes(metric.usage?.memory) : null,
            },
            pods: { count: requested.pods, allocatable: parseInt(alloc.pods, 10) || 0 },
        };
    });
}

async function getUsage(namespace) {
    const all = !namespace || namespace === 'all';
    const [podsRes, nodesRes, podMetricsRes, nodeMetricsRes] = await Promise.allSettled([
        k8sService.core.listPodForAllNamespaces(),
        k8sService.core.listNode(),
        k8sService.custom.listClusterCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'pods' }),
        k8sService.custom.listClusterCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'nodes' }),
    ]);
    if (podsRes.status === 'rejected') throw podsRes.reason;
    const items = (r) => (r.status === 'fulfilled' ? k8sService.getItems(r.value) : []);
    const allPods = items(podsRes);
    const scopedPods = all ? allPods : allPods.filter((p) => p.metadata.namespace === namespace);
    return {
        metricsAvailable: podMetricsRes.status === 'fulfilled',
        pods: buildPodUsage(scopedPods, items(podMetricsRes)),
        nodes: buildNodeUsage(items(nodesRes), items(nodeMetricsRes), allPods),
    };
}

module.exports = { getUsage, buildPodUsage, buildNodeUsage, hintsFor };
