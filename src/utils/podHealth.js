// Pure pod-health analysis used by the dashboard. These functions take raw
// Kubernetes pod objects and answer "is this pod healthy, and if not, why?"
// without touching the cluster or HTTP — which keeps them easy to reason about
// and unit-test.

// Container "waiting" reasons that indicate a hard failure rather than a
// transient startup state.
const IMAGE_PULL_REASONS = ['ImagePullBackOff', 'ErrImagePull', 'ErrImageNeverPull', 'InvalidImageName'];
const CONFIG_ERROR_REASONS = ['CreateContainerConfigError', 'CreateContainerError', 'RunContainerError', 'StartError'];

// A healthy pod that has restarted this many times is still surfaced as a
// warning so churn doesn't hide behind a green status.
const RESTART_WARN_THRESHOLD = 5;

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

// Resolve a workload "owner" for grouping pod issues. Pod ownerRefs point at the
// ReplicaSet/Job/etc, which is exactly the grouping we want (all replicas of one
// rollout collapse into a single issue instead of N near-identical rows).
function podOwner(p) {
    const ref = (p.metadata?.ownerReferences || [])[0];
    if (ref) return { kind: ref.kind, name: ref.name };
    return { kind: 'Pod', name: p.metadata?.name };
}

module.exports = {
    IMAGE_PULL_REASONS,
    CONFIG_ERROR_REASONS,
    RESTART_WARN_THRESHOLD,
    STATUS_SEVERITY,
    STATUS_LABEL,
    classifyPod,
    podRestarts,
    podIssueMessage,
    podOwner,
};
