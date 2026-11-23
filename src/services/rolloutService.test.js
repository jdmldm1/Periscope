const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHistory, rollback } = require('./rolloutService');

const rs = (name, revision, ownerUid, image) => ({
    metadata: {
        name,
        creationTimestamp: '2030-01-01T00:00:00Z',
        annotations: { 'deployment.kubernetes.io/revision': String(revision) },
        ownerReferences: [{ kind: 'Deployment', uid: ownerUid }],
    },
    spec: { template: { spec: { containers: [{ image }] } } },
    status: { replicas: 1, readyReplicas: 1 },
});

test('buildHistory keeps owned ReplicaSets, newest first, and marks the current revision', () => {
    const deployment = { metadata: { uid: 'u1', annotations: { 'deployment.kubernetes.io/revision': '3' } } };
    const history = buildHistory(deployment, [
        rs('a', 1, 'u1', 'img:1'),
        rs('b', 3, 'u1', 'img:3'),
        rs('c', 2, 'other', 'img:x'),
        rs('d', 2, 'u1', 'img:2'),
    ]);
    assert.deepEqual(
        history.map((h) => [h.revision, h.current]),
        [
            [3, true],
            [2, false],
            [1, false],
        ],
    );
    assert.deepEqual(history[0].images, ['img:3']);
});

test('rollback rejects non-integer revisions before invoking kubectl', async () => {
    for (const bad of [NaN, 0, -1, 1.5, '1; rm -rf /']) {
        await assert.rejects(() => rollback('ns', 'app', bad), { statusCode: 400 });
    }
});
