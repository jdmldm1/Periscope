const os = require('os');
const fs = require('fs');
const path = require('path');
const { run } = require('../utils/exec');
const k8sService = require('./k8sService');
const logger = require('../utils/logger');
const { assertKind, assertName } = require('../utils/validators');

// Pod diagnosis ("why is this pod unhealthy?") and the automated remediations
// the dashboard offers in response. Kept out of the route layer because it's the
// densest logic in the kube API surface.

const WORKLOAD_KINDS = ['Deployment', 'StatefulSet', 'DaemonSet'];

// Errors carrying a statusCode are mapped to that HTTP status by the route.
function httpError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

// Walk a pod's ownerReferences up to the real workload. Pod -> ReplicaSet is an
// implementation detail, so when the immediate owner is a ReplicaSet we resolve
// one more level to its Deployment.
async function findTrueWorkloadOwner(namespace, pod) {
    const ownerReferences = pod.metadata?.ownerReferences || [];
    if (ownerReferences.length === 0) {
        return null;
    }
    const primaryOwner = ownerReferences[0];
    const { kind, name } = primaryOwner;

    if (kind === 'ReplicaSet') {
        try {
            const rs = await k8sService.apps.readNamespacedReplicaSet({ name, namespace });
            const rsBody = rs.body || rs;
            const rsOwner = (rsBody.metadata?.ownerReferences || [])[0];
            if (rsOwner) {
                return { kind: rsOwner.kind, name: rsOwner.name };
            }
        } catch (err) {
            logger.error({ name, namespace, error: err.message }, 'Failed to resolve ReplicaSet parent');
        }
    }
    return { kind, name };
}

// Pick the container whose logs are most likely to explain a failure: a waiting
// or non-zero-exit container if there is one, else the first container.
function pickTargetContainer(pod) {
    if (pod.status?.containerStatuses) {
        const failing = pod.status.containerStatuses.find(cs => cs.state?.waiting || (cs.state?.terminated && cs.state.terminated.exitCode !== 0));
        if (failing) return failing.name;
    }
    if (pod.spec?.containers?.length > 0) return pod.spec.containers[0].name;
    return null;
}

// Inspect each container's state and append human-readable findings, mutating
// diagnosis.status/details. Returns whether any issue was found.
function analyzeContainers(containerStatuses, diagnosis) {
    let hasIssue = false;
    let oomKilledContainer = null;
    let pullFailureContainer = null;

    containerStatuses.forEach(cs => {
        const name = cs.name;
        const state = cs.state || {};
        const lastState = cs.lastState || {};

        if (state.waiting) {
            hasIssue = true;
            const reason = state.waiting.reason;
            const message = state.waiting.message || '';

            if (reason === 'CrashLoopBackOff') {
                diagnosis.status = 'Critical';
                const exitCode = lastState.terminated?.exitCode;
                const termReason = lastState.terminated?.reason;
                let detail = `Container '${name}' is in CrashLoopBackOff.`;
                if (exitCode !== undefined) {
                    detail += ` It terminated with exit code ${exitCode} (${termReason || 'unknown reason'}).`;
                }
                if (exitCode === 137 || termReason === 'OOMKilled') {
                    detail += ` Root cause: Out Of Memory (OOMKilled). The container exceeded its memory limit.`;
                    oomKilledContainer = name;
                } else if (exitCode === 1) {
                    detail += ` This usually indicates an application crash or misconfiguration.`;
                } else if (exitCode === 127) {
                    detail += ` Command or entrypoint binary not found.`;
                }
                diagnosis.details.push(detail);
            } else if (reason === 'ErrImagePull' || reason === 'ImagePullBackOff') {
                diagnosis.status = 'Critical';
                diagnosis.details.push(`Container '${name}' failed to pull image. Reason: ${reason}. Check if the image reference is correct, the registry exists, and credentials are correct.`);
                pullFailureContainer = name;
            } else if (reason === 'CreateContainerConfigError' || reason === 'CreateContainerError') {
                diagnosis.status = 'Critical';
                diagnosis.details.push(`Container '${name}' failed to create. Reason: ${reason}. This is often caused by a missing ConfigMap, Secret, or invalid command arguments.`);
            } else {
                diagnosis.status = 'Warning';
                diagnosis.details.push(`Container '${name}' is waiting. Reason: ${reason}. Message: ${message}`);
            }
        }

        if (state.terminated && state.terminated.exitCode !== 0) {
            hasIssue = true;
            const term = state.terminated;
            let detail = `Container '${name}' terminated with non-zero exit code ${term.exitCode}. Reason: ${term.reason}.`;
            if (term.reason === 'OOMKilled') {
                diagnosis.status = 'Critical';
                detail += ` The container was terminated because it ran out of memory. Try increasing the memory limits in the deployment spec.`;
                oomKilledContainer = name;
            } else {
                if (diagnosis.status !== 'Critical') diagnosis.status = 'Warning';
            }
            diagnosis.details.push(detail);
        }
    });

    return { hasIssue, oomKilledContainer, pullFailureContainer };
}

