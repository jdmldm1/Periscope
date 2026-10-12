const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertRef, safeUploadName, resolveUploadPath, OrasInputError } = require('./oras');
const { runWithStdin } = require('./exec');

test('assertRef accepts normal OCI references', () => {
    for (const ref of ['ghcr.io/jdmldm1/pkg:1.0', 'registry.local:5000/a/b@sha256:abc123', 'localhost/x']) {
        assert.strictEqual(assertRef(ref), ref);
    }
});

test('assertRef rejects shell metacharacters, flags and non-strings', () => {
    for (const ref of ['', '-o/etc', 'a b', 'a;rm -rf /', 'a$(id)', 'a`id`', 'a"b', "a'b", 'a\nb', 'x'.repeat(513), null, 42]) {
        assert.throws(() => assertRef(ref), OrasInputError, String(ref));
    }
});

test('safeUploadName strips directories and unsafe characters', () => {
    assert.strictEqual(safeUploadName('../../etc/passwd'), 'passwd');
    assert.strictEqual(safeUploadName('my pkg (1).tar.zst'), 'my_pkg__1_.tar.zst');
    assert.strictEqual(safeUploadName('--flag'), 'flag');
    assert.strictEqual(safeUploadName('.hidden'), 'hidden');
    assert.match(safeUploadName(undefined), /^oras-upload-\d+$/);
});

test('resolveUploadPath only allows files directly inside the upload dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oras-test-'));
    try {
        const inside = path.join(dir, 'a.tar');
        fs.writeFileSync(inside, 'x');
        assert.strictEqual(resolveUploadPath(inside, dir), fs.realpathSync(inside));
        assert.throws(() => resolveUploadPath('/etc/passwd', dir), OrasInputError);
        assert.throws(() => resolveUploadPath(path.join(dir, '..', 'x'), dir), OrasInputError);
        assert.throws(() => resolveUploadPath('', dir), OrasInputError);
        // A symlink inside the dir that points outside must not be followed.
        const link = path.join(dir, 'link');
        fs.symlinkSync('/etc/passwd', link);
        assert.throws(() => resolveUploadPath(link, dir), OrasInputError);
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('runWithStdin feeds input to the child without a shell', async () => {
    const secret = '$(touch /tmp/should-not-exist) `id`';
    const { stdout } = await runWithStdin('cat', [], secret);
    assert.strictEqual(stdout, secret);
});
