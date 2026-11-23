const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const opsRoutes = require('./opsRoutes');
const workloadService = require('../services/workloadService');
const rolloutService = require('../services/rolloutService');

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/kube', opsRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        await fn(`http://127.0.0.1:${server.address().port}/api/kube`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const hostile = ['..%2F..%2Fetc', 'a%3Bb', 'a%20b', '%24(id)'];

test('node actions reject names with path or shell metacharacters', () =>
    withServer(async (base) => {
        let called = 0;
        const original = workloadService.setNodeCordon;
        workloadService.setNodeCordon = () => {
            called += 1;
            return Promise.resolve({ message: 'x' });
        };
        try {
            for (const name of hostile) {
                const res = await fetch(`${base}/nodes/${name}/cordon`, { method: 'PUT' });
                assert.equal(res.status, 400, name);
            }
            assert.equal(called, 0);
            const ok = await fetch(`${base}/nodes/worker-1/cordon`, { method: 'PUT' });
            assert.equal(ok.status, 200);
            assert.equal(called, 1);
        } finally {
            workloadService.setNodeCordon = original;
        }
    }));

test('workload actions only accept known kinds and valid names', () =>
    withServer(async (base) => {
        const bad = await fetch(`${base}/workloads/pods/default/app/restart`, { method: 'PUT' });
        assert.equal(bad.status, 400);
        for (const name of hostile) {
            const res = await fetch(`${base}/workloads/deployments/default/${name}/restart`, { method: 'PUT' });
            assert.equal(res.status, 400, name);
        }
        const res = await fetch(`${base}/workloads/deployments/bad%3Bns/app/scale`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ replicas: 2 }),
        });
        assert.equal(res.status, 400);
    }));

test('rollback validates revision and name', () =>
    withServer(async (base) => {
        const original = rolloutService.rollback;
        let args;
        rolloutService.rollback = (...a) => {
            args = a;
            return Promise.resolve({ message: 'ok' });
        };
        try {
            const post = (name, body) =>
                fetch(`${base}/resource/deployments/default/${name}/rollback`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body),
                });
            assert.equal((await post('a%3Bb', { revision: 1 })).status, 400);
            assert.equal((await post('app', { revision: 2 })).status, 200);
            assert.deepEqual(args, ['default', 'app', 2]);
        } finally {
            rolloutService.rollback = original;
        }
    }));

test('dry-run requires yaml and validates the target', () =>
    withServer(async (base) => {
        const post = (path, body) =>
            fetch(`${base}${path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        assert.equal((await post('/resource/deployments/default/app/dry-run', {})).status, 400);
        assert.equal((await post('/resource/deployments/default/a%3Bb/dry-run', { yaml: 'a: b' })).status, 400);
        assert.equal((await post('/resource/dep%3Bloy/default/app/dry-run', { yaml: 'a: b' })).status, 400);
    }));
