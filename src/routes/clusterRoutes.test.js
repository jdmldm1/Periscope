const test = require('node:test');
const assert = require('node:assert/strict');

const { withRouter, jsonRequest, stubMethods } = require('../testSupport/httpServer');
const rbacRoutes = require('./rbacRoutes');
const certRoutes = require('./certRoutes');
const metricRoutes = require('./metricRoutes');
const opsRoutes = require('./opsRoutes');
const taskRoutes = require('./taskRoutes');
const autoscaleRoutes = require('./autoscaleRoutes');
const rbacService = require('../services/rbacService');
const certService = require('../services/certService');
const usageService = require('../services/usageService');
const searchService = require('../services/searchService');
const crdService = require('../services/crdService');
const rolloutService = require('../services/rolloutService');
const workloadService = require('../services/workloadService');
const taskService = require('../services/taskService');
const autoscaleService = require('../services/autoscaleService');

const grants = [
    {
        subject: { kind: 'User', name: 'alice' },
        binding: { name: 'b', kind: 'ClusterRoleBinding' },
        role: { kind: 'ClusterRole', name: 'view', found: true },
        scope: 'cluster',
        rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }],
        clusterAdmin: false,
        wildcard: false,
    },
];

test('rbac routes list subjects, subject grants and who-can results', () =>
    withRouter('/api/rbac', rbacRoutes, async (base) => {
        const restore = stubMethods(rbacService, { loadGrants: () => Promise.resolve(grants) });
        try {
            const subjects = await (await fetch(`${base}/subjects`)).json();
            assert.equal(subjects.subjects[0].name, 'alice');

            const subject = await (await fetch(`${base}/subject?kind=User&name=alice`)).json();
            assert.equal(subject.grants.length, 1);
            assert.equal('subject' in subject.grants[0], false);

            const who = await (await fetch(`${base}/whocan?verb=get&resource=pods`)).json();
            assert.deepEqual(
                who.subjects.map((s) => s.name),
                ['alice'],
            );
            const none = await (await fetch(`${base}/whocan?verb=delete&resource=pods`)).json();
            assert.deepEqual(none.subjects, []);
        } finally {
            restore();
        }
    }));

test('rbac routes validate their inputs before querying the API', () =>
    withRouter('/api/rbac', rbacRoutes, async (base) => {
        let loads = 0;
        const restore = stubMethods(rbacService, {
            loadGrants: () => {
                loads += 1;
                return Promise.resolve(grants);
            },
        });
        try {
            const bad = [
                '/subject?kind=Robot&name=x',
                '/subject?kind=User',
                '/subject?kind=ServiceAccount&name=x',
                '/subject?kind=ServiceAccount&name=x&namespace=a%3Bb',
                '/whocan?verb=get',
                '/whocan?resource=pods',
                '/whocan?verb=get%3Brm&resource=pods',
                '/whocan?verb=get&resource=pods&namespace=BAD_NS',
                '/whocan?verb=get&resource=pods&apiGroup=a%20b',
            ];
            for (const path of bad) {
                assert.equal((await fetch(`${base}${path}`)).status, 400, path);
            }
            assert.equal(loads, 0);
        } finally {
            restore();
        }
    }));

test('rbac routes report upstream failures as 500', () =>
    withRouter('/api/rbac', rbacRoutes, async (base) => {
        const restore = stubMethods(rbacService, { loadGrants: () => Promise.reject(new Error('api down')) });
        try {
            for (const path of ['/subjects', '/subject?kind=User&name=a', '/whocan?verb=get&resource=pods']) {
                const res = await fetch(`${base}${path}`);
                assert.equal(res.status, 500, path);
                assert.equal((await res.json()).error, 'api down');
            }
        } finally {
            restore();
        }
    }));

