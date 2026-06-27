const k8sService = require('./k8sService');
const helmService = require('./helmService');
const zarfService = require('./zarfService');
const logger = require('../utils/logger');
const { parseCpu, parseMem, getItems } = require('../utils/k8sHelpers');
const {
    IMAGE_PULL_REASONS,
    RESTART_WARN_THRESHOLD,
    STATUS_SEVERITY,
    STATUS_LABEL,
    classifyPod,
    podRestarts,
    podIssueMessage,
    podOwner,
} = require('../utils/podHealth');

// Aggregates cluster state into the shapes the dashboard renders. Each function
// fetches what it needs in parallel and returns a plain data object; the route
// layer is responsible only for query parsing and HTTP responses.

// ---------------------------------------------------------------------------
// /stats — cluster-wide health overview: counts, pod/node/workload health, a
// rolled-up health score, recent warnings, and recent deployments.
// ---------------------------------------------------------------------------
async function getStats(ns) {
    const scoped = ns && ns !== 'all';

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

    const allPodsRunning = pods.length === (podHealth.healthy || 0);
    const overall = criticalCount > 0 ? 'critical' : (warningCount > 0 && !allPodsRunning ? 'degraded' : 'healthy');

    const score = computeHealthScore({ nodes, nodesReady, deployments, deploymentsHealthy, podHealth });

    const recentDeployments = collectRecentDeployments(helmreleases, zarfpackages);

    return {
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
            overall, score, issueCount: issues.length, criticalCount, warningCount,
            nodes: { total: nodes.length, ready: nodesReady, notReady: nodes.length - nodesReady },
            pods: { total: pods.length, healthy: podHealth.healthy, unhealthy: podsUnhealthy },
            workloads: { total: deployments.length, healthy: deploymentsHealthy, degraded: deployments.length - deploymentsHealthy }
        },
        podHealth,
        issues: issues.slice(0, 100),
        recentWarnings,
        recentDeployments
    };
}

// Cluster Health Score (0 - 100), penalizing critical/warning pods, not-ready
// and pressured nodes, and degraded deployments.
function computeHealthScore({ nodes, nodesReady, deployments, deploymentsHealthy, podHealth }) {
    let score = 100;

    // 1. Pod health deductions
    const criticalPodsCount = (podHealth.crashLooping || 0) + (podHealth.imagePullError || 0) + (podHealth.configError || 0) + (podHealth.oomKilled || 0) + (podHealth.failed || 0);
    const warningPodsCount = (podHealth.pending || 0) + (podHealth.notReady || 0) + (podHealth.terminating || 0);
    score -= (criticalPodsCount * 6);
    score -= (warningPodsCount * 3);

    // 2. Node health deductions
    const nodesNotReadyCount = nodes.length - nodesReady;
    score -= (nodesNotReadyCount * 15);

    let nodePressureCount = 0;
    nodes.forEach(node => {
        const conditions = node.status?.conditions || [];
        ['MemoryPressure', 'DiskPressure', 'PIDPressure'].forEach(type => {
            const c = conditions.find(cond => cond.type === type);
            if (c?.status === 'True') nodePressureCount++;
        });
    });
    score -= (nodePressureCount * 4);

    // 3. Workload (Deployment) health deductions
    const degradedDeploymentsCount = deployments.length - deploymentsHealthy;
    score -= (degradedDeploymentsCount * 5);

    return Math.max(0, Math.min(100, score));
}

// Merge Helm releases and Zarf packages into one recency-sorted feed. Timestamps
// arrive in mixed formats (Helm appends a timezone abbreviation Date.parse can
// choke on), so strip a trailing TZ before parsing and fall back to the raw value.
function collectRecentDeployments(helmreleases, zarfpackages) {
    const recentDeployments = [];

    (helmreleases || []).forEach(r => {
        recentDeployments.push({
            type: 'helm',
            name: r.name,
            namespace: r.namespace,
            version: r.chart || r.app_version || '',
            status: r.status?.phase || r.status || 'deployed',
            timestamp: r.updated || r.metadata?.creationTimestamp || ''
        });
    });

    (zarfpackages || []).forEach(p => {
        recentDeployments.push({
            type: 'zarf',
            name: p.package || p.name,
            namespace: 'zarf',
            version: p.version || '',
            status: p.status?.phase || 'deployed',
            timestamp: p.timestamp || p.metadata?.creationTimestamp || ''
        });
    });

    recentDeployments.forEach(d => {
        let ts = 0;
        if (d.timestamp) {
            let cleanTs = d.timestamp.replace(/\s+[A-Z]{3,4}$/, '');
            ts = Date.parse(cleanTs);
            if (isNaN(ts)) {
                ts = Date.parse(d.timestamp);
            }
        }
        d._ts = isNaN(ts) ? 0 : ts;
    });
    recentDeployments.sort((a, b) => b._ts - a._ts);
    return recentDeployments.slice(0, 8);
}

