const test = require('node:test');
const assert = require('node:assert');
const exec = require('../utils/exec');

// Mock exec.run before requiring helmService
let mockRunCalls = [];
let mockRunResponse = { stdout: '[]', stderr: '' };

exec.run = async (file, args, opts) => {
    mockRunCalls.push({ file, args, opts });
    if (typeof mockRunResponse === 'function') {
        return mockRunResponse(file, args, opts);
    }
    return mockRunResponse;
};

// Require helmService
const helmService = require('./helmService');

test('helmService.listReleases - all namespaces', async () => {
    mockRunCalls = [];
    mockRunResponse = {
        stdout: JSON.stringify([
            { name: 'test-release', namespace: 'default', updated: '2026-06-25', status: 'deployed' }
        ])
    };

    const releases = await helmService.listReleases('all');

    assert.strictEqual(mockRunCalls.length, 1);
    assert.strictEqual(mockRunCalls[0].file, 'helm');
    assert.deepStrictEqual(mockRunCalls[0].args, ['list', '--all-namespaces', '-o', 'json']);

    assert.strictEqual(releases.length, 1);
    assert.strictEqual(releases[0].name, 'test-release');
    assert.strictEqual(releases[0].metadata.uid, 'helm-default-test-release');
});

test('helmService.listReleases - specific namespace', async () => {
    mockRunCalls = [];
    mockRunResponse = { stdout: JSON.stringify([]) };

    await helmService.listReleases('my-namespace');

    assert.strictEqual(mockRunCalls.length, 1);
    assert.deepStrictEqual(mockRunCalls[0].args, ['list', '--namespace', 'my-namespace', '-o', 'json']);
});

test('helmService.getValues - defaults and with revision', async () => {
    mockRunCalls = [];
    mockRunResponse = { stdout: '{"key": "value"}' };

    const values = await helmService.getValues('ns', 'my-release');
    assert.deepStrictEqual(values, { key: 'value' });
    assert.deepStrictEqual(mockRunCalls[0].args, ['get', 'values', 'my-release', '--namespace', 'ns', '-o', 'json']);

    mockRunCalls = [];
    await helmService.getValues('ns', 'my-release', 2);
    assert.deepStrictEqual(mockRunCalls[0].args, ['get', 'values', 'my-release', '--revision', '2', '--namespace', 'ns', '-o', 'json']);
});

test('helmService.rollback', async () => {
    mockRunCalls = [];
    mockRunResponse = { stdout: 'Rollback successful' };

    await helmService.rollback('ns', 'my-release', 3);
    assert.deepStrictEqual(mockRunCalls[0].args, ['rollback', 'my-release', '3', '--namespace', 'ns']);
});
