const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPodUsage, buildNodeUsage, hintsFor } = require('./usageService');

const pod = (name, resources, node = 'n1') => ({
    metadata: { name, namespace: 'ns' },
    spec: { nodeName: node, containers: [{ name: 'c', resources }] },
    status: { phase: 'Running' },
});
const podMetric = (name, cpu, memory) => ({
    metadata: { name, namespace: 'ns' },
    containers: [{ usage: { cpu, memory } }],
});

test('hintsFor flags missing requests, over-provisioning and near-limit usage', () => {
    assert.deepEqual(hintsFor('cpu', { request: 0, limit: 0, usage: 5 }), ['no cpu request']);
    assert.deepEqual(hintsFor('cpu', { request: 1000, limit: 0, usage: 50 }), ['cpu over-provisioned']);
    assert.deepEqual(hintsFor('memory', { request: 100, limit: 200, usage: 195 }), ['memory near limit']);
});

test('buildPodUsage joins metrics and skips non-running pods', () => {
    const pods = [
        pod('a', { requests: { cpu: '500m', memory: '256Mi' }, limits: { cpu: '1', memory: '512Mi' } }),
        { ...pod('b', {}), status: { phase: 'Pending' } },
    ];
    const out = buildPodUsage(pods, [podMetric('a', '50000000n', '100Mi')]);
    assert.equal(out.length, 1);
    assert.equal(out[0].cpu.request, 500);
    assert.equal(out[0].cpu.limit, 1000);
    assert.equal(out[0].cpu.usage, 50);
    assert.equal(out[0].memory.usage, 100 * 1024 * 1024);
    assert.ok(out[0].hints.includes('cpu over-provisioned'));
});

test('buildPodUsage reports null usage and no hints without metrics', () => {
    const out = buildPodUsage([pod('a', {})], []);
    assert.equal(out[0].cpu.usage, null);
    assert.deepEqual(out[0].hints, []);
});

test('buildNodeUsage sums pod requests per node', () => {
    const nodes = [{ metadata: { name: 'n1' }, status: { allocatable: { cpu: '2', memory: '4Gi', pods: '110' } } }];
    const pods = [pod('a', { requests: { cpu: '500m' } }), pod('b', { requests: { cpu: '250m' } })];
    const out = buildNodeUsage(nodes, [{ metadata: { name: 'n1' }, usage: { cpu: '1', memory: '1Gi' } }], pods);
    assert.equal(out[0].cpu.allocatable, 2000);
    assert.equal(out[0].cpu.request, 750);
    assert.equal(out[0].cpu.usage, 1000);
    assert.equal(out[0].pods.count, 2);
});
