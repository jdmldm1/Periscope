const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const authService = require('./authService');

test('authService - verifies default credentials', () => {
    // Default username and password
    assert.strictEqual(authService.isDefaultPassword(), true);
    assert.ok(authService.verifyCredentials('admin', 'periscope'));
    assert.ok(!authService.verifyCredentials('admin', 'wrongpassword'));
    assert.ok(!authService.verifyCredentials('user', 'periscope'));
});

test('authService - allows changing password', () => {
    // Change password to 'secret'
    authService.changePassword('secret');
    
    assert.strictEqual(authService.isDefaultPassword(), false);
    assert.ok(authService.verifyCredentials('admin', 'secret'));
    assert.ok(!authService.verifyCredentials('admin', 'periscope'));
    
    // Invalidate sessions on password change
    const token = authService.createSession();
    assert.ok(authService.verifySession(token));
    
    authService.changePassword('newsecret');
    assert.ok(!authService.verifySession(token)); // should be cleared
    assert.ok(authService.verifyCredentials('admin', 'newsecret'));
});

test('authService - manages sessions', () => {
    const token = authService.createSession();
    assert.ok(token);
    assert.strictEqual(authService.verifySession(token), true);
    
    authService.destroySession(token);
    assert.strictEqual(authService.verifySession(token), false);
});
