const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTlsSecret, parseCertManagerCertificate, statusFor, summarize } = require('./certService');

test('statusFor buckets days remaining', () => {
    assert.equal(statusFor(-1), 'expired');
    assert.equal(statusFor(3), 'critical');
    assert.equal(statusFor(20), 'warning');
    assert.equal(statusFor(90), 'ok');
});

test('parseTlsSecret skips secrets without tls.crt and flags unparsable ones', () => {
    assert.equal(parseTlsSecret({ metadata: { name: 'a', namespace: 'n' }, data: {} }), null);
    const bad = parseTlsSecret({
        metadata: { name: 'a', namespace: 'n' },
        data: { 'tls.crt': Buffer.from('not a cert').toString('base64') },
    });
    assert.equal(bad.status, 'invalid');
});

test('parseTlsSecret never returns key material', () => {
    const out = parseTlsSecret({
        metadata: { name: 'a', namespace: 'n' },
        data: { 'tls.crt': 'AAAA', 'tls.key': 'c2VjcmV0' },
    });
    assert.equal(JSON.stringify(out).includes('c2VjcmV0'), false);
});

test('parseCertManagerCertificate computes days left and readiness', () => {
    const now = Date.parse('2030-01-01T00:00:00Z');
    const out = parseCertManagerCertificate(
        {
            metadata: { name: 'web', namespace: 'prod' },
            spec: { secretName: 'web-tls', issuerRef: { kind: 'ClusterIssuer', name: 'le' }, dnsNames: ['a.example'] },
            status: { notAfter: '2030-01-11T00:00:00Z', conditions: [{ type: 'Ready', status: 'True' }] },
        },
        now,
    );
    assert.equal(out.daysLeft, 10);
    assert.equal(out.status, 'warning');
    assert.equal(out.ready, true);
    assert.equal(out.issuer, 'ClusterIssuer/le');
});

test('summarize counts statuses', () => {
    const s = summarize([{ status: 'ok' }, { status: 'expired' }, { status: 'invalid' }]);
    assert.deepEqual(s, { total: 3, expired: 1, critical: 0, warning: 0, ok: 1, other: 1 });
});
