const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('./autoscaleService');

const calls = [];
const record =
    (name, result = {}) =>
    (args) => {
        calls.push([name, args]);
        return Promise.resolve(result);
    };

test.beforeEach(() => {
    calls.length = 0;
});

test('listHPAs queries all namespaces or one namespace', async () => {
    svc.autoscaling = {
        listHorizontalPodAutoscalerForAllNamespaces: record('all', { items: [{ metadata: { name: 'a' } }] }),
        listNamespacedHorizontalPodAutoscaler: record('ns', { items: [] }),
    };
    assert.equal((await svc.listHPAs('all')).length, 1);
    assert.equal((await svc.listHPAs()).length, 1);
    assert.deepEqual(await svc.listHPAs('prod'), []);
    assert.deepEqual(
        calls.map((c) => c[0]),
        ['all', 'all', 'ns'],
    );
    assert.deepEqual(calls[2][1], { namespace: 'prod' });
});

test('listHPAs propagates API errors', async () => {
    svc.autoscaling = {
        listHorizontalPodAutoscalerForAllNamespaces: () => Promise.reject(new Error('forbidden')),
    };
    await assert.rejects(() => svc.listHPAs('all'), /forbidden/);
});

test('createHPA builds an autoscaling/v2 manifest with defaults', async () => {
    svc.autoscaling = { createNamespacedHorizontalPodAutoscaler: record('create') };
    await svc.createHPA('prod', { name: 'web', targetName: 'web' });
    const { namespace, body } = calls[0][1];
    assert.equal(namespace, 'prod');
    assert.equal(body.apiVersion, 'autoscaling/v2');
    assert.deepEqual(body.spec.scaleTargetRef, { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' });
    assert.equal(body.spec.minReplicas, 1);
    assert.equal(body.spec.maxReplicas, 10);
    assert.equal(body.spec.metrics[0].resource.target.averageUtilization, 70);
    assert.equal(body.spec.metrics.length, 1);
});

test('createHPA honours explicit targets and adds a memory metric', async () => {
    svc.autoscaling = { createNamespacedHorizontalPodAutoscaler: record('create') };
    await svc.createHPA('prod', {
        name: 'db',
        targetKind: 'StatefulSet',
        targetName: 'db',
        minReplicas: '2',
        maxReplicas: '6',
        cpuTarget: '55',
        memoryTarget: '80',
    });
    const { body } = calls[0][1];
    assert.equal(body.spec.scaleTargetRef.kind, 'StatefulSet');
    assert.equal(body.spec.minReplicas, 2);
    assert.equal(body.spec.maxReplicas, 6);
    assert.deepEqual(
        body.spec.metrics.map((m) => [m.resource.name, m.resource.target.averageUtilization]),
        [
            ['cpu', 55],
            ['memory', 80],
        ],
    );
});

test('updateHPA patches only the supplied fields', async () => {
    svc.autoscaling = {
        readNamespacedHorizontalPodAutoscaler: () =>
            Promise.resolve({ metadata: { name: 'web' }, spec: { minReplicas: 1, maxReplicas: 5, metrics: [] } }),
        replaceNamespacedHorizontalPodAutoscaler: record('replace'),
    };
    await svc.updateHPA('prod', 'web', { maxReplicas: '9' });
    const { body } = calls[0][1];
    assert.equal(body.spec.maxReplicas, 9);
    assert.equal(body.spec.minReplicas, 1);
});

test('deleteHPA forwards namespace and name', async () => {
    svc.autoscaling = { deleteNamespacedHorizontalPodAutoscaler: record('delete') };
    await svc.deleteHPA('prod', 'web');
    assert.deepEqual(calls[0][1], { namespace: 'prod', name: 'web' });
});

test('listScalableTargets maps deployments and statefulsets, scoped or cluster-wide', async () => {
    const dep = { metadata: { name: 'd', namespace: 'p' }, spec: { replicas: 2 } };
    const sts = { metadata: { name: 's', namespace: 'p' }, spec: { replicas: 3 } };
    svc.apps = {
        listNamespacedDeployment: () => Promise.resolve({ items: [dep] }),
        listNamespacedStatefulSet: () => Promise.resolve({ items: [sts] }),
        listDeploymentForAllNamespaces: () => Promise.resolve({ items: [dep, dep] }),
        listStatefulSetForAllNamespaces: () => Promise.resolve({ items: [] }),
    };
    const scoped = await svc.listScalableTargets('p');
    assert.deepEqual(scoped.deployments, [{ name: 'd', namespace: 'p', replicas: 2 }]);
    assert.deepEqual(scoped.statefulsets, [{ name: 's', namespace: 'p', replicas: 3 }]);
    const all = await svc.listScalableTargets('all');
    assert.equal(all.deployments.length, 2);
});

test('listScalableTargets returns empty lists instead of throwing on API errors', async () => {
    svc.apps = {
        listDeploymentForAllNamespaces: () => Promise.reject(new Error('nope')),
        listStatefulSetForAllNamespaces: () => Promise.resolve({ items: [] }),
    };
    assert.deepEqual(await svc.listScalableTargets(), { deployments: [], statefulsets: [] });
});
