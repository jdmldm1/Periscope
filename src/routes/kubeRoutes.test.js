const test = require('node:test');
const assert = require('node:assert/strict');

const execCalls = [];
let runImpl = () => Promise.resolve({ stdout: 'out', stderr: '' });
const execPath = require.resolve('../utils/exec');
require.cache[execPath] = {
    id: execPath,
    filename: execPath,
    loaded: true,
    exports: {
        run: (file, args) => {
            execCalls.push([file, ...args]);
            return runImpl(file, args);
        },
        spawnSafe: () => {
            throw new Error('spawnSafe should be stubbed through workloadService');
        },
    },
};

const k8sService = require('../services/k8sService');
const workloadService = require('../services/workloadService');
const diagnoseService = require('../services/diagnoseService');
const kubeRoutes = require('./kubeRoutes');
const { withRouter, jsonRequest, stubMethods } = require('../testSupport/httpServer');

test.beforeEach(() => {
    execCalls.length = 0;
    runImpl = () => Promise.resolve({ stdout: 'out', stderr: '' });
});

const pod = { metadata: { name: 'web-1', namespace: 'prod' }, spec: { containers: [{ name: 'c' }] } };

test('path parameters are validated before any cluster call', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        let touched = 0;
        const restore = stubMethods(k8sService, {
            getResources: () => {
                touched += 1;
                return Promise.resolve([pod]);
            },
        });
        try {
            const bad = [
                ['GET', '/resource/pods/BAD_NS/web-1'],
                ['GET', '/resource/pods/prod/a%3Bb'],
                ['GET', '/resource/pods/prod/a%20b/yaml'],
                ['GET', '/resource/p%24ds/prod/web-1'],
                ['DELETE', '/resource/pods/prod/%24(id)'],
                ['PUT', '/resource/deployments/prod/..%2Fx/restart'],
                ['GET', '/diagnose/prod/a%3Bb'],
            ];
            for (const [method, path] of bad) {
                const res = await fetch(`${base}${path}`, { method });
                assert.equal(res.status, 400, `${method} ${path}`);
            }
            assert.equal(touched, 0);
        } finally {
            restore();
        }
    }));

test('listing resources passes the kind and namespace to the cache layer', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const seen = [];
        const restore = stubMethods(k8sService, {
            getResources: (kind, ns) => {
                seen.push([kind, ns]);
                return Promise.resolve([pod]);
            },
        });
        try {
            assert.equal(
                (await (await fetch(`${base}/resource/pods?namespace=prod`)).json())[0].metadata.name,
                'web-1',
            );
            assert.equal((await fetch(`${base}/pods?namespace=all`)).status, 200);
            assert.deepEqual(seen, [
                ['pods', 'prod'],
                ['pods', 'all'],
            ]);
        } finally {
            restore();
        }
    }));

test('single resource lookups return 404 when the object is missing', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const restore = stubMethods(k8sService, { getResources: () => Promise.resolve([pod]) });
        try {
            assert.equal((await fetch(`${base}/resource/pods/prod/web-1`)).status, 200);
            assert.equal((await fetch(`${base}/resource/pods/prod/nope`)).status, 404);
            assert.equal((await fetch(`${base}/resource/pods/prod/nope/yaml`)).status, 404);
        } finally {
            restore();
        }
    }));

test('yaml export is served as text/plain and carries type metadata', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const restore = stubMethods(k8sService, { getResources: () => Promise.resolve([pod]) });
        try {
            const res = await fetch(`${base}/resource/pods/prod/web-1/yaml`);
            assert.match(res.headers.get('content-type'), /^text\/plain/);
            const body = await res.text();
            assert.match(body, /apiVersion: v1/);
            assert.match(body, /kind: Pod/);
        } finally {
            restore();
        }
    }));

test('save requires yaml and reports apply failures', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const applied = [];
        let restore = stubMethods(workloadService, {
            applyYaml: (...args) => {
                applied.push(args);
                return Promise.resolve({ message: 'configured' });
            },
        });
        try {
            assert.equal((await jsonRequest(`${base}/resource/pods/prod/web-1/save`, 'POST', {})).status, 400);
            const ok = await jsonRequest(`${base}/resource/pods/prod/web-1/save`, 'POST', { yaml: 'a: b' });
            assert.deepEqual(await ok.json(), { success: true, message: 'configured' });
            assert.deepEqual(applied[0], ['pods', 'prod', 'a: b']);
        } finally {
            restore();
        }
        restore = stubMethods(workloadService, { applyYaml: () => Promise.reject(new Error('invalid')) });
        try {
            const bad = await jsonRequest(`${base}/resource/pods/prod/web-1/save`, 'POST', { yaml: 'a: b' });
            assert.equal(bad.status, 500);
            assert.equal((await bad.json()).error, 'invalid');
        } finally {
            restore();
        }
    }));

