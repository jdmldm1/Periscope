const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const k8sService = require('./k8sService');
const { stubMethods } = require('../testSupport/httpServer');
const searchService = require('./searchService');
const usageService = require('./usageService');
const certService = require('./certService');
const rbacService = require('./rbacService');
const crdService = require('./crdService');
const rolloutService = require('./rolloutService');

function selfSignedPem(days) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-'));
    try {
        execFileSync(
            'openssl',
            [
                'req',
                '-x509',
                '-newkey',
                'rsa:2048',
                '-nodes',
                '-keyout',
                path.join(dir, 'k.pem'),
                '-out',
                path.join(dir, 'c.pem'),
                '-days',
                String(days),
                '-subj',
                '/CN=test.example',
                '-addext',
                'subjectAltName=DNS:test.example,DNS:www.example',
            ],
            { stdio: 'ignore' },
        );
        return fs.readFileSync(path.join(dir, 'c.pem'));
    } catch {
        return null;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('search queries every kind, ranks matches and tolerates failing kinds', async () => {
    const restore = stubMethods(k8sService, {
        getResources: (kind) => {
            if (kind === 'secrets') return Promise.reject(new Error('forbidden'));
            if (kind === 'pods') {
                return Promise.resolve([
                    { metadata: { name: 'my-api-1', namespace: 'a' } },
                    { metadata: { name: 'api', namespace: 'b' } },
                ]);
            }
            if (kind === 'nodes') return Promise.resolve([{ metadata: { name: 'api-node' } }]);
            return Promise.resolve([]);
        },
    });
    try {
        const out = await searchService.search('API');
        assert.deepEqual(
            out.map((r) => `${r.kind}/${r.name}`),
            ['pods/api', 'nodes/api-node', 'pods/my-api-1'],
        );
        assert.equal(out[1].namespace, null);
        assert.equal('score' in out[0], false);
        assert.equal((await searchService.search('api', 1)).length, 1);
    } finally {
        restore();
    }
});

test('usage joins pods, nodes and metrics and scopes pods to a namespace', async () => {
    const pod = (ns, name) => ({
        metadata: { name, namespace: ns },
        spec: { nodeName: 'n1', containers: [{ resources: { requests: { cpu: '100m' } } }] },
        status: { phase: 'Running' },
    });
    const restore = stubMethods(k8sService, { getItems: (raw) => raw.items });
    const originalCore = k8sService.core;
    const originalCustom = k8sService.custom;
    k8sService.core = {
        listPodForAllNamespaces: () => Promise.resolve({ items: [pod('a', 'p1'), pod('b', 'p2')] }),
        listNode: () =>
            Promise.resolve({
                items: [{ metadata: { name: 'n1' }, status: { allocatable: { cpu: '2', memory: '1Gi', pods: '10' } } }],
            }),
    };
    k8sService.custom = { listClusterCustomObject: () => Promise.reject(new Error('no metrics')) };
    try {
        const all = await usageService.getUsage('all');
        assert.equal(all.metricsAvailable, false);
        assert.equal(all.pods.length, 2);
        assert.equal(all.nodes[0].cpu.request, 200);
        const scoped = await usageService.getUsage('a');
        assert.deepEqual(
            scoped.pods.map((p) => p.name),
            ['p1'],
        );
        assert.equal(scoped.nodes[0].pods.count, 2);
    } finally {
        k8sService.core = originalCore;
        k8sService.custom = originalCustom;
        restore();
    }
});

test('usage propagates a failure to list pods', async () => {
    const originalCore = k8sService.core;
    k8sService.core = {
        listPodForAllNamespaces: () => Promise.reject(new Error('api down')),
        listNode: () => Promise.resolve({ items: [] }),
    };
    const originalCustom = k8sService.custom;
    k8sService.custom = { listClusterCustomObject: () => Promise.resolve({ items: [] }) };
    try {
        await assert.rejects(() => usageService.getUsage('all'), /api down/);
    } finally {
        k8sService.core = originalCore;
        k8sService.custom = originalCustom;
    }
});

test('listCertificates parses real TLS secrets and cert-manager Certificates', async (t) => {
    const pem = selfSignedPem(10);
    if (!pem) return t.skip('openssl is not available');
    const originalCore = k8sService.core;
    const originalCustom = k8sService.custom;
    k8sService.core = {
        listSecretForAllNamespaces: (args) => {
            assert.equal(args.fieldSelector, 'type=kubernetes.io/tls');
            return Promise.resolve({
                items: [
                    {
                        metadata: { name: 'web-tls', namespace: 'prod' },
                        data: { 'tls.crt': pem.toString('base64'), 'tls.key': 'c2VjcmV0' },
                    },
                ],
            });
        },
    };
    k8sService.custom = {
        listClusterCustomObject: () =>
            Promise.resolve({
                items: [
                    {
                        metadata: { name: 'web', namespace: 'prod' },
                        spec: { secretName: 'web-tls' },
                        status: { notAfter: new Date(Date.now() + 90 * 86400000).toISOString() },
                    },
                ],
            }),
    };
    try {
        const out = await certService.listCertificates();
        assert.equal(out.certManager, true);
        assert.equal(out.certificates.length, 2);
        const secret = out.certificates.find((c) => c.source === 'secret');
        assert.equal(secret.status, 'warning');
        assert.ok(secret.daysLeft >= 8 && secret.daysLeft <= 10);
        assert.match(secret.subject, /test\.example/);
        assert.ok(secret.dnsNames.some((d) => d.includes('www.example')));
        assert.equal(out.certificates[0].source, 'secret');
        assert.equal(JSON.stringify(out).includes('c2VjcmV0'), false);
        assert.equal(out.summary.total, 2);
    } finally {
        k8sService.core = originalCore;
        k8sService.custom = originalCustom;
    }
});

test('listCertificates works without cert-manager installed', async () => {
    const originalCore = k8sService.core;
    const originalCustom = k8sService.custom;
    k8sService.core = { listSecretForAllNamespaces: () => Promise.resolve({ items: [] }) };
    k8sService.custom = { listClusterCustomObject: () => Promise.reject(new Error('404 not found')) };
    try {
        const out = await certService.listCertificates();
        assert.equal(out.certManager, false);
        assert.deepEqual(out.certificates, []);
    } finally {
        k8sService.core = originalCore;
        k8sService.custom = originalCustom;
    }
});

test('loadGrants combines roles and bindings from the RBAC API', async () => {
    const original = k8sService.rbac;
    k8sService.rbac = {
        listClusterRole: () =>
            Promise.resolve({
                items: [
                    { metadata: { name: 'view' }, rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }] },
                ],
            }),
        listRoleForAllNamespaces: () => Promise.resolve({ items: [] }),
        listClusterRoleBinding: () =>
            Promise.resolve({
                items: [
                    {
                        metadata: { name: 'b' },
                        roleRef: { kind: 'ClusterRole', name: 'view' },
                        subjects: [{ kind: 'User', name: 'alice' }],
                    },
                ],
            }),
        listRoleBindingForAllNamespaces: () => Promise.resolve({ items: [] }),
    };
    try {
        const grants = await rbacService.loadGrants();
        assert.equal(grants.length, 1);
        assert.equal(grants[0].role.found, true);
        const who = rbacService.whoCan(grants, { verb: 'get', resource: 'pods', apiGroup: '' });
        assert.deepEqual(
            who.map((s) => s.name),
            ['alice'],
        );
    } finally {
        k8sService.rbac = original;
    }
});

