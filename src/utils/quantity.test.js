const test = require('node:test');
const assert = require('node:assert/strict');
const { cpuMillis, memBytes, parseQuantity } = require('./quantity');

test('cpuMillis handles cores, millicores, micro and nano cores', () => {
    assert.equal(cpuMillis('1'), 1000);
    assert.equal(cpuMillis('250m'), 250);
    assert.equal(cpuMillis('0.5'), 500);
    assert.equal(cpuMillis('1500000n'), 2);
    assert.equal(cpuMillis('2000u'), 2);
});

test('memBytes handles binary and decimal suffixes', () => {
    assert.equal(memBytes('128Mi'), 128 * 1024 * 1024);
    assert.equal(memBytes('1Gi'), 1024 ** 3);
    assert.equal(memBytes('500M'), 500e6);
    assert.equal(memBytes('1k'), 1000);
    assert.equal(memBytes('1e3'), 1000);
    assert.equal(memBytes('2048'), 2048);
});

test('parseQuantity returns 0 for empty or malformed input', () => {
    assert.equal(parseQuantity(undefined), 0);
    assert.equal(parseQuantity(''), 0);
    assert.equal(parseQuantity('abc'), 0);
    assert.equal(parseQuantity('12Zi'), 0);
});