test('cert route returns the service result or a 500', () =>
    withRouter('/api/certs', certRoutes, async (base) => {
        let restore = stubMethods(certService, {
            listCertificates: () => Promise.resolve({ certManager: false, summary: {}, certificates: [] }),
        });
        assert.equal((await fetch(base)).status, 200);
        restore();
        restore = stubMethods(certService, { listCertificates: () => Promise.reject(new Error('boom')) });
        try {
            const res = await fetch(base);
            assert.equal(res.status, 500);
            assert.equal((await res.json()).error, 'boom');
        } finally {
            restore();
        }
    }));

test('metrics usage validates the namespace and handles failures', () =>
    withRouter('/api/metrics', metricRoutes, async (base) => {
        const seen = [];
        let restore = stubMethods(usageService, {
            getUsage: (ns) => {
                seen.push(ns);
                return Promise.resolve({ metricsAvailable: true, pods: [], nodes: [] });
            },
        });
        assert.equal((await fetch(`${base}/usage`)).status, 200);
        assert.equal((await fetch(`${base}/usage?namespace=prod`)).status, 200);
        assert.equal((await fetch(`${base}/usage?namespace=a%3Bb`)).status, 400);
        assert.deepEqual(seen, ['all', 'prod']);
        restore();
        restore = stubMethods(usageService, { getUsage: () => Promise.reject(new Error('x')) });
        try {
            assert.equal((await fetch(`${base}/usage`)).status, 500);
        } finally {
            restore();
        }
    }));

test('ops routes: search, history, rollback, scale, restart and crd schema', () =>
    withRouter('/api/kube', opsRoutes, async (base) => {
        const calls = [];
        const restores = [
            stubMethods(searchService, {
                search: (q) => {
                    calls.push(['search', q]);
                    return Promise.resolve([{ kind: 'pods', name: 'p', namespace: 'a' }]);
                },
            }),
            stubMethods(rolloutService, {
                history: (ns, name) => Promise.resolve([{ revision: 1, ns, name }]),
            }),
            stubMethods(crdService, {
                getCrdSchema: (name) => Promise.resolve({ name }),
            }),
            stubMethods(workloadService, {
                scaleWorkload: (...args) => {
                    calls.push(['scale', ...args]);
                    return Promise.resolve({ message: 'scaled' });
                },
                restartWorkload: (...args) => {
                    calls.push(['restart', ...args]);
                    return Promise.resolve({ message: 'restarted' });
                },
                drainNode: (name) => {
                    calls.push(['drain', name]);
                    return Promise.resolve({ message: 'drained' });
                },
                dryRunYaml: (...args) => {
                    calls.push(['dry-run', ...args]);
                    return Promise.resolve({ valid: true, message: 'ok' });
                },
            }),
        ];
        try {
            assert.deepEqual((await (await fetch(`${base}/search?q=pod`)).json()).results[0].name, 'p');
            assert.deepEqual(calls[0], ['search', 'pod']);
            await fetch(`${base}/search?q=a&q=b`);
            assert.deepEqual(calls[1], ['search', 'a']);

            const hist = await (await fetch(`${base}/resource/deployments/prod/web/rollout-history`)).json();
            assert.deepEqual(hist.revisions, [{ revision: 1, ns: 'prod', name: 'web' }]);

            const schema = await (await fetch(`${base}/crd/widgets.example.com/schema`)).json();
            assert.equal(schema.name, 'widgets.example.com');

            const scale = await jsonRequest(`${base}/workloads/statefulsets/prod/db/scale`, 'PUT', { replicas: 3 });
            assert.equal(scale.status, 200);
            assert.deepEqual(calls.at(-1), ['scale', 'statefulsets', 'prod', 'db', 3]);

            const restart = await fetch(`${base}/workloads/daemonsets/prod/agent/restart`, { method: 'PUT' });
            assert.equal(restart.status, 200);
            assert.deepEqual(calls.at(-1), ['restart', 'daemonsets', 'prod', 'agent']);

            const drain = await fetch(`${base}/nodes/worker-1/drain`, { method: 'PUT' });
            assert.equal(drain.status, 200);
            assert.deepEqual(calls.at(-1), ['drain', 'worker-1']);

            const dry = await jsonRequest(`${base}/resource/deployments/undefined/web/dry-run`, 'POST', {
                yaml: 'a: b',
            });
            assert.equal(dry.status, 200);
            assert.deepEqual(calls.at(-1), ['dry-run', 'deployments', undefined, 'a: b']);
        } finally {
            restores.forEach((r) => r());
        }
    }));

