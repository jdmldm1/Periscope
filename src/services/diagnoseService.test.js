const test = require('node:test');
const assert = require('node:assert/strict');

const k8sService = require('./k8sService');
const { stubMethods } = require('../testSupport/httpServer');
const { findTrueWorkloadOwner, diagnosePod, remediate } = require('./diagnoseService');

test('findTrueWorkloadOwner - returns null when no ownerReferences', async () => {
    const owner = await findTrueWorkloadOwner('default', { metadata: {} });
    assert.equal(owner, null);
});

test('findTrueWorkloadOwner - returns direct owner for non-ReplicaSet', async () => {
    const pod = {
        metadata: {
            ownerReferences: [{ kind: 'StatefulSet', name: 'my-stateful' }],
        },
    };
    const owner = await findTrueWorkloadOwner('default', pod);
    assert.deepEqual(owner, { kind: 'StatefulSet', name: 'my-stateful' });
});

test('findTrueWorkloadOwner - traverses ReplicaSet to Deployment owner', async () => {
    const pod = {
        metadata: {
            ownerReferences: [{ kind: 'ReplicaSet', name: 'my-rs-123' }],
        },
    };
    const restore = stubMethods(k8sService.apps, {
        readNamespacedReplicaSet: () =>
            Promise.resolve({
                metadata: {
                    ownerReferences: [{ kind: 'Deployment', name: 'my-deploy' }],
                },
            }),
    });
    try {
        const owner = await findTrueWorkloadOwner('default', pod);
        assert.deepEqual(owner, { kind: 'Deployment', name: 'my-deploy' });
    } finally {
        restore();
    }
});

test('diagnosePod - diagnoses a healthy pod', async () => {
    const pod = {
        metadata: { uid: 'uid-123', name: 'web-pod', namespace: 'default' },
        spec: { containers: [{ name: 'web' }] },
        status: {
            phase: 'Running',
            containerStatuses: [
                {
                    name: 'web',
                    ready: true,
                    state: { running: { startedAt: '2026-11-23T00:00:00Z' } },
                },
            ],
        },
    };
    const restoreCore = stubMethods(k8sService.core, {
        readNamespacedPod: () => Promise.resolve(pod),
        listNamespacedEvent: () => Promise.resolve({ items: [] }),
        readNamespacedPodLog: () => Promise.resolve('2026-11-23 server started\n'),
    });

    try {
        const result = await diagnosePod('default', 'web-pod');
        assert.equal(result.status, 'Healthy');
        assert.equal(result.summary, 'No issues detected. The pod is running normally.');
        assert.equal(result.logTail, '2026-11-23 server started\n');
        assert.ok(result.suggestedFixes.some((f) => f.title === 'Recreate Pod'));
    } finally {
        restoreCore();
    }
});

test('diagnosePod - detects CrashLoopBackOff and OOMKilled containers', async () => {
    const pod = {
        metadata: {
            uid: 'uid-oom',
            name: 'oom-pod',
            namespace: 'default',
            ownerReferences: [{ kind: 'Deployment', name: 'worker-deploy' }],
        },
        spec: { containers: [{ name: 'worker' }] },
        status: {
            phase: 'Running',
            containerStatuses: [
                {
                    name: 'worker',
                    ready: false,
                    state: {
                        waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m restarting failed container' },
                    },
                    lastState: {
                        terminated: { reason: 'OOMKilled', exitCode: 137 },
                    },
                },
            ],
        },
    };
    const restoreCore = stubMethods(k8sService.core, {
        readNamespacedPod: () => Promise.resolve(pod),
        listNamespacedEvent: () =>
            Promise.resolve({
                items: [
                    {
                        involvedObject: { uid: 'uid-oom' },
                        metadata: { creationTimestamp: '2026-11-23T00:00:00Z' },
                        type: 'Warning',
                        reason: 'BackOff',
                        message: 'Back-off restarting failed container',
                    },
                ],
            }),
        readNamespacedPodLog: () => Promise.resolve('FATAL: Out of memory\n'),
    });

    try {
        const result = await diagnosePod('default', 'oom-pod');
        assert.equal(result.status, 'Critical');
        assert.ok(result.details.some((d) => d.includes('CrashLoopBackOff')));
        assert.ok(result.details.some((d) => d.includes('OOMKilled')));
        assert.ok(result.suggestedFixes.some((f) => f.title.includes('Double Memory limits')));
        assert.ok(result.suggestedFixes.some((f) => f.title === 'Rollout Restart Workload'));
        assert.equal(result.events.length, 1);
    } finally {
        restoreCore();
    }
});

test('diagnosePod - detects Pending unschedulable pods', async () => {
    const pod = {
        metadata: { uid: 'uid-pending', name: 'pending-pod', namespace: 'default' },
        spec: { containers: [{ name: 'api' }] },
        status: {
            phase: 'Pending',
            conditions: [
                {
                    type: 'PodScheduled',
                    status: 'False',
                    reason: 'Unschedulable',
                    message: '0/3 nodes are available: 3 Insufficient cpu.',
                },
            ],
        },
    };
    const restoreCore = stubMethods(k8sService.core, {
        readNamespacedPod: () => Promise.resolve(pod),
        listNamespacedEvent: () => Promise.resolve({ items: [] }),
    });

    try {
        const result = await diagnosePod('default', 'pending-pod');
        assert.equal(result.status, 'Critical');
        assert.ok(result.details.some((d) => d.includes('Unschedulable')));
        assert.ok(result.summary.includes('Critical issues detected'));
    } finally {
        restoreCore();
    }
});

test('remediate - rejects invalid fixType', async () => {
    await assert.rejects(() => remediate('default', 'my-pod', 'unsupported-fix'), /Unsupported remediation action/);
});