// ---------------------------------------------------------------------------
// /issue-detail — gather the evidence a troubleshooter needs in one place:
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

async function getNodeIssueDetail(name) {
    const nodeRaw = await k8sService.core.readNode({ name });
    const node = nodeRaw.body || nodeRaw;
    return {
        kind: 'Node', name,
        conditions: (node.status?.conditions || []).map(c => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })),
        taints: (node.spec?.taints || []).map(t => `${t.key}=${t.value || ''}:${t.effect}`),
        unschedulable: !!node.spec?.unschedulable,
        capacity: node.status?.capacity || {},
        allocatable: node.status?.allocatable || {},
        events: await eventsForObject('', name, true)
    };
}

async function getDeploymentIssueDetail(namespace, name) {
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
    return {
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
    };
}

async function getPodIssueDetail(namespace, name) {
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

    return {
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
    };
}

function getIssueDetail({ kind, namespace, name }) {
    if (kind === 'Node') return getNodeIssueDetail(name);
    if (kind === 'Deployment') return getDeploymentIssueDetail(namespace, name);
    return getPodIssueDetail(namespace, name);
}

// ---------------------------------------------------------------------------
// /integration — the things that actually block a new workload from coming up:
// quota limits, image-pull failures, restarting/unschedulable pods, and
// workloads already pushing past their memory request.
// ---------------------------------------------------------------------------
function registryOf(image) {
    if (!image) return 'docker.io';
    const first = image.split('/')[0];
    return (first.includes('.') || first.includes(':')) ? first : 'docker.io';
}

async function getIntegrationReadiness(ns) {
    const scoped = ns && ns !== 'all';

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

    // Pods with container restarts (restarting workloads/pods)
    const restartList = [];
    const unschedulable = [];
    pods.forEach(p => {
        if (p.status?.phase === 'Succeeded') return;

        // Check for restarts
        const rCount = podRestarts(p);
        if (rCount > 0) {
            const isOOMKilled = (p.status?.containerStatuses || []).some(cs =>
                cs.state?.terminated?.reason === 'OOMKilled' ||
                cs.lastState?.terminated?.reason === 'OOMKilled'
            );
            restartList.push({
                namespace: p.metadata?.namespace,
                name: p.metadata?.name,
                restarts: rCount,
                isOOMKilled
            });
        }

        // Check for scheduling issues
        if (p.status?.phase === 'Pending') {
            const schedCond = (p.status?.conditions || []).find(c => c.type === 'PodScheduled');
            if (schedCond && schedCond.status === 'False' && (schedCond.reason === 'Unschedulable' || schedCond.message?.includes('Insufficient') || schedCond.message?.includes('fit'))) {
                unschedulable.push({
                    namespace: p.metadata?.namespace,
                    name: p.metadata?.name,
                    reason: schedCond.reason || 'Unschedulable',
                    message: schedCond.message || 'Pod could not be scheduled'
                });
            }
        }
    });
    const podRestartsData = restartList.sort((a, b) => b.restarts - a.restarts).slice(0, 20);
    const unschedulableData = unschedulable.slice(0, 20);

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

    return {
        metricsAvailable: podMetrics.length > 0,
        quotas,
        limitRangeNamespaces: [...new Set(limitRangeItems.map(l => l.metadata?.namespace))],
        imagePullIssues,
        podRestarts: podRestartsData,
        unschedulable: unschedulableData,
        overMemory: overMem.slice(0, 15)
    };
}

module.exports = {
    getStats,
    getIssueDetail,
    getIntegrationReadiness,
};