test('ops routes surface service errors using their status code', () =>
    withRouter('/api/kube', opsRoutes, async (base) => {
        const restore = stubMethods(workloadService, {
            scaleWorkload: () => Promise.reject(Object.assign(new Error('bad replicas'), { statusCode: 400 })),
            drainNode: () => Promise.reject(Object.assign(new Error('x'), { stderr: 'cannot evict pod' })),
        });
        try {
            const scale = await jsonRequest(`${base}/workloads/statefulsets/prod/db/scale`, 'PUT', { replicas: -1 });
            assert.equal(scale.status, 400);
            assert.equal((await scale.json()).error, 'bad replicas');
            const drain = await fetch(`${base}/nodes/n1/drain`, { method: 'PUT' });
            assert.equal(drain.status, 500);
            assert.equal((await drain.json()).error, 'cannot evict pod');
        } finally {
            restore();
        }
    }));

test('task routes list, read and delete tasks', () =>
    withRouter('/api/tasks', taskRoutes, async (base) => {
        const id = taskService.startTask(process.execPath, ['-e', 'console.log("x")']);
        try {
            const list = await (await fetch(base)).json();
            assert.ok(list.some((t) => t.id === id));
            assert.equal((await fetch(`${base}/${id}/logs`)).status, 200);
            assert.equal((await fetch(`${base}/nope/logs`)).status, 404);
            assert.equal((await fetch(`${base}/${id}`, { method: 'DELETE' })).status, 200);
            assert.equal((await fetch(`${base}/${id}`, { method: 'DELETE' })).status, 404);
        } finally {
            taskService.deleteTask(id);
        }
    }));

test('autoscale routes delegate to the service and map failures to 500', () =>
    withRouter('/api/autoscale', autoscaleRoutes, async (base) => {
        const calls = [];
        const restore = stubMethods(autoscaleService, {
            listHPAs: (ns) => {
                calls.push(['list', ns]);
                return Promise.resolve([]);
            },
            createHPA: (ns, spec) => {
                calls.push(['create', ns, spec]);
                return Promise.resolve({ ok: true });
            },
            updateHPA: (ns, name, patch) => {
                calls.push(['update', ns, name, patch]);
                return Promise.resolve({ ok: true });
            },
            deleteHPA: (ns, name) => {
                calls.push(['delete', ns, name]);
                return Promise.resolve();
            },
            listScalableTargets: () => Promise.resolve({ deployments: [], statefulsets: [] }),
            getHPA: () => Promise.reject(new Error('not found')),
        });
        try {
            assert.equal((await fetch(`${base}/hpa?namespace=prod`)).status, 200);
            assert.deepEqual(calls[0], ['list', 'prod']);
            await jsonRequest(`${base}/hpa`, 'POST', { namespace: 'prod', name: 'web', targetName: 'web' });
            assert.deepEqual(calls[1], ['create', 'prod', { name: 'web', targetName: 'web' }]);
            await jsonRequest(`${base}/hpa/prod/web`, 'PUT', { maxReplicas: 4 });
            assert.deepEqual(calls[2], ['update', 'prod', 'web', { maxReplicas: 4 }]);
            assert.equal((await fetch(`${base}/hpa/prod/web`, { method: 'DELETE' })).status, 200);
            assert.deepEqual(calls[3], ['delete', 'prod', 'web']);
            assert.equal((await fetch(`${base}/targets`)).status, 200);
            const missing = await fetch(`${base}/hpa/prod/web`);
            assert.equal(missing.status, 500);
        } finally {
            restore();
        }
    }));
