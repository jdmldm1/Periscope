const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'zarf-ws-'));
const originalCwd = process.cwd();
const zarfRoutes = require('./zarfRoutes');
const zarfService = require('../services/zarfService');

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/zarf', zarfRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    process.chdir(workspace);
    try {
        await fn(`http://127.0.0.1:${server.address().port}/api/zarf`);
    } finally {
        process.chdir(originalCwd);
        await new Promise((resolve) => server.close(resolve));
    }
}

test.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

test('upload keeps a traversal file name inside the workspace', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/upload`, {
            method: 'POST',
            headers: { 'x-file-name': '../../escaped.tar.zst', 'content-type': 'application/octet-stream' },
            body: 'data',
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(path.dirname(body.filepath), process.cwd());
        assert.strictEqual(body.filename, 'escaped.tar.zst');
    }));

test('upload refuses names that are not package archives', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/upload`, {
            method: 'POST',
            headers: { 'x-file-name': 'server.js', 'content-type': 'application/octet-stream' },
            body: 'data',
        });
        assert.strictEqual(res.status, 400);
        assert.ok(!fs.existsSync(path.join(workspace, 'server.js')));
    }));

test('config refuses traversal and non-config names', () =>
    withServer(async (base) => {
        const post = (filename) =>
            fetch(`${base}/config`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ content: 'x: 1', filename }),
            });
        assert.strictEqual((await post('package.json')).status, 400);
        const res = await post('../../evil.yaml');
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(path.dirname(body.filepath), process.cwd());
        assert.strictEqual(body.filename, 'evil.yaml');
    }));

test('rebuild-deploy only accepts an unpack directory inside the workspace', () => {
    process.chdir(workspace);
    try {
        for (const bad of [
            '/',
            '..',
            '"; touch /tmp/pwned; "',
            path.join(workspace, 'other'),
            path.join(workspace, 'zarf-unpack-1', 'x'),
        ]) {
            assert.throws(() => zarfService.resolveUnpackDir(bad), /Invalid unpack directory/, bad);
        }
        const good = path.join(process.cwd(), 'zarf-unpack-1700000000000');
        assert.strictEqual(zarfService.resolveUnpackDir(good), good);
    } finally {
        process.chdir(originalCwd);
    }
});
