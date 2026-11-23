const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'periscope-backups-'));
const backupService = require('./backupService');

test.after(() => fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true }));

test('backup names cannot escape the backup directory', () => {
    for (const bad of ['../../etc/kubernetes/admin', '..', '.hidden', 'a/b', 'a\\b', '', null, 'x'.repeat(300)]) {
        assert.throws(() => backupService.backupPath(bad), /Invalid backup name/, String(bad));
        assert.throws(() => backupService.deleteBackup(bad), /Invalid backup name/, String(bad));
    }
    assert.strictEqual(
        path.dirname(backupService.backupPath('nightly-2026-01-01T00-00-00-000Z')),
        process.env.BACKUP_DIR,
    );
});

test('backup labels are reduced to a safe file name prefix', () => {
    assert.strictEqual(backupService.safeLabel('../../tmp/x'), 'tmp-x');
    assert.strictEqual(backupService.safeLabel(''), 'backup');
    assert.strictEqual(backupService.safeLabel('prod east'), 'prod-east');
});
