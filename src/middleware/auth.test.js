const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PERISCOPE_API_KEY = 'secret-key';
const authService = require('../services/authService');
const { authMiddleware, wsAuthCheck, safeEqual } = require('./auth');

function run(req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ status: this.statusCode, body });
            },
        };
        authMiddleware({ ip: '1.2.3.4', originalUrl: req.path, headers: {}, ...req }, res, () =>
            resolve({ status: 200, next: true }),
        );
    });
}

function withAuth({ enabled, sessions = [] }, fn) {
    const origEnabled = authService.isAuthEnabled;
    const origVerify = authService.verifySession;
    authService.isAuthEnabled = () => enabled;
    authService.verifySession = (token) => sessions.includes(token);
    return Promise.resolve(fn()).finally(() => {
        authService.isAuthEnabled = origEnabled;
        authService.verifySession = origVerify;
    });
}

test('safeEqual compares in constant time and rejects length mismatches', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
});

test('public endpoints bypass authentication', () =>
    withAuth({ enabled: true }, async () => {
        for (const path of ['/auth/login', '/auth/status', '/config']) {
            assert.equal((await run({ path })).next, true, path);
        }
    }));

test('requests without credentials are rejected when an API key is configured', () =>
    withAuth({ enabled: false }, async () => {
        const out = await run({ path: '/kube/pods' });
        assert.equal(out.status, 401);
    }));

test('a valid API key bearer token is accepted', () =>
    withAuth({ enabled: false }, async () => {
        const ok = await run({ path: '/kube/pods', headers: { authorization: 'Bearer secret-key' } });
        assert.equal(ok.next, true);
        const bad = await run({ path: '/kube/pods', headers: { authorization: 'Bearer nope' } });
        assert.equal(bad.status, 401);
    }));

test('a valid session token is accepted only when built-in auth is enabled', () =>
    withAuth({ enabled: true, sessions: ['sess-1'] }, async () => {
        const ok = await run({ path: '/kube/pods', headers: { authorization: 'Bearer sess-1' } });
        assert.equal(ok.next, true);
        const bad = await run({ path: '/kube/pods', headers: { authorization: 'Bearer sess-2' } });
        assert.equal(bad.status, 401);
    }));

test('non-bearer authorization schemes are rejected', () =>
    withAuth({ enabled: false }, async () => {
        const out = await run({ path: '/kube/pods', headers: { authorization: 'Basic secret-key' } });
        assert.equal(out.status, 401);
    }));

test('wsAuthCheck validates the token query parameter', () =>
    withAuth({ enabled: true, sessions: ['sess-1'] }, () => {
        const req = (token) => ({ url: `/api/logs/ws${token ? `?token=${token}` : ''}`, headers: { host: 'x' } });
        assert.equal(wsAuthCheck(req('sess-1')), true);
        assert.equal(wsAuthCheck(req('secret-key')), true);
        assert.equal(wsAuthCheck(req('wrong')), false);
        assert.equal(wsAuthCheck(req()), false);
    }));

test('wsAuthCheck requires the API key when only the key is configured', () =>
    withAuth({ enabled: false }, () => {
        const req = (token) => ({ url: `/ws${token ? `?token=${token}` : ''}`, headers: { host: 'x' } });
        assert.equal(wsAuthCheck(req('secret-key')), true);
        assert.equal(wsAuthCheck(req('nope')), false);
        assert.equal(wsAuthCheck(req()), false);
    }));
