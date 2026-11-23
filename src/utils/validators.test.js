const test = require('node:test');
const assert = require('node:assert');
const { queryString } = require('./validators');

test('queryString returns a single string or undefined', () => {
    assert.strictEqual(queryString('a'), 'a');
    assert.strictEqual(queryString(['a', 'b']), 'a');
    assert.strictEqual(queryString(undefined), undefined);
    assert.strictEqual(queryString({ $ne: 'x' }), undefined);
    assert.strictEqual(queryString([{ a: 1 }]), undefined);
});
