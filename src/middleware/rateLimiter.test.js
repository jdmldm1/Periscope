const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('./rateLimiter');

function hit(limiter, ip) {
    let status = 200;
    let passed = false;
    limiter(
        { ip },
        {
            status(code) {
                status = code;
                return this;
            },
            json() {},
        },
        () => {
            passed = true;
        },
    );
    return { status, passed };
}

test('allows requests up to the limit then responds 429', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 });
    for (let i = 0; i < 3; i++) assert.equal(hit(limiter, '10.0.0.1').passed, true);
    const blocked = hit(limiter, '10.0.0.1');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.status, 429);
});

test('tracks each client address separately', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    assert.equal(hit(limiter, 'a').passed, true);
    assert.equal(hit(limiter, 'a').passed, false);
    assert.equal(hit(limiter, 'b').passed, true);
});

test('starts a fresh window once the previous one expires', (t) => {
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
    assert.equal(hit(limiter, 'a').passed, true);
    assert.equal(hit(limiter, 'a').passed, false);
    now += 1500;
    assert.equal(hit(limiter, 'a').passed, true);
});
