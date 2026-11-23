const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const calls = [];
let runImpl = () => Promise.resolve({ stdout: 'ok\n', stderr: '' });
let spawnImpl = () => ({ code: 0, stdout: 'applied', stderr: '' });
const spawned = [];

const execPath = require.resolve('../utils/exec');
require.cache[execPath] = {
    id: execPath,
    filename: execPath,
    loaded: true,
    exports: {
        run: (file, args) => {
            calls.push([file, ...args]);
            return runImpl(file, args);
        },
        spawnSafe: (file, args) => {
            const result = spawnImpl(file, args);
            const child = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.stdin = {
                written: '',
                write(chunk) {
                    this.written += chunk;
                },
                end() {
                    setImmediate(() => {
                        if (result.error) return child.emit('error', result.error);
                        child.stdout.emit('data', Buffer.from(result.stdout));
                        child.stderr.emit('data', Buffer.from(result.stderr));
                        child.emit('close', result.code);
                    });
                },
            };
            spawned.push({ file, args, child });
            return child;
        },
    },
};

const workload = require('./workloadService');

test.beforeEach(() => {
    calls.length = 0;
    spawned.length = 0;
    runImpl = () => Promise.resolve({ stdout: 'ok\n', stderr: '' });
    spawnImpl = () => ({ code: 0, stdout: 'applied', stderr: '' });
});

test('restart and scale shell out to kubectl with arguments, never a shell string', async () => {
    await workload.restart('prod', 'api');
    await workload.scale('prod', 'api', '3');
    assert.deepEqual(calls[0], ['kubectl', 'rollout', 'restart', 'deployment/api', '-n', 'prod']);
    assert.deepEqual(calls[1], ['kubectl', 'scale', 'deployment/api', '--replicas=3', '-n', 'prod']);
});

test('stop records the previous replica count then scales to zero', async () => {
    runImpl = (file, args) => Promise.resolve({ stdout: args.includes('jsonpath={.spec.replicas}') ? '4' : '' });
    const out = await workload.stop('prod', 'api');
    assert.equal(out.previousReplicas, 4);
    assert.ok(calls.some((c) => c.includes('periscope-previous-replicas=4')));
    assert.ok(calls.some((c) => c.includes('--replicas=0')));
});

test('stop falls back to one replica when the lookup fails', async () => {
    runImpl = (file, args) => (args[0] === 'get' ? Promise.reject(new Error('boom')) : Promise.resolve({ stdout: '' }));
    assert.equal((await workload.stop('prod', 'api')).previousReplicas, 1);
});

test('start restores the saved replica count, else the requested one, else one', async () => {
    runImpl = () => Promise.resolve({ stdout: '5' });
    assert.equal((await workload.start('prod', 'api', 2)).replicas, 5);
    runImpl = () => Promise.resolve({ stdout: '' });
    assert.equal((await workload.start('prod', 'api', 2)).replicas, 2);
    assert.equal((await workload.start('prod', 'api', undefined)).replicas, 1);
});

test('deleteResource omits the namespace flag for cluster-scoped kinds', async () => {
    await workload.deleteResource('nodes', 'default', 'n1');
    await workload.deleteResource('pods', 'prod', 'p1');
    await workload.deleteResource('pods', 'all', 'p2');
    assert.deepEqual(calls[0], ['kubectl', 'delete', 'nodes', 'n1']);
    assert.deepEqual(calls[1], ['kubectl', 'delete', 'pods', 'p1', '-n', 'prod']);
    assert.deepEqual(calls[2], ['kubectl', 'delete', 'pods', 'p2']);
});

test('restartWorkload supports deployments, statefulsets and daemonsets only', async () => {
    await workload.restartWorkload('statefulsets', 'prod', 'db');
    assert.deepEqual(calls[0], ['kubectl', 'rollout', 'restart', 'statefulset/db', '-n', 'prod']);
    await assert.rejects(() => workload.restartWorkload('pods', 'prod', 'x'), { statusCode: 400 });
    assert.equal(calls.length, 1);
});

test('scaleWorkload rejects daemonsets and invalid replica counts', async () => {
    await assert.rejects(() => workload.scaleWorkload('daemonsets', 'prod', 'x', 1), { statusCode: 400 });
    for (const bad of [-1, 1.5, 'abc', NaN]) {
        await assert.rejects(() => workload.scaleWorkload('statefulsets', 'prod', 'db', bad), { statusCode: 400 });
    }
    assert.equal(calls.length, 0);
    await workload.scaleWorkload('statefulsets', 'prod', 'db', 0);
    assert.deepEqual(calls[0], ['kubectl', 'scale', 'statefulset/db', '--replicas=0', '-n', 'prod']);
});

test('cordon, uncordon and drain use the expected kubectl verbs', async () => {
    await workload.setNodeCordon('n1', true);
    await workload.setNodeCordon('n1', false);
    await workload.drainNode('n1');
    assert.deepEqual(calls[0], ['kubectl', 'cordon', 'n1']);
    assert.deepEqual(calls[1], ['kubectl', 'uncordon', 'n1']);
    assert.deepEqual(calls[2], [
        'kubectl',
        'drain',
        'n1',
        '--ignore-daemonsets',
        '--delete-emptydir-data',
        '--timeout=120s',
    ]);
});

test('applyYaml pipes the manifest over stdin and fills in missing type metadata', async () => {
    const out = await workload.applyYaml('deployments', 'prod', 'metadata:\n  name: api\n');
    assert.equal(out.message, 'applied');
    assert.deepEqual(spawned[0].args, ['apply', '-f', '-', '-n', 'prod']);
    assert.match(spawned[0].child.stdin.written, /apiVersion: apps\/v1/);
    assert.match(spawned[0].child.stdin.written, /kind: Deployment/);
});

test('applyYaml omits -n for cluster-wide scopes and surfaces kubectl errors', async () => {
    await workload.applyYaml('nodes', 'undefined', 'kind: Node\napiVersion: v1\n');
    assert.deepEqual(spawned[0].args, ['apply', '-f', '-']);
    spawnImpl = () => ({ code: 1, stdout: '', stderr: 'invalid spec' });
    await assert.rejects(() => workload.applyYaml('pods', 'prod', 'x: y'), /invalid spec/);
});

test('dryRunYaml reports validity without throwing', async () => {
    const ok = await workload.dryRunYaml('pods', 'prod', 'x: y');
    assert.equal(ok.valid, true);
    assert.ok(spawned[0].args.includes('--dry-run=server'));
    spawnImpl = () => ({ code: 1, stdout: '', stderr: 'denied by webhook' });
    const bad = await workload.dryRunYaml('pods', 'prod', 'x: y');
    assert.deepEqual(bad, { valid: false, message: 'denied by webhook' });
});

test('applyYaml rejects when kubectl cannot be spawned', async () => {
    spawnImpl = () => ({ error: new Error('ENOENT') });
    await assert.rejects(() => workload.applyYaml('pods', 'prod', 'x: y'), /ENOENT/);
});
