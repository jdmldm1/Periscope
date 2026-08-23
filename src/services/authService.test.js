const test = require('node:test');
const assert = require('node:assert');
const authService = require('./authService');
test('authService - verifies default credentials', () => {
    authService.resetConfig();
    assert.strictEqual(authService.isDefaultPassword(), true);
    assert.ok(authService.verifyCredentials('admin', 'periscope'));
    assert.ok(!authService.verifyCredentials('admin', 'wrongpassword'));
    assert.ok(!authService.verifyCredentials('user', 'periscope'));
});
test('authService - allows changing password', () => {
    authService.resetConfig();
    authService.changePassword('secret');
    assert.strictEqual(authService.isDefaultPassword(), false);
    assert.ok(authService.verifyCredentials('admin', 'secret'));
    assert.ok(!authService.verifyCredentials('admin', 'periscope'));
    const token = authService.createSession();
    assert.ok(authService.verifySession(token));
    authService.changePassword('newsecret');
    assert.ok(!authService.verifySession(token));
    assert.ok(authService.verifyCredentials('admin', 'newsecret'));
});
test('authService - manages sessions', () => {
    authService.resetConfig();
    const token = authService.createSession();
    assert.ok(token);
    assert.strictEqual(authService.verifySession(token), true);
    authService.destroySession(token);
    assert.strictEqual(authService.verifySession(token), false);
});
test('authService - clean up disk config', () => {
    authService.resetConfig();
});