async function diagnosePod(namespace, podName) {
    const podRes = await k8sService.core.readNamespacedPod({ name: podName, namespace });
    const pod = podRes.body || podRes;
    const eventsResponse = await k8sService.core.listNamespacedEvent({ namespace });
    const allEvents = eventsResponse.items || eventsResponse.body?.items || [];
    const events = allEvents.filter(e => e.involvedObject && e.involvedObject.uid === pod.metadata.uid);

    const targetContainer = pickTargetContainer(pod);

    let logTail = '';
    if (targetContainer) {
        try {
            const logRes = await k8sService.core.readNamespacedPodLog({
                name: podName,
                namespace,
                container: targetContainer,
                tailLines: 50
            });
            logTail = logRes.body || logRes;
        } catch (logErr) {
            logTail = `Could not fetch logs for container ${targetContainer}: ${logErr.message}`;
        }
    } else {
        logTail = 'No containers found in pod spec.';
    }

    const diagnosis = {
        status: 'Healthy',
        summary: 'No issues detected. The pod is running normally.',
        details: [],
        suggestedFixes: [],
        events: events.map(e => ({
            type: e.type,
            reason: e.reason,
            message: e.message,
            firstTimestamp: e.firstTimestamp || e.metadata.creationTimestamp,
            count: e.count
        })),
        logTail
    };

    const containerStatuses = [
        ...(pod.status?.containerStatuses || []),
        ...(pod.status?.initContainerStatuses || [])
    ];

    let ownerWorkload = null;
    try {
        ownerWorkload = await findTrueWorkloadOwner(namespace, pod);
    } catch (e) {
        logger.error(e, 'Error resolving workload owner in diagnose');
    }

    let { hasIssue, oomKilledContainer } = analyzeContainers(containerStatuses, diagnosis);

    if (pod.status?.phase === 'Pending') {
        hasIssue = true;
        diagnosis.status = 'Critical';
        let unschedulable = false;
        (pod.status.conditions || []).forEach(cond => {
            if (cond.type === 'PodScheduled' && cond.status === 'False' && cond.reason === 'Unschedulable') {
                unschedulable = true;
                diagnosis.details.push(`Pod scheduling failed. Reason: Unschedulable. Message: ${cond.message || 'No resources available.'}`);
            }
        });
        if (!unschedulable) {
            diagnosis.details.push(`Pod is pending. Current conditions: ${(pod.status.conditions || []).map(c => `${c.type}=${c.status}`).join(', ')}`);
        }
    }

    const warnings = events.filter(e => e.type === 'Warning');
    warnings.forEach(w => {
        if (w.reason === 'Unhealthy') {
            hasIssue = true;
            if (diagnosis.status !== 'Critical') diagnosis.status = 'Warning';
            diagnosis.details.push(`Probe failure: ${w.message} (Reason: ${w.reason}, Count: ${w.count})`);
        } else if (w.reason === 'FailedScheduling') {
            hasIssue = true;
            diagnosis.status = 'Critical';
            diagnosis.details.push(`Scheduling issue: ${w.message}`);
        } else if (w.reason === 'FailedMount') {
            hasIssue = true;
            diagnosis.status = 'Critical';
            diagnosis.details.push(`Volume mount failure: ${w.message}`);
        }
    });

    if (hasIssue) {
        if (diagnosis.status === 'Critical') {
            diagnosis.summary = `Critical issues detected in pod '${podName}'. Actions are required to restore service.`;
        } else {
            diagnosis.summary = `Warnings detected in pod '${podName}'. The resource may be unstable or misconfigured.`;
        }
    }

    // Build dynamically suggested fixes
    if (oomKilledContainer && ownerWorkload && WORKLOAD_KINDS.includes(ownerWorkload.kind)) {
        diagnosis.suggestedFixes.push({
            type: 'ScaleResources',
            title: `Double Memory limits for '${oomKilledContainer}'`,
            description: `Automatically scale resources for container '${oomKilledContainer}' in the parent ${ownerWorkload.kind} '${ownerWorkload.name}' by doubling its memory limits/requests.`,
            params: {
                containerName: oomKilledContainer,
                workloadKind: ownerWorkload.kind,
                workloadName: ownerWorkload.name
            }
        });
    }

    if (ownerWorkload && WORKLOAD_KINDS.includes(ownerWorkload.kind)) {
        diagnosis.suggestedFixes.push({
            type: 'RolloutRestart',
            title: `Rollout Restart Workload`,
            description: `Trigger a rollout restart on parent ${ownerWorkload.kind} '${ownerWorkload.name}' to clean up failed containers or re-pull images.`,
            params: {
                workloadKind: ownerWorkload.kind,
                workloadName: ownerWorkload.name
            }
        });
    }

    // Secondary fallback is always to recreate the pod directly
    diagnosis.suggestedFixes.push({
        type: 'RecreatePod',
        title: 'Recreate Pod',
        description: `Forcefully delete pod '${podName}' and let the controller spin up a clean replica.`,
        params: {}
    });

    return diagnosis;
}

