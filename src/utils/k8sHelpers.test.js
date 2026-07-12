const test = require('node:test');
const assert = require('node:assert');
const yaml = require('js-yaml');

const { ensureTypeMeta, KIND_GVK } = require('./k8sHelpers');






test('ensureTypeMeta - re-attaches apiVersion/kind for a bare list item', () => {
    const item = { metadata: { name: 'web' }, spec: { replicas: 1 } };
    const fixed = ensureTypeMeta(item, 'deployments');
    assert.strictEqual(fixed.apiVersion, 'apps/v1');
    assert.strictEqual(fixed.kind, 'Deployment');
});

test('ensureTypeMeta - is case-insensitive on the plural kind', () => {
    const fixed = ensureTypeMeta({ metadata: { name: 'svc' } }, 'Services');
    assert.strictEqual(fixed.apiVersion, 'v1');
    assert.strictEqual(fixed.kind, 'Service');
});

test('ensureTypeMeta - does not clobber values already present', () => {
    const item = { apiVersion: 'apps/v1', kind: 'StatefulSet', metadata: { name: 'db' } };
    const fixed = ensureTypeMeta(item, 'deployments');
    assert.strictEqual(fixed.apiVersion, 'apps/v1');
    assert.strictEqual(fixed.kind, 'StatefulSet');
});

test('ensureTypeMeta - tolerates unknown kinds and non-objects', () => {
    const item = { metadata: { name: 'x' } };
    assert.strictEqual(ensureTypeMeta(item, 'widgets'), item);
    assert.strictEqual(ensureTypeMeta(null, 'deployments'), null);
});

test('ensureTypeMeta - produced YAML round-trips with a usable TypeMeta', () => {
    const dumped = yaml.dump(ensureTypeMeta({ metadata: { name: 'web' } }, 'deployments'));
    const reparsed = yaml.load(dumped);
    assert.strictEqual(reparsed.apiVersion, 'apps/v1');
    assert.strictEqual(reparsed.kind, 'Deployment');
});

test('KIND_GVK - covers the mutable workload kinds the editor exposes', () => {
    for (const k of ['deployments', 'statefulsets', 'daemonsets', 'services', 'configmaps', 'ingresses', 'cronjobs']) {
        assert.ok(KIND_GVK[k] && KIND_GVK[k].apiVersion && KIND_GVK[k].kind, `missing GVK for ${k}`);
    }
});
