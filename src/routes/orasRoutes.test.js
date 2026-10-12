const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../utils/oras');
const orasRoutes = require('./orasRoutes');

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/api', orasRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        await fn(`http://127.0.0.1:${server.address().port}/api`);
    }
    finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const post = (base, route, body, headers = {}) =>
    fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('push rejects injection-style refs before running anything', () => withServer(async (base) => {
    const res = await post(base, '/oras/push', { ref: 'reg/x$(touch /tmp/pwned)', filepath: '/etc/hostname' });
    assert.strictEqual(res.status, 400);
}));

test('push refuses files outside the upload directory and leaves them alone', () => withServer(async (base) => {
    const res = await post(base, '/oras/push', { ref: 'registry.local/x:1', filepath: '/etc/hostname' });
    assert.strictEqual(res.status, 400);
    assert.ok(fs.existsSync('/etc/hostname'));
}));

test('upload confines a traversal file name to the upload directory', () => withServer(async (base) => {
    const res = await fetch(`${base}/oras/upload`, {
        method: 'POST',
        headers: { 'x-file-name': '../../../tmp/escaped.txt', 'content-type': 'application/octet-stream' },
        body: 'data',
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(path.dirname(body.filepath), UPLOAD_DIR);
    assert.ok(!fs.existsSync('/tmp/escaped.txt'));
    fs.rmSync(body.filepath, { force: true });
}));

test('pull rejects invalid refs', () => withServer(async (base) => {
    assert.strictEqual((await post(base, '/oras/pull', { ref: '--help' })).status, 400);
    assert.strictEqual((await post(base, '/oras/pull', {})).status, 400);
}));
