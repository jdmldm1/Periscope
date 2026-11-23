const test = require('node:test');
const assert = require('node:assert');

const exec = require('../utils/exec');
const calls = [];
exec.run = async (file, args) => {
    calls.push([file, ...args]);
    return { stdout: '', stderr: '' };
};
const pvcService = require('./pvcService');
pvcService.ensureHelperPod = async () => 'helper';

test('PVC browser paths stay inside the /data mount', () => {
    assert.strictEqual(pvcService.dataPath('/'), '/data/');
    assert.strictEqual(pvcService.dataPath(''), '/data/');
    assert.strictEqual(pvcService.dataPath('logs/app.log'), '/data/logs/app.log');
    assert.strictEqual(pvcService.dataPath('/../../etc/passwd'), '/data/etc/passwd');
    assert.strictEqual(pvcService.dataPath('a/../../b'), '/data/b');
});

test('PVC browser paths are passed as arguments, never spliced into the script', async () => {
    calls.length = 0;
    const hostile = '/x"; rm -rf /data; echo "$(id)';
    await pvcService.viewFile('ns', 'pvc', hostile);
    await pvcService.deleteFile('ns', 'pvc', hostile);
    await pvcService.listFiles('ns', 'pvc', hostile);
    assert.strictEqual(calls.length, 3);
    for (const args of calls) {
        assert.strictEqual(args[0], 'kubectl');
        const script = args[args.indexOf('-c', args.indexOf('--')) + 1];
        assert.ok(!script.includes('$(id)') && !script.includes('rm -rf /data;'), script);
        assert.strictEqual(args.at(-1), '/data/x"; rm -rf /data; echo "$(id)');
    }
});