test('deployment actions validate replicas and delegate to the workload service', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const calls = [];
        const record =
            (name) =>
            (...args) => {
                calls.push([name, ...args]);
                return Promise.resolve({ message: name });
            };
        const restore = stubMethods(workloadService, {
            restart: record('restart'),
            scale: record('scale'),
            stop: record('stop'),
            start: record('start'),
            deleteResource: record('delete'),
        });
        try {
            const dep = `${base}/resource/deployments/prod/api`;
            assert.equal((await fetch(`${dep}/restart`, { method: 'PUT' })).status, 200);
            assert.equal((await jsonRequest(`${dep}/scale`, 'PUT', {})).status, 400);
            assert.equal((await jsonRequest(`${dep}/scale`, 'PUT', { replicas: 'abc' })).status, 400);
            assert.equal((await jsonRequest(`${dep}/scale`, 'PUT', { replicas: 3 })).status, 200);
            assert.equal((await fetch(`${dep}/stop`, { method: 'PUT' })).status, 200);
            assert.equal((await jsonRequest(`${dep}/start`, 'PUT', { replicas: 2 })).status, 200);
            assert.equal((await fetch(dep, { method: 'DELETE' })).status, 200);
            assert.deepEqual(
                calls.map((c) => c[0]),
                ['restart', 'scale', 'stop', 'start', 'delete'],
            );
            assert.deepEqual(calls[1], ['scale', 'prod', 'api', 3]);
            assert.deepEqual(calls[4], ['delete', 'deployments', 'prod', 'api']);
        } finally {
            restore();
        }
    }));

test('events are filtered by object name and kind', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const events = {
            items: [
                { involvedObject: { name: 'web-1', kind: 'Pod' }, reason: 'A' },
                { involvedObject: { name: 'web-1', kind: 'Deployment' }, reason: 'B' },
                { involvedObject: { name: 'other', kind: 'Pod' }, reason: 'C' },
            ],
        };
        const originalCore = k8sService.core;
        k8sService.core = {
            listNamespacedEvent: () => Promise.resolve(events),
            listEventForAllNamespaces: () => Promise.resolve(events),
        };
        try {
            const body = await (await fetch(`${base}/resource/pods/prod/web-1/events`)).json();
            assert.deepEqual(
                body.map((e) => e.reason),
                ['A'],
            );
            const all = await (await fetch(`${base}/resource/pods/all/web-1/events`)).json();
            assert.equal(all.length, 1);
        } finally {
            k8sService.core = originalCore;
        }
    }));

test('pod logs are returned as text/plain', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const originalCore = k8sService.core;
        let args;
        k8sService.core = {
            readNamespacedPodLog: (a) => {
                args = a;
                return Promise.resolve('<script>alert(1)</script>');
            },
        };
        try {
            const res = await fetch(`${base}/resource/pods/prod/web-1/logs?container=c`);
            assert.match(res.headers.get('content-type'), /^text\/plain/);
            assert.equal(await res.text(), '<script>alert(1)</script>');
            assert.equal(args.container, 'c');
            assert.equal(args.tailLines, 1000);
        } finally {
            k8sService.core = originalCore;
        }
    }));

test('exec passes the command as a single argument after sh -c', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const restore = stubMethods(k8sService, {
            resolveContainerName: (ns, name, c) => Promise.resolve(c || 'main'),
        });
        try {
            const res = await jsonRequest(`${base}/resource/pods/prod/web-1/exec`, 'POST', {
                command: 'echo hi; id',
            });
            assert.deepEqual(await res.json(), { stdout: 'out', stderr: '' });
            assert.deepEqual(execCalls[0], [
                'kubectl',
                'exec',
                '-n',
                'prod',
                'web-1',
                '-c',
                'main',
                '--',
                'sh',
                '-c',
                'echo hi; id',
            ]);
        } finally {
            restore();
        }
    }));

test('exec returns partial output for failing commands and 500 when there is none', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const restore = stubMethods(k8sService, { resolveContainerName: () => Promise.resolve('main') });
        try {
            runImpl = () => Promise.reject(Object.assign(new Error('exit 1'), { stdout: 'partial', stderr: 'oops' }));
            const partial = await jsonRequest(`${base}/resource/pods/prod/web-1/exec`, 'POST', { command: 'false' });
            assert.deepEqual(await partial.json(), { stdout: 'partial', stderr: 'oops' });
            runImpl = () => Promise.reject(Object.assign(new Error('x'), { stderr: 'container not found' }));
            const failed = await jsonRequest(`${base}/resource/pods/prod/web-1/exec`, 'POST', { command: 'ls' });
            assert.equal(failed.status, 500);
            assert.equal((await failed.json()).error, 'container not found');
        } finally {
            restore();
        }
    }));

test('file download requires a path', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        const res = await fetch(`${base}/resource/pods/prod/web-1/files/download`);
        assert.equal(res.status, 400);
    }));

test('remediation maps service status codes and defaults to 500', () =>
    withRouter('/api/kube', kubeRoutes, async (base) => {
        let restore = stubMethods(diagnoseService, {
            remediate: () => Promise.reject(Object.assign(new Error('unsupported'), { statusCode: 400 })),
        });
        try {
            const res = await jsonRequest(`${base}/resource/pods/prod/web-1/remediate`, 'POST', { type: 'x' });
            assert.equal(res.status, 400);
        } finally {
            restore();
        }
        restore = stubMethods(diagnoseService, {
            remediate: (ns, name, type, params) => Promise.resolve({ message: `${ns}/${name}/${type}/${params.a}` }),
        });
        try {
            const res = await jsonRequest(`${base}/resource/deployments/prod/web/remediate`, 'POST', {
                type: 'restart',
                params: { a: 1 },
            });
            assert.deepEqual(await res.json(), { success: true, message: 'prod/web/restart/1' });
        } finally {
            restore();
        }
    }));
