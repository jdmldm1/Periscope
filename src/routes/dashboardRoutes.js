const express = require('express');
const router = express.Router();
const k8sService = require('../services/k8sService');
const helmService = require('../services/helmService');
const zarfService = require('../services/zarfService');
const logger = require('../utils/logger');
const { parseCpu, parseMem, getItems } = require('../utils/k8sHelpers');

// Container waiting reasons that indicate a hard failure
const IMAGE_PULL_REASONS = ['ImagePullBackOff', 'ErrImagePull', 'ErrImageNeverPull', 'InvalidImageName'];
const CONFIG_ERROR_REASONS = ['CreateContainerConfigError', 'CreateContainerError', 'RunContainerError', 'StartError'];
const RESTART_WARN_THRESHOLD = 5;

// Classify a pod into a single "worst" health status for troubleshooting.
// Returns one of: healthy | crashLooping | imagePullError | configError |
// oomKilled | failed | pending | notReady | terminating
function classifyPod(p) {
    const phase = p.status?.phase;
    if (p.metadata?.deletionTimestamp) return 'terminating';
    if (phase === 'Succeeded') return 'healthy'; // completed jobs/pods
    if (phase === 'Failed') return 'failed';

    const allContainers = [
        ...(p.status?.containerStatuses || []),
        ...(p.status?.initContainerStatuses || [])
    ];

    for (const c of allContainers) {
        const reason = c.state?.waiting?.reason;
        if (reason === 'CrashLoopBackOff') return 'crashLooping';
        if (IMAGE_PULL_REASONS.includes(reason)) return 'imagePullError';
        if (CONFIG_ERROR_REASONS.includes(reason)) return 'configError';
    }

    for (const c of (p.status?.containerStatuses || [])) {
        if (c.lastState?.terminated?.reason === 'OOMKilled') return 'oomKilled';
    }

    if (phase === 'Pending') return 'pending';

    // Running pods: a "Ready" condition of False means the pod is up but not serving
    const readyCond = (p.status?.conditions || []).find(c => c.type === 'Ready');
    if (readyCond && readyCond.status !== 'True') return 'notReady';

    return 'healthy';
}

function podRestarts(p) {
    return (p.status?.containerStatuses || []).reduce((sum, c) => sum + (c.restartCount || 0), 0);
}

// Human-readable detail for a problem pod
function podIssueMessage(p, status) {
    const allContainers = [
        ...(p.status?.containerStatuses || []),
        ...(p.status?.initContainerStatuses || [])
    ];
    for (const c of allContainers) {
        const w = c.state?.waiting;
        if (w?.reason && (w.reason === 'CrashLoopBackOff' || IMAGE_PULL_REASONS.includes(w.reason) || CONFIG_ERROR_REASONS.includes(w.reason))) {
            return (w.message || w.reason).slice(0, 240);
        }
    }
    if (status === 'oomKilled') {
        const c = (p.status?.containerStatuses || []).find(c => c.lastState?.terminated?.reason === 'OOMKilled');
        return `Container "${c?.name || '?'}" was OOMKilled (out of memory)`;
    }
    if (status === 'pending') {
        const sched = (p.status?.conditions || []).find(c => c.type === 'PodScheduled');
        if (sched && sched.status !== 'True') return sched.message || 'Pod cannot be scheduled';
        return p.status?.reason || 'Pod is pending';
    }
    if (status === 'notReady') {
        const notReady = (p.status?.containerStatuses || []).filter(c => !c.ready).map(c => c.name);
        return notReady.length ? `Containers not ready: ${notReady.join(', ')}` : 'Pod is running but not Ready';
    }
    if (status === 'failed') {
        return p.status?.message || p.status?.reason || 'Pod failed';
    }
    return status;
}

const STATUS_SEVERITY = {
    crashLooping: 'critical',
    imagePullError: 'critical',
    configError: 'critical',
    oomKilled: 'critical',
    failed: 'critical',
    pending: 'warning',
    notReady: 'warning',
    terminating: 'warning'
};

const STATUS_LABEL = {
    crashLooping: 'CrashLoopBackOff',
    imagePullError: 'Image Pull Error',
    configError: 'Container Config Error',
    oomKilled: 'OOMKilled',
    failed: 'Failed',
    pending: 'Pending / Unschedulable',
    notReady: 'Running (Not Ready)',
    terminating: 'Stuck Terminating'
};