// workloadKind / workloadName / containerName come from the request body, so
// validate them as strict Kubernetes identifiers before they reach kubectl
// (argv-based; no shell interpolation either way).
function validateWorkload(kind, wname, container) {
    assertKind(kind, 'workloadKind');
    assertName(wname, 'workloadName');
    if (container !== undefined) assertName(container, 'containerName');
}

async function remediateRolloutRestart(namespace, params) {
    const { workloadKind, workloadName } = params;
    if (!workloadKind || !workloadName) {
        throw httpError(400, 'workloadKind and workloadName are required for RolloutRestart');
    }
    validateWorkload(workloadKind, workloadName);
    await run('kubectl', ['rollout', 'restart', `${workloadKind.toLowerCase()}/${workloadName}`, '-n', namespace]);
    k8sService.clearCache(workloadKind.toLowerCase() + 's', namespace);
    k8sService.clearCache('pods', namespace);
    return { message: `Rollout restart triggered for ${workloadKind} '${workloadName}'.` };
}

async function remediateScaleResources(namespace, name, params) {
    const { workloadKind, workloadName, containerName } = params;
    if (!workloadKind || !workloadName || !containerName) {
        throw httpError(400, 'workloadKind, workloadName, and containerName are required for ScaleResources');
    }
    validateWorkload(workloadKind, workloadName, containerName);

    // 1. Get current resources of the workload
    const { stdout } = await run('kubectl', ['get', workloadKind.toLowerCase(), workloadName, '-n', namespace, '-o', 'json']);
    const workload = JSON.parse(stdout);

    // 2. Find container and double its memory request/limit
    const containers = workload.spec?.template?.spec?.containers || [];
    const container = containers.find(c => c.name === containerName);
    if (!container) {
        throw httpError(404, `Container '${containerName}' not found in workload`);
    }

    const resources = container.resources || {};
    const requests = resources.requests || {};
    const limits = resources.limits || {};

    const doubleMemory = (memStr, defaultVal) => {
        if (!memStr) return defaultVal;
        const val = parseFloat(memStr);
        const unit = memStr.replace(/[0-9.]/g, '');
        return `${Math.ceil(val * 2)}${unit || 'Mi'}`;
    };

    const newMemRequest = doubleMemory(requests.memory, '256Mi');
    const newMemLimit = doubleMemory(limits.memory, '512Mi');

    const patchObj = {
        spec: { template: { spec: { containers: [{
            name: containerName,
            resources: {
                requests: { ...requests, memory: newMemRequest },
                limits: { ...limits, memory: newMemLimit }
            }
        }] } } }
    };

    // kubectl patch reads the patch from a temp file so the JSON never touches a
    // shell; clean it up regardless of outcome.
    const tempFilePath = path.join(os.tmpdir(), `patch-${name}-${Date.now()}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(patchObj), 'utf8');
    try {
        await run('kubectl', ['patch', workloadKind.toLowerCase(), workloadName, '-n', namespace, '--type=merge', '--patch-file', tempFilePath]);
    } finally {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }

    k8sService.clearCache(workloadKind.toLowerCase() + 's', namespace);
    k8sService.clearCache('pods', namespace);

    return { message: `Successfully doubled memory for container '${containerName}' in ${workloadKind} '${workloadName}' (Request: ${newMemRequest}, Limit: ${newMemLimit}).` };
}

// Apply one of the suggested fixes from diagnosePod. Throws httpError for invalid
// input (mapped to 4xx by the route); anything else surfaces as a 500.
async function remediate(namespace, name, type, params = {}) {
    if (type === 'RecreatePod') {
        await run('kubectl', ['delete', 'pod', name, '-n', namespace]);
        k8sService.clearCache('pods', namespace);
        return { message: `Pod '${name}' deleted and will be recreated.` };
    }
    if (type === 'RolloutRestart') {
        return remediateRolloutRestart(namespace, params);
    }
    if (type === 'ScaleResources') {
        return remediateScaleResources(namespace, name, params);
    }
    throw httpError(400, `Unsupported remediation action: ${type}`);
}

module.exports = {
    findTrueWorkloadOwner,
    diagnosePod,
    remediate,
};
