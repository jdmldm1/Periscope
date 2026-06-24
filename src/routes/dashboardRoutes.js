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
function classifyPod(p) {
    const phase = p.status?.phase;
    if (p.metadata?.deletionTimestamp) return 'terminating';
    if (phase === 'Succeeded') return 'healthy';
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

    const readyCond = (p.status?.conditions || []).find(c => c.type === 'Ready');
    if (readyCond && readyCond.status !== 'True') return 'notReady';

    return 'healthy';
}

function podRestarts(p) {
    return (p.status?.containerStatuses || []).reduce((sum, c) => sum + (c.restartCount || 0), 0);
}

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
    crashLooping: 'critical', imagePullError: 'critical', configError: 'critical',
    oomKilled: 'critical', failed: 'critical',
    pending: 'warning', notReady: 'warning', terminating: 'warning'
};

const STATUS_LABEL = {
    crashLooping: 'CrashLoopBackOff', imagePullError: 'Image Pull Error',
    configError: 'Container Config Error', oomKilled: 'OOMKilled', failed: 'Failed',
    pending: 'Pending / Unschedulable', notReady: 'Running (Not Ready)', terminating: 'Stuck Terminating'
};

// Resolve a workload "owner" for grouping pod issues. Pod ownerRefs point at the
// ReplicaSet/Job/etc, which is exactly the grouping we want (all replicas of one
// rollout collapse into a single issue instead of N near-identical rows).
function podOwner(p) {
    const ref = (p.metadata?.ownerReferences || [])[0];
    if (ref) return { kind: ref.kind, name: ref.name };
    return { kind: 'Pod', name: p.metadata?.name };
}

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
            k8sService.custom.listClusterCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'nodes' }).catch(() => ({ items: [] })),
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

        // ---- Pod health analysis (issues grouped by owning workload) ----
        const podHealth = {
            healthy: 0, crashLooping: 0, imagePullError: 0, configError: 0,
            oomKilled: 0, failed: 0, pending: 0, notReady: 0, terminating: 0, restarts: 0
        };

        const podIssueGroups = new Map();
        const addPodIssue = (p, severity, reason, message, restarts) => {
            const owner = podOwner(p);
            const namespace = p.metadata?.namespace || '';
            const key = `${namespace}|${owner.kind}/${owner.name}|${reason}`;
            const existing = podIssueGroups.get(key);
            if (existing) {
                existing.count += 1;
                existing.restarts = Math.max(existing.restarts, restarts);
                return;
            }
            podIssueGroups.set(key, {
                severity, kind: 'Pod', namespace,
                name: p.metadata?.name,        // representative pod (for drill-down)
                ownerKind: owner.kind, ownerName: owner.name,
                reason, message, restarts, count: 1
            });
        };

        pods.forEach(p => {
            const status = classifyPod(p);
            podHealth[status] = (podHealth[status] || 0) + 1;
            const restarts = podRestarts(p);
            podHealth.restarts += restarts;

            if (status !== 'healthy') {
                addPodIssue(p, STATUS_SEVERITY[status] || 'warning', STATUS_LABEL[status] || status, podIssueMessage(p, status), restarts);
            } else if (restarts >= RESTART_WARN_THRESHOLD) {
                addPodIssue(p, 'warning', 'High Restart Count', `Restarted ${restarts} times`, restarts);
            }
        });
        issues.push(...podIssueGroups.values());

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
                issues.push({ severity: 'critical', kind: 'Node', namespace: '', name, reason: 'NotReady', message: ready?.message || 'Node is not Ready', restarts: 0, count: 1 });
            }
            ['MemoryPressure', 'DiskPressure', 'PIDPressure'].forEach(type => {
                const c = conditions.find(cond => cond.type === type);
                if (c?.status === 'True') {
                    issues.push({ severity: 'warning', kind: 'Node', namespace: '', name, reason: type, message: c.message || `Node under ${type}`, restarts: 0, count: 1 });
                }
            });
            if (node.spec?.unschedulable) {
                issues.push({ severity: 'warning', kind: 'Node', namespace: '', name, reason: 'SchedulingDisabled', message: 'Node is cordoned (unschedulable)', restarts: 0, count: 1 });
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
                issues.push({ severity: ready === 0 ? 'critical' : 'warning', kind: 'Deployment', namespace: d.metadata?.namespace, name: d.metadata?.name, reason: 'Degraded', message: `${ready}/${desired} replicas ready`, restarts: 0, count: 1 });
            }
        });

        // ---- Recent warning events (last hour) ----
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const warningEvents = events
            .filter(e => e.type === 'Warning')
            .map(e => ({ ...e, _ts: new Date(e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp || 0).getTime() }))
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

        const sevRank = { critical: 0, warning: 1, info: 2 };
        issues.sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]) || (b.restarts - a.restarts));

        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

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
                nodes: nodes.length, pods: pods.length, deployments: deployments.length,
                services: services.length, configmaps: configmaps.length, secrets: secrets.length,
                helmreleases: helmreleases.length, zarfpackages: zarfpackages.length
            },
            podPhases,
            resources: {
                cpuUse, cpuCap, memUse, memCap,
                cpuPct: cpuCap > 0 ? Math.round((cpuUse / cpuCap) * 100) : 0,
                memPct: memCap > 0 ? Math.round((memUse / memCap) * 100) : 0
            },
            health: {
                overall, issueCount: issues.length, criticalCount, warningCount,
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

// ---------------------------------------------------------------------------
// Issue drill-down: gather the evidence a troubleshooter needs in one place —
// container states + exit codes, conditions, recent events, and crucially the
// PREVIOUS container logs (what was printed right before it crashed).
// ---------------------------------------------------------------------------
async function eventsForObject(namespace, name, clusterScoped) {
    try {
        const raw = clusterScoped
            ? await k8sService.core.listEventForAllNamespaces({ fieldSelector: `involvedObject.name=${name}` })
            : await k8sService.core.listNamespacedEvent({ namespace, fieldSelector: `involvedObject.name=${name}` });
        return getItems(raw)
            .map(e => ({
                type: e.type, reason: e.reason, message: (e.message || '').slice(0, 300),
                count: e.count || 1,
                timestamp: e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp
            }))
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
            .slice(0, 25);
    } catch (e) {
        logger.warn({ error: e.message, name }, 'Could not list events for object');
        return [];
    }
}

async function readPodLog(namespace, name, container, previous) {
    try {
        const resp = await k8sService.core.readNamespacedPodLog({
            name, namespace, container, tailLines: 150, previous: !!previous
        });
        return resp.body || resp || '';
    } catch (e) {
        return null; // caller decides on fallback
    }
}

router.get('/issue-detail', async (req, res) => {
    const { kind, namespace, name } = req.query;
    if (!kind || !name) return res.status(400).json({ error: 'kind and name are required' });

    try {
        if (kind === 'Node') {
            const nodeRaw = await k8sService.core.readNode({ name });
            const node = nodeRaw.body || nodeRaw;
            return res.json({
                kind: 'Node', name,
                conditions: (node.status?.conditions || []).map(c => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })),
                taints: (node.spec?.taints || []).map(t => `${t.key}=${t.value || ''}:${t.effect}`),
                unschedulable: !!node.spec?.unschedulable,
                capacity: node.status?.capacity || {},
                allocatable: node.status?.allocatable || {},
                events: await eventsForObject('', name, true)
            });
        }

        if (kind === 'Deployment') {
            const depRaw = await k8sService.apps.readNamespacedDeployment({ name, namespace });
            const dep = depRaw.body || depRaw;
            const selector = dep.spec?.selector?.matchLabels || {};
            const labelSelector = Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(',');
            let childPods = [];
            try {
                const podsRaw = await k8sService.core.listNamespacedPod({ namespace, labelSelector });
                childPods = getItems(podsRaw).map(p => ({
                    name: p.metadata?.name,
                    phase: p.status?.phase,
                    status: classifyPod(p),
                    restarts: podRestarts(p)
                }));
            } catch (e) { /* selector may be empty */ }
            return res.json({
                kind: 'Deployment', namespace, name,
                replicas: {
                    desired: dep.spec?.replicas ?? 0,
                    ready: dep.status?.readyReplicas ?? 0,
                    available: dep.status?.availableReplicas ?? 0,
                    updated: dep.status?.updatedReplicas ?? 0
                },
                conditions: (dep.status?.conditions || []).map(c => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })),
                pods: childPods,
                events: await eventsForObject(namespace, name, false)
            });
        }

        // Default: Pod
        const podRaw = await k8sService.core.readNamespacedPod({ name, namespace });
        const pod = podRaw.body || podRaw;
        const allStatuses = [
            ...(pod.status?.initContainerStatuses || []).map(c => ({ ...c, _init: true })),
            ...(pod.status?.containerStatuses || [])
        ];

        const containers = allStatuses.map(cs => {
            const stateKey = cs.state?.waiting ? 'waiting' : cs.state?.terminated ? 'terminated' : cs.state?.running ? 'running' : 'unknown';
            const lt = cs.lastState?.terminated;
            return {
                name: cs.name, init: !!cs._init, ready: !!cs.ready, restartCount: cs.restartCount || 0,
                state: stateKey,
                waitingReason: cs.state?.waiting?.reason || null,
                waitingMessage: cs.state?.waiting?.message || null,
                lastTerminated: lt ? { reason: lt.reason, exitCode: lt.exitCode, finishedAt: lt.finishedAt } : null
            };
        });

        // Pick the most relevant container to pull logs from.
        const failing = allStatuses.find(cs => cs.state?.waiting || (cs.state?.terminated && cs.state.terminated.exitCode !== 0) || cs.lastState?.terminated)
            || allStatuses[0]
            || { name: pod.spec?.containers?.[0]?.name };
        const targetContainer = failing?.name;

        let logs = null;
        if (targetContainer) {
            // Previous logs first — for a crashlooping container the current
            // instance is usually empty, but the previous one shows the crash.
            const hadRestart = (failing.restartCount || 0) > 0 || !!failing.lastState?.terminated;
            let text = hadRestart ? await readPodLog(namespace, name, targetContainer, true) : null;
            let previous = text != null;
            if (text == null) text = await readPodLog(namespace, name, targetContainer, false);
            logs = { container: targetContainer, previous, text: (text || '').slice(-20000), available: text != null };
        }

        return res.json({
            kind: 'Pod', namespace, name,
            phase: pod.status?.phase,
            classification: classifyPod(pod),
            reason: pod.status?.reason || null,
            message: pod.status?.message || null,
            node: pod.spec?.nodeName || null,
            conditions: (pod.status?.conditions || []).map(c => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })),
            containers,
            logs,
            events: await eventsForObject(namespace, name, false)
        });
    } catch (err) {
        logger.error({ error: err.message, kind, name }, 'Error getting issue detail');
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// Integration readiness: the things that actually block a new workload from
// coming up — quota limits, missing resource requests, image-pull failures,
// and workloads already pushing past their memory request.
// ---------------------------------------------------------------------------
function registryOf(image) {
    if (!image) return 'docker.io';
    const first = image.split('/')[0];
    return (first.includes('.') || first.includes(':')) ? first : 'docker.io';
}

router.get('/integration', async (req, res) => {
    const ns = req.query.namespace;
    const scoped = ns && ns !== 'all';
    try {
        const [podsRaw, quotasRaw, limitRangesRaw, podMetricsRaw] = await Promise.all([
            scoped ? k8sService.core.listNamespacedPod({ namespace: ns }) : k8sService.core.listPodForAllNamespaces(),
            (scoped ? k8sService.core.listNamespacedResourceQuota({ namespace: ns }) : k8sService.core.listResourceQuotaForAllNamespaces()).catch(() => ({ items: [] })),
            (scoped ? k8sService.core.listNamespacedLimitRange({ namespace: ns }) : k8sService.core.listLimitRangeForAllNamespaces()).catch(() => ({ items: [] })),
            k8sService.custom.listClusterCustomObject({ group: 'metrics.k8s.io', version: 'v1beta1', plural: 'pods' }).catch(() => ({ items: [] }))
        ]);

        const pods = getItems(podsRaw);
        const quotasItems = getItems(quotasRaw);
        const limitRangeItems = getItems(limitRangesRaw);
        const podMetrics = getItems(podMetricsRaw);

        // Resource quotas with utilization
        const quotas = quotasItems.map(q => {
            const hard = q.status?.hard || q.spec?.hard || {};
            const used = q.status?.used || {};
            const entries = Object.keys(hard).map(k => ({ resource: k, used: used[k] || '0', hard: hard[k] }));
            return { namespace: q.metadata?.namespace, name: q.metadata?.name, entries };
        });

        // Image pull failures grouped by image
        const imagePullMap = new Map();
        pods.forEach(p => {
            (p.status?.containerStatuses || []).forEach(cs => {
                const r = cs.state?.waiting?.reason;
                if (IMAGE_PULL_REASONS.includes(r)) {
                    const image = cs.image || '(unknown image)';
                    const ex = imagePullMap.get(image) || { image, registry: registryOf(image), reason: r, count: 0, examplePod: `${p.metadata?.namespace}/${p.metadata?.name}` };
                    ex.count += 1;
                    imagePullMap.set(image, ex);
                }
            });
        });
        const imagePullIssues = [...imagePullMap.values()].sort((a, b) => b.count - a.count).slice(0, 20);

        // Pods whose containers declare no resource requests (scheduling/QoS risk),
        // grouped by owning workload.
        const missingReqMap = new Map();
        pods.forEach(p => {
            if (p.status?.phase === 'Succeeded') return;
            const containers = p.spec?.containers || [];
            const missing = containers.some(c => {
                const reqs = c.resources?.requests || {};
                return !reqs.cpu || !reqs.memory;
            });
            if (missing) {
                const owner = podOwner(p);
                const key = `${p.metadata?.namespace}|${owner.kind}/${owner.name}`;
                const ex = missingReqMap.get(key) || { namespace: p.metadata?.namespace, owner: `${owner.kind}/${owner.name}`, count: 0 };
                ex.count += 1;
                missingReqMap.set(key, ex);
            }
        });
        const missingRequests = [...missingReqMap.values()].sort((a, b) => b.count - a.count).slice(0, 20);

        // Workloads using more memory than they request (no headroom -> OOM risk)
        const usageByPod = new Map();
        podMetrics.forEach(pm => {
            const key = `${pm.metadata?.namespace}/${pm.metadata?.name}`;
            const mem = (pm.containers || []).reduce((s, c) => s + parseMem(c.usage?.memory), 0);
            usageByPod.set(key, mem);
        });
        const overMem = [];
        pods.forEach(p => {
            if (p.status?.phase !== 'Running') return;
            const key = `${p.metadata?.namespace}/${p.metadata?.name}`;
            const usage = usageByPod.get(key);
            if (!usage) return;
            const reqMem = (p.spec?.containers || []).reduce((s, c) => s + parseMem(c.resources?.requests?.memory), 0);
            if (reqMem > 0 && usage > reqMem) {
                overMem.push({
                    namespace: p.metadata?.namespace, name: p.metadata?.name,
                    usageMiB: Math.round(usage / 1024), requestMiB: Math.round(reqMem / 1024),
                    ratio: +(usage / reqMem).toFixed(2)
                });
            }
        });
        overMem.sort((a, b) => b.ratio - a.ratio);

        res.json({
            metricsAvailable: podMetrics.length > 0,
            quotas,
            limitRangeNamespaces: [...new Set(limitRangeItems.map(l => l.metadata?.namespace))],
            imagePullIssues,
            missingRequests,
            overMemory: overMem.slice(0, 15)
        });
    } catch (err) {
        logger.error(err, 'Error getting integration readiness');
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