router.get('/stats', async (req, res) => {
    const ns = req.query.namespace;
    const scoped = ns && ns !== 'all';
    try {
        const [nodesRaw, podsRaw, deploymentsRaw, servicesRaw, configmapsRaw, secretsRaw, helmreleases, zarfpackages, nodeMetricsRaw, eventsRaw] = await Promise.all([
            k8sService.core.listNode(),
            scoped ? k8sService.core.listNamespacedPod({ namespace: ns }) : k8sService.core.listPodForAllNamespaces(),
            scoped ? k8sService.apps.listNamespacedDeployment({ namespace: ns }) : k8sService.apps.listDeploymentForAllNamespaces(),
            scoped ? k8sService.core.listNamespacedService({ namespace: ns }) : k8sService.core.listServiceForAllNamespaces(),
            scoped ? k8sService.core.listNamespacedConfigMap({ namespace: ns }) : k8sService.core.listConfigMapForAllNamespaces(),
            scoped ? k8sService.core.listNamespacedSecret({ namespace: ns }) : k8sService.core.listSecretForAllNamespaces(),
            helmService.listReleases(ns),
            zarfService.listPackages(),
            k8sService.custom.listClusterCustomObject({
                group: 'metrics.k8s.io',
                version: 'v1beta1',
                plural: 'nodes'
            }).catch(() => ({ items: [] })),
            (scoped ? k8sService.core.listNamespacedEvent({ namespace: ns }) : k8sService.core.listEventForAllNamespaces()).catch(() => ({ items: [] }))
        ]);

        const nodes = getItems(nodesRaw);
        const pods = getItems(podsRaw);
        const deployments = getItems(deploymentsRaw);
        const services = getItems(servicesRaw);
        const configmaps = getItems(configmapsRaw);
        const secrets = getItems(secretsRaw);
        const nodeMetrics = getItems(nodeMetricsRaw);
        const events = getItems(eventsRaw);

        const podPhases = {
            running: pods.filter(p => p.status?.phase === 'Running').length,
            pending: pods.filter(p => p.status?.phase === 'Pending').length,
            succeeded: pods.filter(p => p.status?.phase === 'Succeeded').length,
            failed: pods.filter(p => p.status?.phase === 'Failed').length
        };

        const issues = [];

        // ---- Pod health analysis ----
        const podHealth = {
            healthy: 0, crashLooping: 0, imagePullError: 0, configError: 0,
            oomKilled: 0, failed: 0, pending: 0, notReady: 0, terminating: 0,
            restarts: 0
        };

        pods.forEach(p => {
            const status = classifyPod(p);
            podHealth[status] = (podHealth[status] || 0) + 1;
            const restarts = podRestarts(p);
            podHealth.restarts += restarts;

            const name = p.metadata?.name;
            const namespace = p.metadata?.namespace;

            if (status !== 'healthy') {
                issues.push({
                    severity: STATUS_SEVERITY[status] || 'warning',
                    kind: 'Pod',
                    namespace,
                    name,
                    reason: STATUS_LABEL[status] || status,
                    message: podIssueMessage(p, status),
                    restarts
                });
            } else if (restarts >= RESTART_WARN_THRESHOLD) {
                // Currently healthy but has restarted frequently — worth flagging
                issues.push({
                    severity: 'warning',
                    kind: 'Pod',
                    namespace,
                    name,
                    reason: 'High Restart Count',
                    message: `Pod has restarted ${restarts} times`,
                    restarts
                });
            }
        });

        const podsUnhealthy = pods.length - podHealth.healthy;

        // ---- Node health analysis ----
        let nodesReady = 0;
        nodes.forEach(node => {
            const conditions = node.status?.conditions || [];
            const ready = conditions.find(c => c.type === 'Ready');
            const isReady = ready?.status === 'True';
            if (isReady) nodesReady++;
            const name = node.metadata?.name;

            if (!isReady) {
                issues.push({
                    severity: 'critical',
                    kind: 'Node',
                    namespace: '',
                    name,
                    reason: 'NotReady',
                    message: ready?.message || 'Node is not Ready',
                    restarts: 0
                });
            }
            ['MemoryPressure', 'DiskPressure', 'PIDPressure'].forEach(type => {
                const c = conditions.find(cond => cond.type === type);
                if (c?.status === 'True') {
                    issues.push({
                        severity: 'warning',
                        kind: 'Node',
                        namespace: '',
                        name,
                        reason: type,
                        message: c.message || `Node under ${type}`,
                        restarts: 0
                    });
                }
            });
            // cordoned / unschedulable
            if (node.spec?.unschedulable) {
                issues.push({
                    severity: 'warning',
                    kind: 'Node',
                    namespace: '',
                    name,
                    reason: 'SchedulingDisabled',
                    message: 'Node is cordoned (unschedulable)',
                    restarts: 0
                });
            }
        });

        // ---- Workload (Deployment) health analysis ----
        let deploymentsHealthy = 0;
        deployments.forEach(d => {
            const desired = d.spec?.replicas ?? 0;
            const ready = d.status?.readyReplicas ?? 0;
            if (desired === 0 || ready >= desired) {
                deploymentsHealthy++;
            } else {
                issues.push({
                    severity: ready === 0 ? 'critical' : 'warning',
                    kind: 'Deployment',
                    namespace: d.metadata?.namespace,
                    name: d.metadata?.name,
                    reason: 'Degraded',
                    message: `${ready}/${desired} replicas ready`,
                    restarts: 0
                });
            }
        });

        // ---- Recent warning events (last hour) ----
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const warningEvents = events
            .filter(e => e.type === 'Warning')
            .map(e => ({
                ...e,
                _ts: new Date(e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp || 0).getTime()
            }))
            .filter(e => e._ts >= oneHourAgo)
            .sort((a, b) => b._ts - a._ts);

        const recentWarnings = warningEvents.slice(0, 8).map(e => ({
            reason: e.reason,
            message: (e.message || '').slice(0, 240),
            kind: e.involvedObject?.kind,
            name: e.involvedObject?.name,
            namespace: e.involvedObject?.namespace || e.metadata?.namespace || '',
            count: e.count || 1,
            timestamp: e.lastTimestamp || e.metadata?.creationTimestamp
        }));

        // Sort issues: critical first, then by restart count
        const sevRank = { critical: 0, warning: 1, info: 2 };
        issues.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || (b.restarts - a.restarts));

        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

        // Resource usage calculation
        let cpuUse = 0, cpuCap = 0, memUse = 0, memCap = 0;
        nodes.forEach(node => {
            cpuCap += parseCpu(node.status?.capacity?.cpu);
            memCap += parseMem(node.status?.capacity?.memory);
            const metric = nodeMetrics.find(m => m.metadata?.name === node.metadata?.name);
            if (metric) {
                cpuUse += parseCpu(metric.usage?.cpu);
                memUse += parseMem(metric.usage?.memory);
            }
        });

        const overall = criticalCount > 0 ? 'critical' : (warningCount > 0 ? 'degraded' : 'healthy');

        res.json({
            counts: {
                nodes: nodes.length,
                pods: pods.length,
                deployments: deployments.length,
                services: services.length,
                configmaps: configmaps.length,
                secrets: secrets.length,
                helmreleases: helmreleases.length,
                zarfpackages: zarfpackages.length
            },
            podPhases,
            resources: {
                cpuUse, cpuCap, memUse, memCap,
                cpuPct: cpuCap > 0 ? Math.round((cpuUse / cpuCap) * 100) : 0,
                memPct: memCap > 0 ? Math.round((memUse / memCap) * 100) : 0
            },
            health: {
                overall,
                issueCount: issues.length,
                criticalCount,
                warningCount,
                nodes: { total: nodes.length, ready: nodesReady, notReady: nodes.length - nodesReady },
                pods: { total: pods.length, healthy: podHealth.healthy, unhealthy: podsUnhealthy },
                workloads: { total: deployments.length, healthy: deploymentsHealthy, degraded: deployments.length - deploymentsHealthy }
            },
            podHealth,
            issues: issues.slice(0, 100),
            recentWarnings
        });
    } catch (err) {
        logger.error(err, 'Error getting dashboard stats');
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
