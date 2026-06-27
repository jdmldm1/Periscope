const test = require('node:test');
const assert = require('node:assert');

const { classifyPod, podRestarts, podOwner, podIssueMessage } = require('./podHealth');

// Small builder so each test only spells out the fields it cares about.
const pod = (status = {}, metadata = {}, spec = {}) => ({ metadata, spec, status });
const waiting = (reason, message) => ({ state: { waiting: { reason, message } } });
const terminated = (reason, exitCode = 0) => ({ lastState: { terminated: { reason, exitCode } } });

test('classifyPod - deletionTimestamp wins over phase', () => {
    assert.strictEqual(classifyPod(pod({ phase: 'Running' }, { deletionTimestamp: '2026-01-01T00:00:00Z' })), 'terminating');
});

test('classifyPod - Succeeded and Failed phases', () => {
    assert.strictEqual(classifyPod(pod({ phase: 'Succeeded' })), 'healthy');
    assert.strictEqual(classifyPod(pod({ phase: 'Failed' })), 'failed');
});

test('classifyPod - container waiting reasons map to statuses', () => {
    assert.strictEqual(classifyPod(pod({ containerStatuses: [waiting('CrashLoopBackOff')] })), 'crashLooping');
    assert.strictEqual(classifyPod(pod({ containerStatuses: [waiting('ImagePullBackOff')] })), 'imagePullError');
    assert.strictEqual(classifyPod(pod({ containerStatuses: [waiting('ErrImagePull')] })), 'imagePullError');
    assert.strictEqual(classifyPod(pod({ containerStatuses: [waiting('CreateContainerConfigError')] })), 'configError');
});

test('classifyPod - init container waiting reasons are also inspected', () => {
    assert.strictEqual(classifyPod(pod({ initContainerStatuses: [waiting('CrashLoopBackOff')] })), 'crashLooping');
});

test('classifyPod - OOMKilled detected from lastState', () => {
    assert.strictEqual(classifyPod(pod({ containerStatuses: [terminated('OOMKilled', 137)] })), 'oomKilled');
});

test('classifyPod - crash-loop takes priority over OOM lastState', () => {
    // A container both waiting in CrashLoopBackOff and previously OOMKilled is
    // surfaced as crashLooping (the waiting-reason scan runs first).
    const p = pod({ containerStatuses: [{ ...waiting('CrashLoopBackOff'), ...terminated('OOMKilled', 137) }] });
    assert.strictEqual(classifyPod(p), 'crashLooping');
});

test('classifyPod - Pending and notReady', () => {
    assert.strictEqual(classifyPod(pod({ phase: 'Pending' })), 'pending');
    assert.strictEqual(classifyPod(pod({ phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }] })), 'notReady');
});

test('classifyPod - healthy when Running and Ready', () => {
    assert.strictEqual(classifyPod(pod({ phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] })), 'healthy');
    assert.strictEqual(classifyPod(pod({ phase: 'Running' })), 'healthy');
});

test('classifyPod - transient waiting reasons are not failures', () => {
    // ContainerCreating etc. are normal startup states and must not be flagged.
    assert.strictEqual(classifyPod(pod({ phase: 'Pending', containerStatuses: [waiting('ContainerCreating')] })), 'pending');
});

test('podRestarts - sums restartCount across containers', () => {
    assert.strictEqual(podRestarts(pod({ containerStatuses: [{ restartCount: 2 }, { restartCount: 3 }] })), 5);
    assert.strictEqual(podRestarts(pod({})), 0);
});

test('podOwner - uses first ownerReference, falls back to the pod itself', () => {
    assert.deepStrictEqual(
        podOwner(pod({}, { ownerReferences: [{ kind: 'ReplicaSet', name: 'web-abc' }] })),
        { kind: 'ReplicaSet', name: 'web-abc' }
    );
    assert.deepStrictEqual(podOwner(pod({}, { name: 'lonely-pod' })), { kind: 'Pod', name: 'lonely-pod' });
});

test('podIssueMessage - surfaces the waiting reason/message', () => {
    const p = pod({ containerStatuses: [waiting('CrashLoopBackOff', 'back-off restarting failed container')] });
    assert.strictEqual(podIssueMessage(p, 'crashLooping'), 'back-off restarting failed container');
});

test('podIssueMessage - OOMKilled names the container', () => {
    const p = pod({ containerStatuses: [{ name: 'app', ...terminated('OOMKilled', 137) }] });
    assert.match(podIssueMessage(p, 'oomKilled'), /Container "app" was OOMKilled/);
});

test('podIssueMessage - pending reports unschedulable condition', () => {
    const p = pod({ conditions: [{ type: 'PodScheduled', status: 'False', message: 'no nodes available' }] });
    assert.strictEqual(podIssueMessage(p, 'pending'), 'no nodes available');
});

test('podIssueMessage - notReady lists the not-ready containers', () => {
    const p = pod({ containerStatuses: [{ name: 'app', ready: false }, { name: 'sidecar', ready: true }] });
    assert.strictEqual(podIssueMessage(p, 'notReady'), 'Containers not ready: app');
});