test('getCrdSchema reads the CRD and flattens its schema', async () => {
    const original = k8sService.extensions;
    k8sService.extensions = {
        readCustomResourceDefinition: ({ name }) =>
            Promise.resolve({
                metadata: { name },
                spec: {
                    group: 'example.com',
                    scope: 'Namespaced',
                    names: { kind: 'Widget', plural: 'widgets' },
                    versions: [
                        {
                            name: 'v1',
                            served: true,
                            storage: true,
                            schema: { openAPIV3Schema: { properties: { spec: { type: 'object' } } } },
                        },
                    ],
                },
            }),
    };
    try {
        const out = await crdService.getCrdSchema('widgets.example.com');
        assert.equal(out.kind, 'Widget');
        assert.equal(out.versions[0].fields[0].path, 'spec');
    } finally {
        k8sService.extensions = original;
    }
});

test('rollout history reads the deployment and its ReplicaSets', async () => {
    const originalApps = k8sService.apps;
    k8sService.apps = {
        readNamespacedDeployment: () =>
            Promise.resolve({ metadata: { uid: 'u', annotations: { 'deployment.kubernetes.io/revision': '2' } } }),
        listNamespacedReplicaSet: ({ namespace }) => {
            assert.equal(namespace, 'prod');
            return Promise.resolve({
                items: [1, 2].map((rev) => ({
                    metadata: {
                        name: `rs-${rev}`,
                        annotations: { 'deployment.kubernetes.io/revision': String(rev) },
                        ownerReferences: [{ kind: 'Deployment', uid: 'u' }],
                    },
                    spec: { template: { spec: { containers: [{ image: `app:${rev}` }] } } },
                    status: {},
                })),
            });
        },
    };
    try {
        const history = await rolloutService.history('prod', 'app');
        assert.deepEqual(
            history.map((h) => [h.revision, h.current, h.images[0]]),
            [
                [2, true, 'app:2'],
                [1, false, 'app:1'],
            ],
        );
    } finally {
        k8sService.apps = originalApps;
    }
});
