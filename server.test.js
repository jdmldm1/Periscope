const test = require('node:test');
const assert = require('node:assert');

test('Backend - Kubescape severity mapper helper test', (t) => {
    const mapSeverity = (severity) => {
        if (severity === 'Critical') return 'Critical';
        if (severity === 'High') return 'Error';
        if (severity === 'Medium') return 'Warning';
        if (severity === 'Low') return 'Info';
        return 'Warning';
    };

    assert.strictEqual(mapSeverity('Critical'), 'Critical');
    assert.strictEqual(mapSeverity('High'), 'Error');
    assert.strictEqual(mapSeverity('Medium'), 'Warning');
    assert.strictEqual(mapSeverity('Low'), 'Info');
    assert.strictEqual(mapSeverity('Unknown'), 'Warning');
});

test('Backend - Compliance score grade mapper test', (t) => {
    const getGrade = (score) => {
        if (score >= 95) return 'A+';
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    };

    assert.strictEqual(getGrade(97), 'A+');
    assert.strictEqual(getGrade(92), 'A');
    assert.strictEqual(getGrade(85), 'B');
    assert.strictEqual(getGrade(72), 'C');
    assert.strictEqual(getGrade(64), 'D');
    assert.strictEqual(getGrade(45), 'F');
});
