const test = require('node:test');
const assert = require('node:assert/strict');

const { withRouter, jsonRequest, stubMethods } = require('../testSupport/httpServer');
const forwardRoutes = require('./forwardRoutes');
const forwardService = require('../services/forwardService');

test('forwardRoutes - lists active forwards', () =>
    withRouter('/api/portforward', forwardRoutes, async (base) => {
        const restore = stubMethods(forwardService, {
            listForwards: () => [
                { id: 'prod/web/80', localPort: 12345, remotePort: 80, podName: 'web', namespace: 'prod' },
            ],
        });
        try {
            const res = await fetch(base);
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.length, 1);
            assert.equal(data[0].id, 'prod/web/80');
        } finally {
            restore();
        }
    }));

test('forwardRoutes - creates a port forward', () =>
    withRouter('/api/portforward', forwardRoutes, async (base) => {
        const restore = stubMethods(forwardService, {
            createForward: (ns, pod, remote, _local) =>
                Promise.resolve({ id: `${ns}/${pod}/${remote}`, localPort: 54321, remotePort: remote }),
        });
        try {
            const res = await jsonRequest(base, 'POST', {
                namespace: 'default',
                podName: 'nginx',
                remotePort: 80,
            });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
            assert.equal(data.id, 'default/nginx/80');
            assert.equal(data.localPort, 54321);
        } finally {
            restore();
        }
    }));

test('forwardRoutes - handles create failure gracefully', () =>
    withRouter('/api/portforward', forwardRoutes, async (base) => {
        const restore = stubMethods(forwardService, {
            createForward: () => Promise.reject(new Error('Port already in use')),
        });
        try {
            const res = await jsonRequest(base, 'POST', {
                namespace: 'default',
                podName: 'nginx',
                remotePort: 80,
            });
            assert.equal(res.status, 500);
            const data = await res.json();
            assert.equal(data.error, 'Port already in use');
        } finally {
            restore();
        }
    }));

test('forwardRoutes - deletes port forward', () =>
    withRouter('/api/portforward', forwardRoutes, async (base) => {
        let deletedId = null;
        const restore = stubMethods(forwardService, {
            deleteForward: (id) => {
                deletedId = id;
                return id === 'default/nginx/80';
            },
        });
        try {
            const successRes = await jsonRequest(base, 'DELETE', { id: 'default/nginx/80' });
            assert.equal(successRes.status, 200);
            assert.equal(deletedId, 'default/nginx/80');

            const notFoundRes = await jsonRequest(base, 'DELETE', { id: 'unknown/forward' });
            assert.equal(notFoundRes.status, 404);
        } finally {
            restore();
        }
    }));
